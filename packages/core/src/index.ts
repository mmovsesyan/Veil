// Types
export type {
  Rule,
  RuleModifiers,
  DomainConstraint,
  FilterList,
  WhitelistEntry,
  Settings,
  PageStats,
  DailyStats,
  NetworkRequest,
  BlockDecision,
  CosmeticRule,
  ParseResult,
  ParseError,
  TabInfo,
  NavigationCallback,
  SettingsChange,
  ConflictCallback,
} from "./types/index.js";

export {
  RuleType,
  RuleAction,
  FilterCategory,
} from "./types/index.js";

export type { ResourceType } from "./types/index.js";

// Interfaces
export type {
  IRuleParser,
  IBlockingEngine,
  IWhitelistManager,
  IStatisticsTracker,
  IPlatformAdapter,
  ISyncService,
} from "./types/interfaces.js";

// Implementations
export { BlockingEngine } from "./engine/index.js";
export { PatternTrie } from "./engine/index.js";
export { getRedirectResource, getDefaultRedirect, getAvailableResources } from "./engine/index.js";
export { generateScriptlet, parseScriptletRule, getAvailableScriptlets } from "./engine/index.js";
export { removeParams, removeTrackingParams, parseRemoveParam, DEFAULT_TRACKING_PARAMS } from "./engine/index.js";
export type { RemoveParamRule } from "./engine/index.js";
export { checkKnownCNAMECloak, resolveCNAME, isTrackerCNAMETarget } from "./engine/index.js";
export { parseHTMLFilterRule, applyHTMLFilters } from "./engine/index.js";
export { serializeToString, deserializeFromString, serializeRules, deserializeRules } from "./engine/index.js";
export { RuleParser } from "./rules/index.js";
export { RuleManager } from "./rules/rule-manager.js";
export { WhitelistManager } from "./whitelist/index.js";
export { StatisticsTracker } from "./stats/index.js";
export { SyncService } from "./sync/index.js";
