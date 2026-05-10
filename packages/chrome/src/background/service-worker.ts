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
import type { Rule, CosmeticRule } from "@veil/core";

// ─── Core instances ───────────────────────────────────────────────────────────

const engine = new BlockingEngine();
const parser = new RuleParser();
const stats = new StatisticsTracker();
const whitelist = new WhitelistManager();
const autoRules = new AutoRulesEngine();

let isEnabled = true;
const cosmeticRulesCache = new Map<string, CosmeticRule[]>();

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

// Also initialize immediately (service worker can restart at any time)
initialize().catch(console.error);

async function initialize(): Promise<void> {
  try {
    // 1. Load settings from storage (instant, no network)
    const stored = await chrome.storage.local.get([
      "enabled",
      "whitelist",
      "customRules",
      "cachedRules",
    ]);

    isEnabled = stored["enabled"] !== false;

    // 2. Restore whitelist
    const wl = stored["whitelist"] as string[] | undefined;
    if (wl) {
      for (const domain of wl) {
        whitelist.add(domain);
      }
    }

    // 3. Load rules — prefer cached, fallback to empty
    const cachedRules = stored["cachedRules"] as string | undefined;
    if (cachedRules) {
      const result = parser.parseList(cachedRules);
      await engine.initialize(result.rules);
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

    // 5. Schedule background filter list update (non-blocking)
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

        // If a new rule was auto-confirmed, add it to the engine
        if (confirmed) {
          const rule = parser.parse(confirmed.suggestedRule);
          if (rule) {
            rule.source = "auto-learned";
            engine.addRules([rule]);
            console.log(`[Veil Auto-Learn] New rule confirmed: ${confirmed.suggestedRule}`);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((e) => {
    sendResponse({ error: String(e) });
  });
  return true; // Keep channel open for async
});

async function handleMessage(message: { type: string; payload?: unknown }): Promise<unknown> {
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
          // Also disable static rulesets
          const staticSets = await chrome.declarativeNetRequest.getEnabledRulesets();
          if (staticSets.length > 0) {
            await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: staticSets });
          }
        } catch { /* ignore errors */ }
      } else {
        // Re-enable: reload rules from cache
        try {
          const stored = await chrome.storage.local.get("cachedRules");
          if (stored.cachedRules) {
            const result = parser.parseList(stored.cachedRules as string);
            await engine.initialize(result.rules);
            await updateDNRRules(result.rules);
          }
          // Re-enable static rulesets
          await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["default_rules"] });
        } catch { /* ignore errors */ }
      }

      return { enabled: isEnabled };
    }

    case "ADD_TO_WHITELIST": {
      const domain = message.payload as string;
      whitelist.add(domain);
      const all = whitelist.getAll();
      await chrome.storage.local.set({ whitelist: all });

      // Add DNR allowAllRequests rule for this domain
      try {
        const whitelistRuleId = 900000 + all.indexOf(domain);
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
          removeRuleIds: [],
        });
      } catch { /* DNR update may fail for invalid domains */ }

      return { success: true };
    }

    case "REMOVE_FROM_WHITELIST": {
      const domain = message.payload as string;
      const allBefore = whitelist.getAll();
      const ruleIdToRemove = 900000 + allBefore.indexOf(domain);
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
      engine.addRules([rule]);

      // Persist
      const stored = await chrome.storage.local.get(["customRules"]);
      const existing = (stored["customRules"] as string[]) ?? [];
      existing.push(raw);
      await chrome.storage.local.set({ customRules: existing });

      return { success: true };
    }

    case "GET_COSMETIC_RULES": {
      const domain = message.payload as string;
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

    default:
      return { error: "Unknown message type" };
  }
}

export { initialize, engine, stats, whitelist, autoRules };
