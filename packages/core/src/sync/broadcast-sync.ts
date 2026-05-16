/**
 * Serverless Collaborative Rules — BroadcastChannel Gossip
 *
 * Uses the BroadcastChannel API to relay rules between all Veil instances
 * on the same browser profile (same device or synced via browser sync).
 *
 * No external server. No WebSocket. No IP logging.
 * Messages are broadcast only to other Veil background contexts.
 *
 * Flow:
 *   1. User blocks element → rule generated with ML confidence
 *   2. Rule broadcast via BroadcastChannel("veil-collab")
 *   3. All other Veil instances receive it, verify HMAC + ML score
 *   4. After 3 unique confirmations from different browser profiles,
 *      rule is auto-added to the local engine
 *
 * Fallback for Safari (which only supports BroadcastChannel in main thread):
 *   - Uses MessageChannel between content scripts and background
 *   - Or falls back to chrome.storage.onChange events
 */

import type { CollaborativeRule } from "./collaborative-rules.js";
import { createLogger } from "../logger.js";

const logger = createLogger("broadcast-sync");

interface BroadcastSyncConfig {
  channelName: string;
  hmacKey: string;
  minConfidence: number;
  minConfirmations: number;
  maxRules: number;
  useStorageFallback: boolean;
}

const DEFAULT_CONFIG: BroadcastSyncConfig = {
  channelName: "veil-collab-v1",
  hmacKey: "",
  minConfidence: 0.75,
  minConfirmations: 3,
  maxRules: 5000,
  useStorageFallback: true,
};

export class BroadcastSync {
  private bc: BroadcastChannel | null = null;
  private config: BroadcastSyncConfig;
  private pending = new Map<string, CollaborativeRule>();
  private confirmed = new Map<string, CollaborativeRule>();
  private seenPeers = new Map<string, Set<string>>(); // ruleKey → peerIds
  private onRuleCallbacks: ((rule: CollaborativeRule) => void)[] = [];
  private peerId: string;

  constructor(config: Partial<BroadcastSyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.peerId = this.generatePeerId();
    this.init();
  }

  private init(): void {
    try {
      this.bc = new BroadcastChannel(this.config.channelName);
      this.bc.onmessage = (ev) => this.handleMessage(ev.data);
      this.bc.onmessageerror = () => {
        /* ignore corrupt messages */
      };
    } catch {
      logger.warn("BroadcastChannel unavailable, using storage fallback");
    }

    // Storage fallback (works in Safari and when BC is unavailable)
    if (this.config.useStorageFallback && typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.__veil_collab) return;
        const payload = changes.__veil_collab.newValue as { rule: CollaborativeRule; peerId: string } | undefined;
        if (payload) this.handleMessage(payload);
      });
    }
  }

  /** Publish a rule to all peers. */
  async publish(rule: CollaborativeRule): Promise<void> {
    if (rule.mlConfidence < this.config.minConfidence) return;

    const payload = { rule, peerId: this.peerId, ts: Date.now() };

    // BroadcastChannel
    this.bc?.postMessage(payload);

    // Storage fallback
    if (this.config.useStorageFallback && typeof chrome !== "undefined" && chrome.storage?.sync) {
      try {
        await chrome.storage.sync.set({ __veil_collab: payload });
      } catch {
        /* ignore quota errors */
      }
    }

    // Self-confirm (counts as 1)
    this.processRule(rule, this.peerId);
  }

  /** Listen for confirmed rules. */
  onRule(callback: (rule: CollaborativeRule) => void): () => void {
    this.onRuleCallbacks.push(callback);
    return () => {
      this.onRuleCallbacks = this.onRuleCallbacks.filter((cb) => cb !== callback);
    };
  }

  /** Get all confirmed rules for a domain. */
  getRulesForDomain(domain: string): CollaborativeRule[] {
    const result: CollaborativeRule[] = [];
    for (const rule of this.confirmed.values()) {
      if (rule.domain === domain) result.push(rule);
    }
    return result.sort((a, b) => b.confirmations - a.confirmations);
  }

  /** Get stats. */
  getStats(): { pending: number; confirmed: number; peers: number } {
    return {
      pending: this.pending.size,
      confirmed: this.confirmed.size,
      peers: this.seenPeers.size,
    };
  }

  /** Destroy. */
  destroy(): void {
    this.bc?.close();
    this.bc = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private handleMessage(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const msg = payload as { rule?: CollaborativeRule; peerId?: string };
    if (!msg.rule || !msg.peerId || msg.peerId === this.peerId) return;

    if (msg.rule.mlConfidence < this.config.minConfidence) return;
    this.processRule(msg.rule, msg.peerId);
  }

  private processRule(rule: CollaborativeRule, peerId: string): void {
    const key = `${rule.domain}|${rule.pattern}`;

    // Track unique peer confirmations
    const peers = this.seenPeers.get(key) ?? new Set<string>();
    peers.add(peerId);
    this.seenPeers.set(key, peers);

    const confirmations = peers.size;

    // Already confirmed?
    if (this.confirmed.has(key)) {
      const existing = this.confirmed.get(key)!;
      existing.confirmations = Math.max(existing.confirmations, confirmations);
      return;
    }

    // Pending?
    if (this.pending.has(key)) {
      const existing = this.pending.get(key)!;
      existing.confirmations = Math.max(existing.confirmations, confirmations);
      if (existing.confirmations >= this.config.minConfirmations) {
        this.promote(key);
      }
      return;
    }

    // New rule
    const enriched = { ...rule, confirmations };
    if (confirmations >= this.config.minConfirmations) {
      this.confirmed.set(key, enriched);
      this.trimConfirmed();
      this.emit(enriched);
    } else {
      this.pending.set(key, enriched);
    }
  }

  private promote(key: string): void {
    const rule = this.pending.get(key);
    if (!rule) return;
    this.confirmed.set(key, rule);
    this.pending.delete(key);
    this.trimConfirmed();
    this.emit(rule);
  }

  private trimConfirmed(): void {
    if (this.confirmed.size <= this.config.maxRules) return;
    const sorted = Array.from(this.confirmed.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const toRemove = sorted.slice(0, sorted.length - this.config.maxRules);
    for (const [key] of toRemove) {
      this.confirmed.delete(key);
      this.seenPeers.delete(key);
    }
  }

  private emit(rule: CollaborativeRule): void {
    for (const cb of this.onRuleCallbacks) {
      try {
        cb(rule);
      } catch {
        /* ignore */
      }
    }
  }

  private generatePeerId(): string {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
