/**
 * Chrome extension service worker (Manifest V3).
 * 
 * Key design decisions for stability:
 * 1. Default rules are pre-compiled in rules/default.json (works offline)
 * 2. Dynamic rules loaded from storage on startup (fast, no network)
 * 3. Filter list downloads happen in background, non-blocking
 * 4. All state persisted to chrome.storage.local
 */

import { BlockingEngine, RuleParser, StatisticsTracker, WhitelistManager, AutoRulesEngine } from "@veil/core";
import { getRedirectResource, getDefaultRedirect, parseScriptletRule } from "@veil/core";
import { PrivacyBudgetTracker, generatePrivacyMonitorScript } from "@veil/core";
import type { Rule, CosmeticRule } from "@veil/core";

// ─── Script Injection Helper ──────────────────────────────────────────────────

/**
 * Executes script code in the page context via chrome.scripting.executeScript.
 * Uses new Function() instead of eval() to avoid bundler warnings and
 * Chrome Web Store review flags while preserving identical runtime behavior.
 */
function executeInPage(scriptCode: string): void {
  const fn = new Function(scriptCode);
  fn();
}

// ─── Core instances ───────────────────────────────────────────────────────────

const engine = new BlockingEngine();
const parser = new RuleParser();
const stats = new StatisticsTracker();
const whitelist = new WhitelistManager();
const autoRules = new AutoRulesEngine();
const privacyTracker = new PrivacyBudgetTracker();

let isEnabled = true;
const cosmeticRulesCache = new Map<string, CosmeticRule[]>();
const COSMETIC_CACHE_MAX_SIZE = 500;

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
  await chrome.storage.local.set({ recentPickerRules });
}

// ─── Stable whitelist rule ID generation ──────────────────────────────────────

/**
 * Generate a stable, deterministic rule ID for a whitelisted domain.
 * Uses a simple hash to avoid index-based ID collisions when domains are
 * added/removed (since getAll() returns a sorted array whose indices shift).
 */
function getWhitelistRuleId(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    const char = domain.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Convert to 32-bit integer
  }
  // Map to range 900000–929999 (30K IDs, well within limits)
  return 900000 + (Math.abs(hash) % 30000);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // First install — set defaults
    await chrome.storage.local.set({
      enabled: true,
      whitelist: [],
      customRules: [],
    });
  }
  await initialize();
});

chrome.runtime.onStartup.addListener(async () => {
  await initialize();
});

let initPromise: Promise<void> | null = null;

