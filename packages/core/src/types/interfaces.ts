/**
 * Core interfaces for the content blocker modules.
 */

import type {
  BlockDecision,
  ConflictCallback,
  CosmeticRule,
  NavigationCallback,
  NetworkRequest,
  ParseResult,
  Rule,
  Settings,
  SettingsChange,
  TabInfo,
} from "./index.js";

// ─── Rule Parser Interface ────────────────────────────────────────────────────

export interface IRuleParser {
  /** Parse a single raw rule string into a Rule object */
  parse(rawRule: string): Rule | null;

  /** Parse a full filter list text into rules */
  parseList(rawText: string): ParseResult;

  /** Format a Rule back into its text representation */
  format(rule: Rule): string;
}

// ─── Blocking Engine Interface ────────────────────────────────────────────────

export interface IBlockingEngine {
  /** Initialize the engine with a set of rules */
  initialize(rules: Rule[]): Promise<void>;

  /** Add rules dynamically. Returns assigned engine rule IDs. */
  addRules(rules: Rule[]): number[];

  /** Remove all rules from a specific source */
  removeRules(sourceId: string): void;

  /** Remove a single rule by its engine ID */
  removeRuleById(id: number): boolean;

  /** Determine whether a request should be blocked */
  shouldBlock(request: NetworkRequest): BlockDecision;

  /** Get cosmetic rules applicable to a domain */
  getCosmeticRules(domain: string): CosmeticRule[];

  /** Return the total number of loaded rules */
  getRuleCount(): number;
}

// ─── Whitelist Manager Interface ──────────────────────────────────────────────

export interface IWhitelistManager {
  /** Add a domain or pattern to the whitelist */
  add(pattern: string): void;

  /** Remove a domain or pattern from the whitelist */
  remove(pattern: string): void;

  /** Check if a domain is whitelisted */
  isWhitelisted(domain: string): boolean;

  /** Get all whitelist entries */
  getAll(): string[];

  /** Clear the entire whitelist */
  clear(): void;
}

// ─── Statistics Tracker Interface ─────────────────────────────────────────────

export interface IStatisticsTracker {
  /** Record a blocked request */
  recordBlocked(tabId: number, domain: string, category: string): void;

  /** Get stats for a specific tab */
  getTabStats(tabId: number): { blocked: number; byCategory: Record<string, number> };

  /** Get daily statistics */
  getDailyStats(date: string): { totalBlocked: number; byCategory: Record<string, number> };

  /** Reset stats for a tab */
  resetTab(tabId: number): void;
}

// ─── Platform Adapter Interface ───────────────────────────────────────────────

export interface IPlatformAdapter {
  /** Initialize the adapter */
  initialize(): Promise<void>;

  /** Apply a full set of rules */
  applyRules(rules: Rule[]): Promise<void>;

  /** Update rules incrementally */
  updateRules(added: Rule[], removed: string[]): Promise<void>;

  /** Get info about the active tab */
  getActiveTabInfo(): Promise<TabInfo>;

  /** Set the badge count for a tab */
  setBadgeCount(tabId: number, count: number): void;

  /** Register a navigation event listener */
  onNavigationEvent(callback: NavigationCallback): void;
}

// ─── Sync Service Interface ───────────────────────────────────────────────────

export interface ISyncService {
  /** Initialize sync with a user ID */
  initialize(userId: string): Promise<void>;

  /** Push local changes to remote */
  push(changes: SettingsChange[]): Promise<void>;

  /** Pull remote settings */
  pull(): Promise<Settings>;

  /** Resolve a conflict between local and remote settings */
  resolveConflict(local: Settings, remote: Settings): Settings;

  /** Register a conflict callback */
  onConflict(callback: ConflictCallback): void;
}
