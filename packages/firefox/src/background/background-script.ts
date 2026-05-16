/**
 * Firefox extension background script.
 * Uses webRequest API for real-time request interception and blocking.
 */

import { BlockingEngine, RuleParser, StatisticsTracker, WhitelistManager, RuleManager } from "@veil/core";
import { checkKnownCNAMECloak, isTrackerCNAMETarget, AutoRulesEngine } from "@veil/core";
import { PrivacyBudgetTracker } from "@veil/core";
import type { ResourceType } from "@veil/core";
import { createLogger } from "./logger.js";

declare const browser: any; // Firefox WebExtension API

const logger = createLogger("firefox-bg");

const engine = new BlockingEngine();
const parser = new RuleParser();
const stats = new StatisticsTracker();
const whitelist = new WhitelistManager();
const ruleManager = new RuleManager(engine);
const autoRules = new AutoRulesEngine();
const privacyTracker = new PrivacyBudgetTracker();

let isEnabled = true;

// ─── Recent picker rules (undo support) ───────────────────────────────────────

interface RecentPickerRule {
  engineId: number;
  raw: string;
  timestamp: number;
}

let recentPickerRules: RecentPickerRule[] = [];
const PICKER_RULE_MAX_AGE_MS = 60_000;
const PICKER_RULE_MAX_COUNT = 5;

function pruneRecentPickerRules(): void {
  const cutoff = Date.now() - PICKER_RULE_MAX_AGE_MS;
  recentPickerRules = recentPickerRules.filter((r) => r.timestamp > cutoff);
  if (recentPickerRules.length > PICKER_RULE_MAX_COUNT) {
    recentPickerRules = recentPickerRules.slice(-PICKER_RULE_MAX_COUNT);
  }
}

async function persistRecentPickerRules(): Promise<void> {
  await browser.storage.local.set({ recentPickerRules });
}

// ─── Collaborative rules sync ───────────────────────────────────────────────────

import { BroadcastSync } from "@veil/core";

const broadcastSync = new BroadcastSync({
  hmacKey: "veil-shared-key", // In production, user-configurable
  minConfidence: 0.75,
  minConfirmations: 1,
  maxRules: 1000,
  useStorageFallback: false,
});

