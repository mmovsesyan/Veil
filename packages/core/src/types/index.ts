/**
 * Core types and interfaces for the content blocker.
 */

// ─── Rule Types ───────────────────────────────────────────────────────────────

export enum RuleType {
  NetworkBlock = "network-block",
  NetworkAllow = "network-allow",
  CosmeticHide = "cosmetic-hide",
  CosmeticCSS = "cosmetic-css",
  ScriptBlock = "script-block",
  Comment = "comment",
}

export enum RuleAction {
  Block = "block",
  Allow = "allow",
  Redirect = "redirect",
  CSSDisplayNone = "css-display-none",
  BlockCookies = "block-cookies",
  MakeHTTPS = "make-https",
}

export type ResourceType =
  | "script"
  | "image"
  | "stylesheet"
  | "xmlhttprequest"
  | "media"
  | "font"
  | "iframe"
  | "popup"
  | "other";

export interface RuleModifiers {
  thirdParty?: boolean;
  resourceTypes?: ResourceType[];
  matchCase?: boolean;
  /** Redirect resource name for $redirect modifier (e.g. "noop.js", "1x1.gif") */
  redirect?: string;
  /** Disables a matching rule */
  badfilter?: boolean;
  /** Overrides normal allow rules */
  important?: boolean;
  /** Hides generic cosmetic rules on this domain */
  generichide?: boolean;
  /** Disables all cosmetic rules on this domain */
  elemhide?: boolean;
}

export interface DomainConstraint {
  include?: string[];
  exclude?: string[];
}

export interface Rule {
  id: string;
  type: RuleType;
  pattern: string;
  action: RuleAction;
  modifiers: RuleModifiers;
  domains?: DomainConstraint;
  priority: number;
  source: string;
}

// ─── Filter List Types ────────────────────────────────────────────────────────

export enum FilterCategory {
  Ads = "ads",
  Trackers = "trackers",
  Social = "social",
  Annoyances = "annoyances",
  Regional = "regional",
  Custom = "custom",
}

export interface FilterList {
  id: string;
  name: string;
  category: FilterCategory;
  url: string;
  enabled: boolean;
  lastUpdated: number;
  rulesCount: number;
  checksum: string;
}

// ─── Settings Types ───────────────────────────────────────────────────────────

export interface WhitelistEntry {
  pattern: string;
  addedAt: number;
}

export interface Settings {
  enabled: boolean;
  whitelist: WhitelistEntry[];
  filterLists: FilterList[];
  customRules: string[];
  updateInterval: number;
  syncEnabled: boolean;
  statisticsEnabled: boolean;
  lastSyncTimestamp: number;
}

// ─── Statistics Types ─────────────────────────────────────────────────────────

export interface PageStats {
  tabId: number;
  url: string;
  blocked: number;
  blockedByCategory: Record<FilterCategory, number>;
}

export interface DailyStats {
  date: string;
  totalBlocked: number;
  byCategory: Record<FilterCategory, number>;
  topDomains: { domain: string; count: number }[];
}

// ─── Engine Types ─────────────────────────────────────────────────────────────

export interface NetworkRequest {
  url: string;
  type: ResourceType;
  initiatorDomain: string;
  targetDomain: string;
}

export interface BlockDecision {
  blocked: boolean;
  matchedRule?: Rule;
  action: RuleAction;
}

export interface CosmeticRule {
  selector: string;
  domains?: DomainConstraint;
  type: "hide" | "css";
  css?: string;
}

// ─── Parser Types ─────────────────────────────────────────────────────────────

export interface ParseResult {
  rules: Rule[];
  errors: ParseError[];
  skipped: number;
}

export interface ParseError {
  line: number;
  content: string;
  reason: string;
}

// ─── Platform Adapter Types ───────────────────────────────────────────────────

export interface TabInfo {
  id: number;
  url: string;
  domain: string;
}

export type NavigationCallback = (tabId: number, url: string) => void;

// ─── Sync Types ───────────────────────────────────────────────────────────────

export interface SettingsChange {
  key: string;
  value: unknown;
  timestamp: number;
  deviceId: string;
}

export type ConflictCallback = (local: Settings, remote: Settings) => void;