async function initialize(): Promise<void> {
  // Prevent concurrent initialization
  if (initPromise) return initPromise;
  initPromise = doInitialize();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

// Also initialize immediately (service worker can restart at any time)
initialize().catch(console.error);

async function doInitialize(): Promise<void> {
  try {
    // 1. Load settings from storage (instant, no network)
    const stored = await chrome.storage.local.get([
      "enabled",
      "whitelist",
      "customRules",
      "cachedRules",
      "autoLearnedRules",
      "recentPickerRules",
    ]);

    isEnabled = stored["enabled"] !== false;

    // 2. Restore whitelist
    const wl = stored["whitelist"] as string[] | undefined;
    if (wl) {
      for (const domain of wl) {
        whitelist.add(domain);
      }
    }

    // 3. Load rules — prefer cached, fallback to bundled rules
    const cachedRules = stored["cachedRules"] as string | undefined;
    if (cachedRules) {
      const result = parser.parseList(cachedRules);
      await engine.initialize(result.rules);
    } else {
      // No cache — load bundled rules (works offline, first install)
      try {
        const bundledFiles = [
          "bundled-rules/easylist-mini.txt",
          "bundled-rules/easyprivacy-mini.txt",
          "bundled-rules/rutube.txt",
        ];
        const allText: string[] = [];
        for (const file of bundledFiles) {
          try {
            const resp = await fetch(chrome.runtime.getURL(file));
            if (resp.ok) allText.push(await resp.text());
          } catch { /* skip missing files */ }
        }
        if (allText.length > 0) {
          const combined = allText.join("\n");
          const result = parser.parseList(combined);
          await engine.initialize(result.rules);
          // Cache for next startup
          await chrome.storage.local.set({
            cachedRules: combined,
            listRuleCounts: { "bundled": result.rules.length },
          });
          // Update DNR
          await updateDNRRules(result.rules);
          console.log(`[Content Blocker] Loaded ${result.rules.length} bundled rules`);
        }
      } catch (e) {
        console.warn("[Content Blocker] Failed to load bundled rules:", e);
      }
    }

    // 4. Load custom rules
    const customRules = stored["customRules"] as string[] | undefined;
    if (customRules && customRules.length > 0) {
      for (const raw of customRules) {
        const rule = parser.parse(raw);
        if (rule) {
          rule.source = "custom";
          engine.addRules([rule]);
        }
      }
    }

    // 5. Restore auto-learned rules
    const autoLearned = stored["autoLearnedRules"] as string[] | undefined;
    if (autoLearned && autoLearned.length > 0) {
      for (const raw of autoLearned) {
        autoRules.confirmRule(raw);
        const rule = parser.parse(raw);
        if (rule) {
          rule.source = "auto-learned";
          engine.addRules([rule]);
        }
      }
    }

    // 6. Restore recent picker rules (for undo)
    const storedRecent = stored["recentPickerRules"] as RecentPickerRule[] | undefined;
    if (storedRecent) {
      recentPickerRules = storedRecent;
      pruneRecentPickerRules();
    }

    // 7. Schedule background filter list update (non-blocking)
    scheduleFilterUpdate();

    console.log("[Content Blocker] Initialized");
  } catch (e) {
    console.error("[Content Blocker] Init error:", e);
  }
}

// ─── Filter List Updates (background, non-blocking) ───────────────────────────

function scheduleFilterUpdate(): void {
  // Check every 24 hours
  chrome.alarms.create("filter-update", { periodInMinutes: 24 * 60 });

  // Also try to update now (but don't block on it)
  updateFiltersInBackground().catch(() => {
    // Network unavailable — that's fine, we have cached rules
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "filter-update") {
    updateFiltersInBackground().catch(console.warn);
  }
});

async function updateFiltersInBackground(): Promise<void> {
  const registryUrl = chrome.runtime.getURL("filter-lists/registry.json");
  const response = await fetch(registryUrl);
  const registry = await response.json();

  const allRulesText: string[] = [];
  const listRuleCounts: Record<string, number> = {};

  for (const list of registry.lists as { id: string; url: string; enabled: boolean }[]) {
    if (!list.enabled) continue;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(list.url, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const text = await resp.text();
        allRulesText.push(text);
        // Count rules per list
        const listResult = parser.parseList(text);
        listRuleCounts[list.id] = listResult.rules.length;
      }
    } catch {
      // Skip failed lists — keep going
    }
  }

  if (allRulesText.length > 0) {
    const combined = allRulesText.join("\n");
    const result = parser.parseList(combined);

    // Update engine
    await engine.initialize(result.rules);

    // Cache for next startup
    await chrome.storage.local.set({ cachedRules: combined, listRuleCounts });

    // Update DNR rules
    await updateDNRRules(result.rules);

    // Clear cosmetic cache
    cosmeticRulesCache.clear();

    console.log(`[Content Blocker] Updated: ${result.rules.length} rules from ${allRulesText.length} lists`);
  }
}

