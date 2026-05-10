/**
 * Network request logger for debugging and devtools.
 * Records all blocking decisions for inspection.
 * 
 * Similar to uBlock Origin's "Logger" panel.
 */

import type { NetworkRequest, Rule, BlockDecision } from "../types/index.js";

export interface LogEntry {
  id: number;
  timestamp: number;
  url: string;
  type: string;
  initiator: string;
  target: string;
  blocked: boolean;
  matchedRule: string | null;
  action: string;
  filterListSource: string | null;
}

export class NetworkLogger {
  private entries: LogEntry[] = [];
  private maxEntries: number;
  private nextId = 1;
  private enabled = false;
  private listeners: Array<(entry: LogEntry) => void> = [];

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Enable/disable logging.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.entries = [];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record a blocking decision.
   */
  log(request: NetworkRequest, decision: BlockDecision): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      url: request.url,
      type: request.type,
      initiator: request.initiatorDomain,
      target: request.targetDomain,
      blocked: decision.blocked,
      matchedRule: decision.matchedRule ? this.formatRule(decision.matchedRule) : null,
      action: decision.action,
      filterListSource: decision.matchedRule?.source ?? null,
    };

    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  /**
   * Get all log entries.
   */
  getEntries(filter?: {
    blocked?: boolean;
    type?: string;
    domain?: string;
    search?: string;
  }): LogEntry[] {
    let result = this.entries;

    if (filter) {
      if (filter.blocked !== undefined) {
        result = result.filter((e) => e.blocked === filter.blocked);
      }
      if (filter.type) {
        result = result.filter((e) => e.type === filter.type);
      }
      if (filter.domain) {
        result = result.filter((e) => e.target.includes(filter.domain!));
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        result = result.filter((e) => e.url.toLowerCase().includes(s));
      }
    }

    return result;
  }

  /**
   * Get statistics from log.
   */
  getStats(): {
    total: number;
    blocked: number;
    allowed: number;
    byType: Record<string, { blocked: number; allowed: number }>;
    topBlockedDomains: Array<{ domain: string; count: number }>;
  } {
    const byType: Record<string, { blocked: number; allowed: number }> = {};
    const domainCounts: Record<string, number> = {};
    let blocked = 0;
    let allowed = 0;

    for (const entry of this.entries) {
      if (entry.blocked) {
        blocked++;
        domainCounts[entry.target] = (domainCounts[entry.target] ?? 0) + 1;
      } else {
        allowed++;
      }

      if (!byType[entry.type]) {
        byType[entry.type] = { blocked: 0, allowed: 0 };
      }
      if (entry.blocked) {
        byType[entry.type]!.blocked++;
      } else {
        byType[entry.type]!.allowed++;
      }
    }

    const topBlockedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([domain, count]) => ({ domain, count }));

    return { total: this.entries.length, blocked, allowed, byType, topBlockedDomains };
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Subscribe to new log entries.
   */
  onEntry(callback: (entry: LogEntry) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Export log as text (for sharing/debugging).
   */
  exportAsText(): string {
    return this.entries
      .map((e) => {
        const status = e.blocked ? "BLOCKED" : "ALLOWED";
        const rule = e.matchedRule ? ` [${e.matchedRule}]` : "";
        return `[${new Date(e.timestamp).toISOString()}] ${status} ${e.type} ${e.url}${rule}`;
      })
      .join("\n");
  }

  private formatRule(rule: Rule): string {
    // Simplified rule display
    if (rule.type === "network-allow") return `@@${rule.pattern}`;
    return rule.pattern;
  }
}