broadcastSync.onRule((rule) => {
  const parsed = parser.parse(rule.pattern);
  if (parsed) {
    parsed.source = "collaborative";
    engine.addRules([parsed]);
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

interface HealthStatus {
  initialized: boolean;
  enabled: boolean;
  ruleCount: number;
  whitelistSize: number;
  lastError?: string;
  uptime: number;
}

const initTime = Date.now();
let lastInitError: string | undefined;

function getHealthStatus(): HealthStatus {
  return {
    initialized: lastInitError === undefined,
    enabled: isEnabled,
    ruleCount: engine.getRuleCount?.() ?? 0,
    whitelistSize: whitelist.getAll().length,
    lastError: lastInitError,
    uptime: Date.now() - initTime,
  };
}

// ─── Initialization ───────────────────────────────────────────────────────────

async function initializeExtension(): Promise<void> {
  try {
    // Load settings
    const stored = await browser.storage.local.get(["enabled", "whitelist", "autoLearnedRules"]);
    isEnabled = stored["enabled"] !== false;

    if (stored["whitelist"] && Array.isArray(stored["whitelist"])) {
      for (const domain of stored["whitelist"] as string[]) {
        whitelist.add(domain);
      }
    }

    // Restore auto-learned rules
    if (stored["autoLearnedRules"] && Array.isArray(stored["autoLearnedRules"])) {
      for (const raw of stored["autoLearnedRules"] as string[]) {
        autoRules.confirmRule(raw);
        const rule = parser.parse(raw);
        if (rule) {
          rule.source = "auto-learned";
          engine.addRules([rule]);
        }
      }
    }

    // Restore recent picker rules (for undo)
    const storedRecent = stored["recentPickerRules"] as RecentPickerRule[] | undefined;
    if (storedRecent) {
      recentPickerRules = storedRecent;
      pruneRecentPickerRules();
    }

    // Load filter lists
    const registryUrl = browser.runtime.getURL("filter-lists/registry.json");
    const response = await fetch(registryUrl);
    const registry = await response.json();
    await ruleManager.loadRegistry(registry.lists);

    // Activate default lists
    const storedLists = await browser.storage.local.get(["activeLists"]);
    const activeLists = (storedLists["activeLists"] as string[]) ?? ["easylist", "easyprivacy"];

    for (const listId of activeLists) {
      try {
        await ruleManager.activateList(listId);
      } catch (e) {
        logger.warn(`Failed to load ${listId}`, { error: String(e) });
      }
    }

    ruleManager.startAutoUpdates();
    logger.info("Firefox extension initialized");
  } catch (e) {
    lastInitError = String(e);
    logger.error("Initialization failed", { error: lastInitError });
    // Graceful degradation: keep running with empty rules
    isEnabled = false;
  }
}

// ─── webRequest: Block Requests ───────────────────────────────────────────────

browser.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    if (!isEnabled) return {};
    if (details.tabId < 0) return {};

    const url = new URL(details.url);
    const targetDomain = url.hostname;

    // Check whitelist
    if (whitelist.isWhitelisted(targetDomain)) {
      return {};
    }

    // CNAME uncloaking — detect trackers hiding behind first-party CNAMEs
    const cnameResult = checkKnownCNAMECloak(targetDomain);
    if (cnameResult?.isTracker) {
      stats.recordBlocked(details.tabId, targetDomain, "tracker-cname");
      updateBadge(details.tabId);
      return { cancel: true };
    }

    // Get initiator domain
    let initiatorDomain = "";
    if (details.originUrl) {
      try {
        initiatorDomain = new URL(details.originUrl).hostname;
      } catch {
        // ignore
      }
    }

    const resourceType = mapResourceType(details.type);

    const decision = engine.shouldBlock({
      url: details.url,
      type: resourceType,
      initiatorDomain,
      targetDomain,
    });

    if (decision.blocked) {
      stats.recordBlocked(details.tabId, targetDomain, "ads");
      updateBadge(details.tabId);
      return { cancel: true };
    }

    // Auto-learning: analyze unblocked third-party requests
    if (initiatorDomain && initiatorDomain !== targetDomain) {
      const confirmed = autoRules.processRequest(
        details.url,
        resourceType,
        initiatorDomain,
        targetDomain,
        false,
      );
      if (confirmed) {
        const rule = parser.parse(confirmed.suggestedRule);
        if (rule) {
          rule.source = "auto-learned";
          engine.addRules([rule]);
          // Persist auto-learned rules
          browser.storage.local.set({ autoLearnedRules: autoRules.getConfirmedRules() });
          logger.info("Auto-learned rule applied", { rule: confirmed.suggestedRule });
        }
      }
    }

    return {};
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// ─── DNS-based CNAME Uncloaking (Firefox-specific) ────────────────────────────

// Firefox provides browser.dns API for resolving CNAME records
if (typeof browser !== "undefined" && browser.dns) {
  browser.webRequest.onBeforeRequest.addListener(
    async (details: any) => {
      if (!isEnabled || details.tabId < 0) return {};

      try {
        const url = new URL(details.url);
        const hostname = url.hostname;

        // Only check third-party requests
        if (details.originUrl) {
          const initiator = new URL(details.originUrl).hostname;
          if (initiator === hostname) return {};
        }

        // Resolve CNAME
        const dnsResult = await browser.dns.resolve(hostname, ["canonical_name"]);
        if (dnsResult.canonicalName && dnsResult.canonicalName !== hostname) {
          if (isTrackerCNAMETarget(dnsResult.canonicalName)) {
            stats.recordBlocked(details.tabId, hostname, "cname-tracker");
            updateBadge(details.tabId);
            return { cancel: true };
          }
        }
      } catch {
        // DNS resolution failed — allow request
      }

      return {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
}

// ─── HTML Filtering via filterResponseData (Firefox-specific) ─────────────────

browser.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    if (!isEnabled) return {};
    if (details.type !== "main_frame" && details.type !== "sub_frame") return {};

    try {
      const url = new URL(details.url);
      const domain = url.hostname;
      if (whitelist.isWhitelisted(domain)) return {};

      // Check if we have HTML filter rules for this domain
      // HTML filter rules are stored as cosmetic rules with $$ prefix in pattern
      const cosmeticRules = engine.getCosmeticRules(domain);
      const htmlRules = cosmeticRules.filter((r) => r.selector.startsWith("$$"));

      if (htmlRules.length === 0) return {};

      // Use filterResponseData to modify HTML before rendering
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const decoder = new TextDecoder("utf-8");
      const encoder = new TextEncoder();
      const chunks: string[] = [];

      filter.ondata = (event: { data: ArrayBuffer }) => {
        chunks.push(decoder.decode(event.data, { stream: true }));
      };

      filter.onstop = () => {
        let html = chunks.join("");

        for (const rule of htmlRules) {
          const selector = rule.selector.slice(2); // Remove $$ prefix
          // Simple tag removal by content
          const tagMatch = selector.match(/^(\w+)\[tag-content="([^"]+)"\]$/);
          if (tagMatch && tagMatch[1] && tagMatch[2]) {
            const tag = tagMatch[1];
            const content = tagMatch[2];
            const regex = new RegExp(
              `<${tag}[^>]*>[\\s\\S]*?${content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?</${tag}>`,
              "gi"
            );
            html = html.replace(regex, "");
          }
        }

        filter.write(encoder.encode(html));
        filter.close();
      };
    } catch {
      // Error setting up filter — allow request
    }

    return {};
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// ─── Navigation: Reset Stats & Inject Cosmetic ───────────────────────────────

browser.webNavigation.onCommitted.addListener((details: any) => {
  if (details.frameId === 0) {
    stats.resetTab(details.tabId);
    updateBadge(details.tabId);
  }
});

browser.webNavigation.onCompleted.addListener((details: any) => {
  if (details.frameId !== 0) return;
  if (!isEnabled) return;

  try {
    const url = new URL(details.url);
    const domain = url.hostname;

    if (whitelist.isWhitelisted(domain)) return;

    const cosmeticRules = engine.getCosmeticRules(domain);
    if (cosmeticRules.length > 0) {
      const css = cosmeticRules
        .map((r) => `${r.selector} { display: none !important; }`)
        .join("\n");

      browser.tabs.insertCSS(details.tabId, {
        code: css,
        runAt: "document_start",
      }).catch(() => {
        // Restricted page
      });
    }
  } catch {
    // Invalid URL (e.g., about:blank, chrome://)
  }
});

// ─── Badge ────────────────────────────────────────────────────────────────────

function updateBadge(tabId: number): void {
  const tabStats = stats.getTabStats(tabId);
  const count = tabStats.blocked;
  const text = count === 0 ? "" : count > 999 ? "999+" : String(count);

  browser.browserAction.setBadgeText({ tabId, text });
  browser.browserAction.setBadgeBackgroundColor({ tabId, color: "#4A90D9" });
}

// ─── Message Handling ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
  switch (message.type) {
    case "GET_STATUS":
      return Promise.resolve({ enabled: isEnabled });

    case "GET_HEALTH":
      return Promise.resolve(getHealthStatus());

    case "GET_TAB_STATS":
      return Promise.resolve(stats.getTabStats(message.payload as number));

    case "TOGGLE_ENABLED":
      isEnabled = !isEnabled;
      browser.storage.local.set({ enabled: isEnabled });
      return Promise.resolve({ enabled: isEnabled });

    case "ADD_TO_WHITELIST": {
      const domain = message.payload as string;
      whitelist.add(domain);
      browser.storage.local.set({ whitelist: whitelist.getAll() });
      return Promise.resolve({ success: true });
    }

    case "REMOVE_FROM_WHITELIST": {
      const domain = message.payload as string;
      whitelist.remove(domain);
      browser.storage.local.set({ whitelist: whitelist.getAll() });
      return Promise.resolve({ success: true });
    }

    case "GET_WHITELIST":
      return Promise.resolve({ whitelist: whitelist.getAll() });

    case "GET_FILTER_LISTS":
      return Promise.resolve({ lists: ruleManager.getFilterLists() });

    case "ADD_CUSTOM_RULE": {
      const raw = message.payload as string;
      const result = ruleManager.addCustomRule(raw);
      if (result.success && result.engineIds && result.engineIds.length > 0) {
        pruneRecentPickerRules();
        recentPickerRules.push({
          engineId: result.engineIds[0]!,
          raw,
          timestamp: Date.now(),
        });
        if (recentPickerRules.length > PICKER_RULE_MAX_COUNT) {
          recentPickerRules = recentPickerRules.slice(-PICKER_RULE_MAX_COUNT);
        }
        void persistRecentPickerRules();
      }
      // Feed to auto-learning
      autoRules.confirmRule(raw);
      browser.storage.local.set({ autoLearnedRules: autoRules.getConfirmedRules() });
      return Promise.resolve({ success: result.success, error: result.error });
    }

    case "UNDO_LAST_PICKER_RULE": {
      pruneRecentPickerRules();
      const last = recentPickerRules.pop();
      if (!last) return Promise.resolve({ success: false, error: "Нет правил для отмены" });

      const removed = engine.removeRuleById(last.engineId);

      // Remove from custom rules storage (rebuild from RuleManager)
      ruleManager.removeCustomRule(last.engineId.toString());

      void persistRecentPickerRules();
      return Promise.resolve({ success: removed, rule: last.raw });
    }

    case "GET_RECENT_PICKER_RULES": {
      pruneRecentPickerRules();
      const last = recentPickerRules[recentPickerRules.length - 1] ?? null;
      return Promise.resolve({
        last: last ? { raw: last.raw, timestamp: last.timestamp } : null,
      });
    }

    case "GET_COSMETIC_RULES": {
      const domain = message.payload as string;
      if (!isEnabled) return Promise.resolve({ selectors: [] });
      if (whitelist.isWhitelisted(domain)) return Promise.resolve({ selectors: [] });
      const cosmeticRules = engine.getCosmeticRules(domain);
      return Promise.resolve({ selectors: cosmeticRules.map((r) => r.selector) });
    }

    case "GET_AUTO_RULES_STATS":
      return Promise.resolve(autoRules.getStats());

    case "GET_AUTO_RULES":
      return Promise.resolve({ rules: autoRules.getConfirmedRules() });

    case "CONFIRM_AUTO_RULE": {
      const rule = message.payload as string;
      autoRules.confirmRule(rule);
      const parsed = parser.parse(rule);
      if (parsed) {
        parsed.source = "auto-learned";
        engine.addRules([parsed]);
      }
      return Promise.resolve({ success: true });
    }

    case "REJECT_AUTO_RULE": {
      autoRules.rejectRule(message.payload as string);
      return Promise.resolve({ success: true });
    }

    case "PRIVACY_EVENT": {
      const payload = message.payload as { method: string; timestamp: number; url: string; domain: string };
      privacyTracker.recordEvent(payload.domain, {
        api: payload.method.split(".")[0] ?? "unknown",
        method: payload.method,
        entropyBits: 1.0,
      });
      return Promise.resolve({ success: true });
    }

    case "GET_PRIVACY_SCORE": {
      const domain = message.payload as string;
      const score = privacyTracker.getScore(domain);
      return Promise.resolve({ score: score ?? null });
    }

    case "LOG_CLIENT_ERROR": {
      const payload = message.payload as { context: string; error: string };
      logger.error("Client error", payload);
      return Promise.resolve({ success: true });
    }

    default:
      return Promise.resolve({ error: "Unknown message type" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapResourceType(type: string): ResourceType {
  const mapping: Record<string, ResourceType> = {
    script: "script",
    image: "image",
    imageset: "image",
    stylesheet: "stylesheet",
    xmlhttprequest: "xmlhttprequest",
    media: "media",
    font: "font",
    sub_frame: "iframe",
    main_frame: "other",
    object: "other",
    ping: "other",
    websocket: "other",
    other: "other",
  };
  return mapping[type] ?? "other";
}

// Initialize on load
void initializeExtension();

export { initializeExtension, engine, parser, stats, whitelist, ruleManager };