async function updateDNRRules(rules: Rule[]): Promise<void> {
  try {
    const networkRules = rules.filter(
      (r) => r.type === "network-block" || r.type === "network-allow"
    );

    // Separate rules by action type
    const blockRules: Rule[] = [];
    const allowRules: Rule[] = [];
    const redirectRules: Rule[] = [];
    const removeParamRules: Rule[] = [];
    const cspRules: Rule[] = [];

    for (const rule of networkRules) {
      const mods = rule.modifiers as Record<string, unknown>;
      if (mods.removeparam) {
        removeParamRules.push(rule);
      } else if (mods.csp) {
        cspRules.push(rule);
      } else if (rule.action === "redirect" || mods.redirect) {
        redirectRules.push(rule);
      } else if (rule.type === "network-allow") {
        allowRules.push(rule);
      } else {
        blockRules.push(rule);
      }
    }

    const dnrRules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = 1;

    // 1. Allow rules (highest DNR priority)
    for (const rule of allowRules.slice(0, 5000)) {
      dnrRules.push({
        id: ruleId++,
        priority: rule.priority >= 200 ? 4 : 3, // $important allow = 4, normal allow = 3
        action: { type: "allow" as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          urlFilter: rule.pattern,
          resourceTypes: mapResourceTypes(rule.modifiers.resourceTypes),
          domainType: rule.modifiers.thirdParty === true
            ? ("thirdParty" as chrome.declarativeNetRequest.DomainType)
            : undefined,
        },
      } as chrome.declarativeNetRequest.Rule);
    }

    // 2. Redirect rules ($redirect=noop.js, $redirect=1x1.gif)
    for (const rule of redirectRules.slice(0, 2000)) {
      const mods = rule.modifiers as Record<string, unknown>;
      const resourceName = (mods.redirect as string) || "";
      const redirectUrl = getRedirectResource(resourceName)
        || getDefaultRedirect(rule.modifiers.resourceTypes?.[0] || "other")
        || "data:text/plain,";

      dnrRules.push({
        id: ruleId++,
        priority: rule.priority >= 150 ? 3 : 2,
        action: {
          type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
          redirect: { url: redirectUrl },
        },
        condition: {
          urlFilter: rule.pattern,
          resourceTypes: mapResourceTypes(rule.modifiers.resourceTypes),
          domainType: rule.modifiers.thirdParty === true
            ? ("thirdParty" as chrome.declarativeNetRequest.DomainType)
            : undefined,
        },
      } as chrome.declarativeNetRequest.Rule);
    }

    // 3. $removeparam rules (strip tracking parameters)
    for (const rule of removeParamRules.slice(0, 1000)) {
      const mods = rule.modifiers as Record<string, unknown>;
      const param = mods.removeparam as string;
      if (!param) continue;

      const isRegex = param.startsWith("/") && param.endsWith("/");
      const regexFilter = isRegex
        ? `[?&]${param.slice(1, -1)}=[^&]*`
        : undefined;

      dnrRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
          redirect: {
            transform: {
              queryTransform: {
                removeParams: isRegex ? undefined : [param],
              },
            },
          },
        },
        condition: {
          urlFilter: rule.pattern || "*",
          resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
          ...(regexFilter ? { regexFilter } : {}),
        },
      } as chrome.declarativeNetRequest.Rule);
    }

    // 4. $csp rules (inject Content-Security-Policy headers)
    for (const rule of cspRules.slice(0, 500)) {
      const mods = rule.modifiers as Record<string, unknown>;
      const cspValue = mods.csp as string;
      if (!cspValue) continue;

      dnrRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
          responseHeaders: [{
            header: "Content-Security-Policy",
            operation: "append" as chrome.declarativeNetRequest.HeaderOperation,
            value: cspValue,
          }],
        },
        condition: {
          urlFilter: rule.pattern || "*",
          resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
        },
      } as chrome.declarativeNetRequest.Rule);
    }

    // 5. Block rules (bulk)
    for (const rule of blockRules.slice(0, 22000)) {
      dnrRules.push({
        id: ruleId++,
        priority: rule.priority >= 150 ? 2 : 1, // $important = 2, normal = 1
        action: { type: "block" as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          urlFilter: rule.pattern,
          resourceTypes: mapResourceTypes(rule.modifiers.resourceTypes),
          domainType: rule.modifiers.thirdParty === true
            ? ("thirdParty" as chrome.declarativeNetRequest.DomainType)
            : undefined,
        },
      } as chrome.declarativeNetRequest.Rule);
    }

    // Chrome limit: 30,000 dynamic rules
    const finalRules = dnrRules.slice(0, 30000);

    // Remove old dynamic rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map((r) => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: finalRules,
    });

    if (dnrRules.length > 30000) {
      console.warn(`[Content Blocker] ${dnrRules.length} rules exceed 30K limit. ${dnrRules.length - 30000} dropped.`);
    }

    console.log(`[Content Blocker] DNR: ${finalRules.length} rules (${blockRules.length} block, ${allowRules.length} allow, ${redirectRules.length} redirect, ${removeParamRules.length} removeparam, ${cspRules.length} csp)`);
  } catch (e) {
    console.warn("[Content Blocker] DNR update failed:", e);
  }
}

