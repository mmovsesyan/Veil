/**
 * Firefox extension background script.
 * Uses webRequest API for real-time request interception and blocking.
 */

import { BlockingEngine, RuleParser, StatisticsTracker, WhitelistManager, RuleManager } from "@veil/core";
import { checkKnownCNAMECloak, isTrackerCNAMETarget } from "@veil/core";
import type { ResourceType } from "@veil/core";

declare const browser: any; // Firefox WebExtension API (types handled by @types/webextension-polyfill)

const engine = new BlockingEngine();
const parser = new RuleParser();
const stats = new StatisticsTracker();
const whitelist = new WhitelistManager();
const ruleManager = new RuleManager(engine);

let isEnabled = true;

// ─── Initialization ───────────────────────────────────────────────────────────

async function initializeExtension(): Promise<void> {
  try {
    // Load settings
    const stored = await browser.storage.local.get(["enabled", "whitelist"]);
    isEnabled = stored["enabled"] !== false;

    if (stored["whitelist"] && Array.isArray(stored["whitelist"])) {
      for (const domain of stored["whitelist"] as string[]) {
        whitelist.add(domain);
      }
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
        console.warn(`[Content Blocker] Failed to load ${listId}:`, e);
      }
    }

    ruleManager.startAutoUpdates();
    console.log("[Content Blocker] Firefox extension initialized");
  } catch (e) {
    console.error("[Content Blocker] Init failed:", e);
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
      const result = ruleManager.addCustomRule(message.payload as string);
      return Promise.resolve(result);
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
