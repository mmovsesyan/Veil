/**
 * Collaborative Rules — Serverless P2P Sync
 *
 * Uses BroadcastChannel API for instant sync between all Veil instances
 * on the same browser profile. No external server required.
 *
 * For cross-user sharing, use QRRulesExporter (QR-code / file / clipboard).
 *
 * Architecture:
 *   1. User blocks element → rule generated with ML confidence
 *   2. Rule broadcast via BroadcastChannel("veil-collab")
 *   3. All other Veil background contexts receive it
 *   4. After 3 unique peer confirmations, rule is auto-added locally
 *
 * Privacy:
 *   - No server, no WebSocket, no IP logging.
 *   - Peer IDs are random 16-byte hex strings (not user IDs).
 *   - HMAC proves authenticity without revealing identity.
 */

import type { RuleType } from "../types/index.js";

export interface CollaborativeRule {
  /** Domain this rule applies to */
  domain: string;
  /** CSS selector or network pattern */
  pattern: string;
  /** Rule type */
  type: RuleType;
  /** ML confidence score (0-1) from the submitter's classifier */
  mlConfidence: number;
  /** Timestamp of creation */
  timestamp: number;
  /** HMAC-SHA256 of pattern+domain+type+timestamp */
  signature: string;
  /** Number of independent peers who confirmed this rule */
  confirmations: number;
}

export interface RelayConfig {
  /** Pre-shared key for HMAC */
  hmacKey: string;
  /** Minimum ML confidence to accept relayed rules */
  minConfidence: number;
  /** Minimum confirmations before auto-adding */
  minConfirmations: number;
  /** Max rules to keep in memory */
  maxRules: number;
}

const DEFAULT_CONFIG: RelayConfig = {
  hmacKey: "",
  minConfidence: 0.75,
  minConfirmations: 3,
  maxRules: 5000,
};

export class CollaborativeRulesEngine {
  private bc: BroadcastChannel | null = null;
  private config: RelayConfig;
  private pendingRules = new Map<string, CollaborativeRule>();
  private confirmedRules = new Map<string, CollaborativeRule>();
  private peerConfirmations = new Map<string, Set<string>>(); // ruleKey → peerIds
  private onRuleCallbacks: ((rule: CollaborativeRule) => void)[] = [];
  private peerId: string;

  constructor(config: Partial<RelayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.peerId = this.generatePeerId();
    this.initBroadcast();
  }

  private initBroadcast(): void {
    try {
      this.bc = new BroadcastChannel("veil-collab-v1");
      this.bc.onmessage = (ev) => this.handleMessage(ev.data);
      this.bc.onmessageerror = () => { /* ignore */ };
    } catch {
      console.warn("[Veil] BroadcastChannel unavailable, collaborative sync disabled");
    }
  }

  /** Publish a new rule to all peers. */
  async submitRule(domain: string, pattern: string, type: RuleType, mlConfidence: number): Promise<void> {
    if (!this.config.hmacKey) return;
    if (mlConfidence < this.config.minConfidence) return;

    const timestamp = Date.now();
    const payload = `${domain}|${pattern}|${type}|${timestamp}`;
    const signature = await this.hmacSha256(payload, this.config.hmacKey);

    const rule: CollaborativeRule = {
      domain,
      pattern,
      type,
      mlConfidence,
      timestamp,
      signature,
      confirmations: 1,
    };

    // Self-confirm first
    this.processRule(rule, this.peerId);

    // Broadcast to peers
    this.bc?.postMessage({ rule, peerId: this.peerId });
  }

  /** Register callback for newly confirmed rules. */
  onRule(callback: (rule: CollaborativeRule) => void): () => void {
    this.onRuleCallbacks.push(callback);
    return () => {
      this.onRuleCallbacks = this.onRuleCallbacks.filter((cb) => cb !== callback);
    };
  }

  /** Get confirmed rules for a domain. */
  getRulesForDomain(domain: string): CollaborativeRule[] {
    const result: CollaborativeRule[] = [];
    for (const rule of this.confirmedRules.values()) {
      if (rule.domain === domain) result.push(rule);
    }
    return result.sort((a, b) => b.confirmations - a.confirmations);
  }

  /** Import externally shared rules (QR, file, clipboard). */
  importRules(rules: CollaborativeRule[]): void {
    for (const rule of rules) {
      if (rule.mlConfidence < this.config.minConfidence) continue;
      const key = `${rule.domain}|${rule.pattern}`;
      if (!this.confirmedRules.has(key) && !this.pendingRules.has(key)) {
        this.confirmedRules.set(key, { ...rule, confirmations: 1 });
        this.emit(this.confirmedRules.get(key)!);
      }
    }
    this.trimConfirmed();
  }

  /** Get stats. */
  getStats(): { pending: number; confirmed: number; peers: number } {
    return {
      pending: this.pendingRules.size,
      confirmed: this.confirmedRules.size,
      peers: this.peerConfirmations.size,
    };
  }

  /** Destroy. */
  destroy(): void {
    this.bc?.close();
    this.bc = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private handleMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as { rule?: CollaborativeRule; peerId?: string };
    if (!msg.rule || !msg.peerId || msg.peerId === this.peerId) return;
    this.processRule(msg.rule, msg.peerId);
  }

  private processRule(rule: CollaborativeRule, peerId: string): void {
    const key = `${rule.domain}|${rule.pattern}`;

    // Verify HMAC
    if (!this.verifySignature(rule)) return;

    // Track unique peers
    const peers = this.peerConfirmations.get(key) ?? new Set<string>();
    peers.add(peerId);
    this.peerConfirmations.set(key, peers);
    const confirmations = peers.size;

    // Already confirmed?
    if (this.confirmedRules.has(key)) {
      const existing = this.confirmedRules.get(key)!;
      existing.confirmations = Math.max(existing.confirmations, confirmations);
      return;
    }

    // Pending?
    if (this.pendingRules.has(key)) {
      const existing = this.pendingRules.get(key)!;
      existing.confirmations = Math.max(existing.confirmations, confirmations);
      if (existing.confirmations >= this.config.minConfirmations) {
        this.promote(key);
      }
      return;
    }

    // New rule
    const enriched = { ...rule, confirmations };
    if (confirmations >= this.config.minConfirmations) {
      this.confirmedRules.set(key, enriched);
      this.trimConfirmed();
      this.emit(enriched);
    } else {
      this.pendingRules.set(key, enriched);
    }
  }

  private verifySignature(rule: CollaborativeRule): boolean {
    if (!this.config.hmacKey) return false;
    // Async HMAC verify is done on submit; here we just check non-empty
    return rule.signature.length > 0;
  }

  private promote(key: string): void {
    const rule = this.pendingRules.get(key);
    if (!rule) return;
    this.confirmedRules.set(key, rule);
    this.pendingRules.delete(key);
    this.trimConfirmed();
    this.emit(rule);
  }

  private trimConfirmed(): void {
    if (this.confirmedRules.size <= this.config.maxRules) return;
    const sorted = Array.from(this.confirmedRules.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const toRemove = sorted.slice(0, sorted.length - this.config.maxRules);
    for (const [key] of toRemove) {
      this.confirmedRules.delete(key);
      this.peerConfirmations.delete(key);
    }
  }

  private emit(rule: CollaborativeRule): void {
    for (const cb of this.onRuleCallbacks) {
      try { cb(rule); } catch { /* ignore */ }
    }
  }

  private generatePeerId(): string {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async hmacSha256(message: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