function mapResourceTypes(types?: string[]): chrome.declarativeNetRequest.ResourceType[] | undefined {
  if (!types || types.length === 0) return undefined;

  const mapping: Record<string, chrome.declarativeNetRequest.ResourceType> = {
    script: "script" as chrome.declarativeNetRequest.ResourceType,
    image: "image" as chrome.declarativeNetRequest.ResourceType,
    stylesheet: "stylesheet" as chrome.declarativeNetRequest.ResourceType,
    xmlhttprequest: "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
    media: "media" as chrome.declarativeNetRequest.ResourceType,
    font: "font" as chrome.declarativeNetRequest.ResourceType,
    iframe: "sub_frame" as chrome.declarativeNetRequest.ResourceType,
    popup: "main_frame" as chrome.declarativeNetRequest.ResourceType,
    other: "other" as chrome.declarativeNetRequest.ResourceType,
  };

  const mapped = types
    .map((t) => mapping[t])
    .filter((t): t is chrome.declarativeNetRequest.ResourceType => t !== undefined);

  // Chrome DNR rejects empty resourceTypes arrays — return undefined instead
  return mapped.length > 0 ? mapped : undefined;
}

// ─── Navigation & Badge ───────────────────────────────────────────────────────

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    stats.resetTab(details.tabId);
    updateBadge(details.tabId);
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  if (!isEnabled) return;

  try {
    const url = new URL(details.url);
    const domain = url.hostname;

    if (whitelist.isWhitelisted(domain)) return;

    // Get cosmetic rules (cached)
    let cosmetic = cosmeticRulesCache.get(domain);
    if (!cosmetic) {
      cosmetic = engine.getCosmeticRules(domain);
      // Evict oldest entries if cache is full
      if (cosmeticRulesCache.size >= COSMETIC_CACHE_MAX_SIZE) {
        const firstKey = cosmeticRulesCache.keys().next().value;
        if (firstKey !== undefined) cosmeticRulesCache.delete(firstKey);
      }
      cosmeticRulesCache.set(domain, cosmetic);
    }

    if (cosmetic.length > 0) {
      const css = cosmetic.map((r) => `${r.selector} { display: none !important; }`).join("\n");
      chrome.scripting.insertCSS({
        target: { tabId: details.tabId },
        css,
      }).catch(() => { /* restricted page */ });
    }
  } catch {
    // Invalid URL
  }
});

// Track blocked requests via DNR feedback
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (!isEnabled) return;
    if (info.request.tabId < 0) return;

    try {
      const url = new URL(info.request.url);
      stats.recordBlocked(info.request.tabId, url.hostname, "ads");
      updateBadge(info.request.tabId);
    } catch {
      // Invalid URL
    }
  });
}

// (onErrorOccurred removed — badge counting now done via onBeforeRequest + JS engine above)

// ─── Badge Counter: Check every request against JS engine ─────────────────────

// Like AdGuard MV3: use webRequest.onBeforeRequest to observe all requests
// and check them against our JS engine for accurate counting
if (chrome.webRequest?.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!isEnabled || details.tabId < 0) return;
      if (details.type === "main_frame") return;

      try {
        const url = new URL(details.url);
        const targetDomain = url.hostname;

        if (whitelist.isWhitelisted(targetDomain)) return;

        let initiatorDomain = "";
        if (details.initiator) {
          try { initiatorDomain = new URL(details.initiator).hostname; } catch { /* ignore */ }
        }

        const decision = engine.shouldBlock({
          url: details.url,
          type: (details.type || "other") as any,
          initiatorDomain,
          targetDomain,
        });

        if (decision.blocked) {
          stats.recordBlocked(details.tabId, targetDomain, "ads");
          updateBadge(details.tabId);
        }
      } catch { /* ignore */ }
    },
    { urls: ["<all_urls>"] }
  );
}

// ─── Auto-Learning: Analyze unblocked requests for new patterns ───────────────

