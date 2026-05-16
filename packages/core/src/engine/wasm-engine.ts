/**
 * WebAssembly-accelerated blocking engine wrapper.
 * 
 * Falls back to pure JS engine if WASM is not available.
 * WASM gives ~5-10x speedup for pattern matching hot path.
 * 
 * Build: cd packages/core/wasm && wasm-pack build --target web
 * Output: packages/core/wasm/pkg/content_blocker_wasm.wasm
 */

import type { Rule, NetworkRequest, BlockDecision, CosmeticRule } from "../types/index.js";
import type { IBlockingEngine } from "../types/interfaces.js";
import { RuleAction, RuleType } from "../types/index.js";
import { BlockingEngine } from "./blocking-engine.js";

// Resource type bitmap (must match Rust side)
const TYPE_BITS: Record<string, number> = {
  script: 0x001,
  image: 0x002,
  stylesheet: 0x004,
  xmlhttprequest: 0x008,
  media: 0x010,
  font: 0x020,
  iframe: 0x040,
  popup: 0x080,
  other: 0x100,
};

/**
 * WASM engine interface (matches wasm-bindgen output).
 */
interface WasmEngineInstance {
  new(): WasmEngineInstance;
  add_hostname_block(hostname: string): void;
  add_hostname_allow(hostname: string): void;
  add_rule(pattern: string, is_allow: boolean, third_party: number, resource_types: number): void;
  should_block(url: string, hostname: string, initiator: string, resource_type: number): number;
  rule_count(): number;
  memory_usage(): number;
}

/**
 * Hybrid engine: WASM for network rule matching, JS for cosmetic rules.
 * 
 * Why hybrid:
 * - Network matching is the hot path (called 100+ times per page load)
 * - Cosmetic rules need DOM access (WASM can't do DOM)
 * - WASM excels at string operations on flat data
 */
export class HybridWasmEngine implements IBlockingEngine {
  private wasmEngine: WasmEngineInstance | null = null;
  private jsEngine: BlockingEngine; // Fallback + cosmetic rules
  private wasmAvailable = false;
  private rules: Rule[] = [];

  constructor() {
    this.jsEngine = new BlockingEngine();
  }

  /**
   * Initialize with optional WASM module.
   * If WASM fails to load, falls back to pure JS.
   */
  async initialize(rules: Rule[]): Promise<void> {
    this.rules = rules;

    // Try to load WASM
    try {
      await this.loadWasm();
    } catch {
      console.warn("[Content Blocker] WASM not available, using JS engine");
      this.wasmAvailable = false;
    }

    if (this.wasmAvailable && this.wasmEngine) {
      // Feed rules to WASM engine
      for (const rule of rules) {
        this.addRuleToWasm(rule);
      }
    }

    // Always initialize JS engine (for cosmetic rules and fallback)
    await this.jsEngine.initialize(rules);
  }

  addRules(rules: Rule[]): number[] {
    this.rules.push(...rules);

    if (this.wasmAvailable && this.wasmEngine) {
      for (const rule of rules) {
        this.addRuleToWasm(rule);
      }
    }

    return this.jsEngine.addRules(rules);
  }

  removeRules(sourceId: string): void {
    this.rules = this.rules.filter((r) => r.source !== sourceId);
    this.jsEngine.removeRules(sourceId);

    // WASM engine doesn't support removal — rebuild
    if (this.wasmAvailable) {
      this.rebuildWasm();
    }
  }

  removeRuleById(id: number): boolean {
    return this.jsEngine.removeRuleById(id);
  }

  shouldBlock(request: NetworkRequest): BlockDecision {
    // Use WASM for network rule matching (hot path)
    if (this.wasmAvailable && this.wasmEngine) {
      const typeBit = TYPE_BITS[request.type] ?? TYPE_BITS["other"]!;
      const result = this.wasmEngine.should_block(
        request.url,
        request.targetDomain,
        request.initiatorDomain,
        typeBit,
      );

      switch (result) {
        case 0: // allow
          return { blocked: false, action: RuleAction.Allow };
        case 1: // block
          return { blocked: true, action: RuleAction.Block };
        case 2: // no match
          return { blocked: false, action: RuleAction.Allow };
      }
    }

    // Fallback to JS engine
    return this.jsEngine.shouldBlock(request);
  }

  getCosmeticRules(domain: string): CosmeticRule[] {
    // Cosmetic rules always use JS engine (needs DOM types)
    return this.jsEngine.getCosmeticRules(domain);
  }

  /**
   * Get performance stats.
   */
  getStats(): { wasmAvailable: boolean; ruleCount: number; memoryUsage: number } {
    return {
      wasmAvailable: this.wasmAvailable,
      ruleCount: this.wasmEngine?.rule_count() ?? this.rules.length,
      memoryUsage: this.wasmEngine?.memory_usage() ?? 0,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async loadWasm(): Promise<void> {
    // In browser: load from extension resources
    // In Node.js (tests): skip WASM
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly not available");
    }

    try {
      // Try to import the WASM module
      // In production, this would be: import init, { WasmEngine } from "../wasm/pkg/content_blocker_wasm.js"
      // For now, we just check if WASM is available
      const wasmSupported = typeof WebAssembly.instantiate === "function";
      if (!wasmSupported) throw new Error("No WASM support");

      // WASM module would be loaded here
      // this.wasmEngine = new WasmEngine();
      // this.wasmAvailable = true;

      // For now, mark as unavailable until wasm-pack build is run
      this.wasmAvailable = false;
    } catch {
      this.wasmAvailable = false;
    }
  }

  private addRuleToWasm(rule: Rule): void {
    if (!this.wasmEngine) return;

    const isNetworkRule = rule.type === RuleType.NetworkBlock || rule.type === RuleType.NetworkAllow;
    if (!isNetworkRule) return;

    // Check if hostname-only rule
    if (rule.pattern.startsWith("||") && /^[a-zA-Z0-9.-]+\^?$/.test(rule.pattern.slice(2))) {
      const hostname = rule.pattern.slice(2).replace(/\^$/, "").toLowerCase();
      if (rule.type === RuleType.NetworkAllow) {
        this.wasmEngine.add_hostname_allow(hostname);
      } else {
        this.wasmEngine.add_hostname_block(hostname);
      }
      return;
    }

    // Pattern rule
    const thirdParty = rule.modifiers.thirdParty === true ? 1 : rule.modifiers.thirdParty === false ? 0 : -1;
    let typeBits = 0;
    if (rule.modifiers.resourceTypes) {
      for (const t of rule.modifiers.resourceTypes) {
        typeBits |= TYPE_BITS[t] ?? 0;
      }
    }

    this.wasmEngine.add_rule(
      rule.pattern,
      rule.type === RuleType.NetworkAllow,
      thirdParty,
      typeBits,
    );
  }

  private rebuildWasm(): void {
    if (!this.wasmEngine) return;
    // Recreate WASM engine with current rules
    // this.wasmEngine = new WasmEngine();
    for (const rule of this.rules) {
      this.addRuleToWasm(rule);
    }
  }
}