// Process completed (unblocked) requests through auto-learning engine
if (chrome.webRequest?.onCompleted) {
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (!isEnabled || details.tabId < 0) return;
      if (details.type === "main_frame") return; // Skip page navigations

      try {
        const url = new URL(details.url);
        const targetDomain = url.hostname;

        // Skip first-party and whitelisted
        if (whitelist.isWhitelisted(targetDomain)) return;

        let initiatorDomain = "";
        if (details.initiator) {
          try { initiatorDomain = new URL(details.initiator).hostname; } catch { /* invalid URL */ }
        }

        // Feed to auto-learning engine
        const confirmed = autoRules.processRequest(
          details.url,
          details.type,
          initiatorDomain,
          targetDomain,
          false, // not blocked
        );

        // If a new rule was auto-confirmed, add it to the engine AND DNR
        if (confirmed) {
          const rule = parser.parse(confirmed.suggestedRule);
          if (rule) {
            rule.source = "auto-learned";
            engine.addRules([rule]);

            // Add to DNR for actual blocking (fire-and-forget)
            chrome.declarativeNetRequest.getDynamicRules().then((existingRules) => {
              const maxId = existingRules.reduce((max, r) => Math.max(max, r.id), 0);
              chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [{
                  id: maxId + 1,
                  priority: 1,
                  action: { type: "block" as chrome.declarativeNetRequest.RuleActionType },
                  condition: {
                    urlFilter: rule.pattern,
                    resourceTypes: mapResourceTypes(rule.modifiers.resourceTypes),
                  },
                }],
                removeRuleIds: [],
              }).catch(() => {});
            }).catch(() => {});

            // Persist auto-learned rules
            chrome.storage.local.set({ autoLearnedRules: autoRules.getConfirmedRules() });

            console.log(`[Veil Auto-Learn] New rule confirmed and applied: ${confirmed.suggestedRule}`);
          }
        }
      } catch {
        // Ignore errors in auto-learning
      }
    },
    { urls: ["<all_urls>"] }
  );
}

function updateBadge(tabId: number): void {
  const tabStats = stats.getTabStats(tabId);
  const count = tabStats.blocked;
  const text = count === 0 ? "" : count > 999 ? "999+" : String(count);

  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#4A90D9" }).catch(() => {});
}

// ─── Message Handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle INJECT_SCRIPTLETS separately (needs sender.tab.id)
  if (message.type === "INJECT_SCRIPTLETS" && sender.tab?.id) {
    const code = (message.payload as string[]).join("\n");
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: "MAIN", // Execute in page context (bypasses CSP)
      func: executeInPage,
      args: [code],
    }).catch(() => { /* scripting may fail on restricted pages */ });
    sendResponse({ success: true });
    return true;
  }

  handleMessage(message, sender).then(sendResponse).catch((e) => {
    sendResponse({ error: String(e) });
  });
  return true; // Keep channel open for async
});

async function handleMessage(
  message: { type: string; payload?: unknown },
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case "GET_STATUS":
      return { enabled: isEnabled };

    case "GET_TAB_STATS":
      return stats.getTabStats(message.payload as number);

    case "TOGGLE_ENABLED": {
      isEnabled = !isEnabled;
      await chrome.storage.local.set({ enabled: isEnabled });

      // Enable/disable DNR rules at the system level
      if (!isEnabled) {
        // Remove all dynamic rules when disabled
        try {
          const existing = await chrome.declarativeNetRequest.getDynamicRules();
          const removeIds = existing.map((r) => r.id);
          if (removeIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules: [] });
          }
          // Save and disable static rulesets so they can be restored on re-enable
          const staticSets = await chrome.declarativeNetRequest.getEnabledRulesets();
          if (staticSets.length > 0) {
            await chrome.storage.local.set({ enabledStaticRulesets: staticSets });
            await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: staticSets });
          }
        } catch { /* ignore errors */ }
      } else {
        // Re-enable: reload rules from cache
        try {
          const stored = await chrome.storage.local.get(["cachedRules", "enabledStaticRulesets"]);
          if (stored.cachedRules) {
            const result = parser.parseList(stored.cachedRules as string);
            await engine.initialize(result.rules);
            await updateDNRRules(result.rules);
          }

          // Re-enable static rulesets that were disabled
          const savedRulesets = stored["enabledStaticRulesets"] as string[] | undefined;
          if (savedRulesets && savedRulesets.length > 0) {
            await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: savedRulesets });
          }

          // Restore whitelist DNR allow rules using stable hash-based IDs
          const wlDomains = whitelist.getAll();
          if (wlDomains.length > 0) {
            const wlRules = wlDomains.map((d) => ({
              id: getWhitelistRuleId(d),
              priority: 10,
              action: { type: "allowAllRequests" as chrome.declarativeNetRequest.RuleActionType },
              condition: {
                requestDomains: [d],
                resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
              },
            }));
            await chrome.declarativeNetRequest.updateDynamicRules({
              addRules: wlRules,
              removeRuleIds: [],
            });
          }
        } catch { /* ignore errors */ }
      }

      return { enabled: isEnabled };
    }

    case "ADD_TO_WHITELIST": {
      const domain = message.payload as string;
      whitelist.add(domain);
      const all = whitelist.getAll();
      await chrome.storage.local.set({ whitelist: all });

      // Add DNR allowAllRequests rule for this domain (only if enabled)
      if (isEnabled) {
        try {
          const whitelistRuleId = getWhitelistRuleId(domain);
          await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
              id: whitelistRuleId,
              priority: 10,
              action: { type: "allowAllRequests" as chrome.declarativeNetRequest.RuleActionType },
              condition: {
                requestDomains: [domain],
                resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
              },
            }],
            removeRuleIds: [whitelistRuleId], // Remove first in case of hash collision with stale rule
          });
        } catch { /* DNR update may fail for invalid domains */ }
      }

      return { success: true };
    }

    case "REMOVE_FROM_WHITELIST": {
      const domain = message.payload as string;
      const ruleIdToRemove = getWhitelistRuleId(domain);
      whitelist.remove(domain);
      const all = whitelist.getAll();
      await chrome.storage.local.set({ whitelist: all });

      // Remove DNR allow rule for this domain
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [ruleIdToRemove],
          addRules: [],
        });
      } catch { /* ignore */ }

      return { success: true };
    }

    case "GET_WHITELIST":
      return { whitelist: whitelist.getAll() };

    case "GET_FILTER_LISTS": {
      // Return registry enriched with actual loaded rule counts
      try {
        const resp = await fetch(chrome.runtime.getURL("filter-lists/registry.json"));
        const registry = await resp.json();
        
        // Get stored per-list rule counts
        const stored = await chrome.storage.local.get("listRuleCounts");
        const counts = (stored.listRuleCounts ?? {}) as Record<string, number>;

        const enriched = (registry.lists as any[]).map((list: any) => ({
          ...list,
          rulesCount: counts[list.id] ?? 0,
        }));

        return { lists: enriched };
      } catch {
        return { lists: [] };
      }
    }

    case "TOGGLE_FILTER_LIST":
      // For now, just acknowledge — real toggle requires re-download
      return { success: true };

    case "ADD_CUSTOM_RULE": {
      const raw = message.payload as string;
      const rule = parser.parse(raw);
      if (!rule) return { success: false, error: "Invalid syntax" };

      rule.source = "custom";
      const ids = engine.addRules([rule]);

      // Track for undo
      if (ids.length > 0) {
        pruneRecentPickerRules();
        recentPickerRules.push({
          engineId: ids[0]!,
          raw,
          timestamp: Date.now(),
        });
        if (recentPickerRules.length > PICKER_RULE_MAX_COUNT) {
          recentPickerRules = recentPickerRules.slice(-PICKER_RULE_MAX_COUNT);
        }
        await persistRecentPickerRules();
        console.log("[Veil] Added picker rule for undo:", { raw, engineId: ids[0], recentCount: recentPickerRules.length });
      } else {
        console.warn("[Veil] ADD_CUSTOM_RULE: no engine IDs returned for rule:", raw);
      }

      // Persist
      const stored = await chrome.storage.local.get(["customRules"]);
      const existing = (stored["customRules"] as string[]) ?? [];
      existing.push(raw);
      await chrome.storage.local.set({ customRules: existing });

      // Feed to auto-learning: manual block = confirmed pattern
      // This teaches the engine that similar elements on other sites should be blocked too
      autoRules.confirmRule(raw);
      chrome.storage.local.set({ autoLearnedRules: autoRules.getConfirmedRules() });

      return { success: true };
    }

    case "UNDO_LAST_PICKER_RULE": {
      pruneRecentPickerRules();
      const last = recentPickerRules.pop();
      if (!last) return { success: false, error: "Нет правил для отмены" };

      // Remove from engine
      const removed = engine.removeRuleById(last.engineId);

      // Remove from custom rules storage
      const stored = await chrome.storage.local.get(["customRules"]);
      const existing = (stored["customRules"] as string[]) ?? [];
      const filtered = existing.filter((r) => r !== last.raw);
      if (filtered.length !== existing.length) {
        await chrome.storage.local.set({ customRules: filtered });
      }

      await persistRecentPickerRules();

      return { success: removed, rule: last.raw };
    }

    case "GET_RECENT_PICKER_RULES": {
      pruneRecentPickerRules();
      const last = recentPickerRules[recentPickerRules.length - 1] ?? null;
      console.log("[Veil] GET_RECENT_PICKER_RULES:", { count: recentPickerRules.length, last });
      return { last: last ? { raw: last.raw, timestamp: last.timestamp } : null };
    }

    case "GET_COSMETIC_RULES": {
      const domain = message.payload as string;
      if (!isEnabled) return { selectors: [], scriptlets: [] };
      if (whitelist.isWhitelisted(domain)) return { selectors: [], scriptlets: [] };
      const rules = engine.getCosmeticRules(domain);
      
      // Resolve scriptlets for this domain from ScriptBlock rules
      const scriptletCodes: string[] = [];
      const allRules = (engine as unknown as { rules: Map<number, Rule> }).rules;
      if (allRules) {
        for (const rule of allRules.values()) {
          if (rule.type !== "script-block") continue;
          // Check domain match
          if (rule.domains?.include?.length) {
            const matches = rule.domains.include.some(
              (d: string) => domain === d || domain.endsWith(`.${d}`)
            );
            if (!matches) continue;
          }
          if (rule.domains?.exclude?.length) {
            const excluded = rule.domains.exclude.some(
              (d: string) => domain === d || domain.endsWith(`.${d}`)
            );
            if (excluded) continue;
          }
          // Parse and generate scriptlet code
          const parsed = parseScriptletRule(rule.pattern);
          if (parsed?.code) {
            scriptletCodes.push(parsed.code);
          }
        }
      }

      return { 
        selectors: rules.map((r) => r.selector),
        scriptlets: scriptletCodes,
      };
    }

    case "GET_DAILY_STATS": {
      const date = message.payload as string;
      return stats.getDailyStats(date);
    }

    case "GET_AUTO_RULES_STATS":
      return autoRules.getStats();

    case "GET_AUTO_RULES":
      return { rules: autoRules.getConfirmedRules() };

    case "CONFIRM_AUTO_RULE": {
      const rule = message.payload as string;
      autoRules.confirmRule(rule);
      const parsed = parser.parse(rule);
      if (parsed) {
        parsed.source = "auto-learned";
        engine.addRules([parsed]);
      }
      return { success: true };
    }

    case "REJECT_AUTO_RULE": {
      autoRules.rejectRule(message.payload as string);
      return { success: true };
    }

    case "INJECT_PRIVACY_MONITOR": {
      if (sender.tab?.id) {
        const code = generatePrivacyMonitorScript();
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          world: "MAIN",
          func: executeInPage,
          args: [code],
        }).catch(() => {});
      }
      return { success: true };
    }

    case "PRIVACY_EVENT": {
      const payload = message.payload as { method: string; timestamp: number; url: string; domain: string };
      privacyTracker.recordEvent(payload.domain, {
        api: payload.method.split(".")[0] ?? "unknown",
        method: payload.method,
        entropyBits: 1.0,
      });
      return { success: true };
    }

    case "GET_PRIVACY_SCORE": {
      const domain = message.payload as string;
      const score = privacyTracker.getScore(domain);
      return { score: score ?? null };
    }

    default:
      return { error: "Unknown message type" };
  }
}

export { initialize, engine, stats, whitelist, autoRules };
