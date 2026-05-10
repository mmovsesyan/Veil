/**
 * Safari Web Extension background script.
 * 
 * Safari Content Blocker API is declarative — rules are compiled to JSON
 * and the system handles blocking. However, Safari Web Extensions (since Safari 15)
 * support a background script that can:
 * 1. Manage rule compilation and updates
 * 2. Communicate with content scripts
 * 3. Run auto-learning on observed page resources
 * 4. Sync settings via native messaging
 * 
 * Auto-learning in Safari:
 * Since Safari doesn't expose webRequest API, we use a content script
 * that reports loaded third-party resources via Performance Observer.
 * The background script analyzes these and learns new patterns.
 */

import { RuleParser, AutoRulesEngine, StatisticsTracker, WhitelistManager } from "@veil/core";
import type { Rule } from "@veil/core";
import { SafariAdapter } from "../adapter/safari-adapter.js";
import { reloadContentBlocker } from "../native/bridge.js";

// ─── Core instances ───────────────────────────────────────────────────────────

const parser = new RuleParser();
const adapter = new SafariAdapter();
const autoRules = new AutoRulesEngine();
const stats = new StatisticsTracker();
const whitelist = new WhitelistManager();

const allRules: Rule[] = [];
let isEnabled = true;

// ─── Initialization ───────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  try {
    // Load settings from browser.storage
    if (typeof browser !== "undefined" && browser.storage) {
      const stored = await browser.storage.local.get(["enabled", "whitelist", "cachedRules", "autoLearnedRules"]);
      isEnabled = stored.enabled !== false;

      if (stored.whitelist && Array.isArray(stored.whitelist)) {
        for (const domain of stored.whitelist) {
          whitelist.add(domain);
        }
      }

      // Restore auto-learned rules
      if (stored.autoLearnedRules && Array.isArray(stored.autoLearnedRules)) {
        for (const raw of stored.autoLearnedRules) {
          autoRules.confirmRule(raw);
          const rule = parser.parse(raw);
          if (rule) {
            rule.source = "auto-learned";
            allRules.push(rule);
          }
        }
      }
    }

    console.log("[Veil Safari] Initialized");
  } catch (e) {
    console.error("[Veil Safari] Init error:", e);
  }
}

// ─── Rule Compilation ─────────────────────────────────────────────────────────

/**
 * Compile all rules to WebKit JSON and trigger content blocker reload.
 */
async function compileAndReload(): Promise<void> {
  const webkitRules = adapter.compileToWebKitJSON(allRules);
  const chunks = adapter.splitIntoExtensions(webkitRules);

  // Store compiled rules for native side to pick up
  if (typeof browser !== "undefined" && browser.storage) {
    await browser.storage.local.set({
      compiledRules: JSON.stringify(chunks[0] ?? []),
      compiledRulesCount: webkitRules.length,
    });
  }

  // Tell native side to reload
  await reloadContentBlocker("com.veil.contentblocker");
}

// ─── Auto-Learning via Content Script Reports ─────────────────────────────────

/**
 * Process resource reports from content scripts.
 * Content scripts use PerformanceObserver to detect loaded third-party resources
 * and report them here for analysis.
 */
function processResourceReport(report: {
  url: string;
  type: string;
  initiatorDomain: string;
  targetDomain: string;
}): void {
  if (!isEnabled) return;
  if (whitelist.isWhitelisted(report.targetDomain)) return;

  const confirmed = autoRules.processRequest(
    report.url,
    report.type,
    report.initiatorDomain,
    report.targetDomain,
    false,
  );

  if (confirmed) {
    const rule = parser.parse(confirmed.suggestedRule);
    if (rule) {
      rule.source = "auto-learned";
      allRules.push(rule);

      // Persist auto-learned rules
      persistAutoLearnedRules();

      // Recompile content blocker with new rule
      compileAndReload().catch(console.warn);

      console.log(`[Veil Safari Auto-Learn] New rule: ${confirmed.suggestedRule}`);
    }
  }
}

async function persistAutoLearnedRules(): Promise<void> {
  if (typeof browser !== "undefined" && browser.storage) {
    await browser.storage.local.set({
      autoLearnedRules: autoRules.getConfirmedRules(),
    });
  }
}

// ─── Message Handling ─────────────────────────────────────────────────────────

if (typeof browser !== "undefined" && browser.runtime?.onMessage) {
  browser.runtime.onMessage.addListener((message: { type: string; payload?: any }) => {
    switch (message.type) {
      case "RESOURCE_REPORT":
        processResourceReport(message.payload);
        return Promise.resolve({ success: true });

      case "GET_STATUS":
        return Promise.resolve({ enabled: isEnabled, rulesCount: allRules.length });

      case "TOGGLE_ENABLED":
        isEnabled = !isEnabled;
        if (typeof browser !== "undefined" && browser.storage) {
          browser.storage.local.set({ enabled: isEnabled });
        }
        // Recompile content blocker: empty rules when disabled, full rules when enabled
        if (!isEnabled) {
          // Store empty rules to effectively disable blocking
          if (typeof browser !== "undefined" && browser.storage?.local) {
            browser.storage.local.set({ veil_webkit_rules: "[]" });
          }
          reloadContentBlocker("com.veil.contentblocker").catch(() => {});
        } else {
          // Recompile with full rules
          compileAndReload().catch(() => {});
        }
        return Promise.resolve({ enabled: isEnabled });

      case "GET_AUTO_RULES_STATS":
        return Promise.resolve(autoRules.getStats());

      case "GET_AUTO_RULES":
        return Promise.resolve({ rules: autoRules.getConfirmedRules() });

      case "CONFIRM_AUTO_RULE": {
        const raw = message.payload as string;
        autoRules.confirmRule(raw);
        const rule = parser.parse(raw);
        if (rule) {
          rule.source = "auto-learned";
          allRules.push(rule);
          compileAndReload().catch(console.warn);
        }
        persistAutoLearnedRules();
        return Promise.resolve({ success: true });
      }

      case "REJECT_AUTO_RULE":
        autoRules.rejectRule(message.payload as string);
        return Promise.resolve({ success: true });

      case "ADD_TO_WHITELIST": {
        const domain = message.payload as string;
        whitelist.add(domain);
        if (typeof browser !== "undefined" && browser.storage) {
          browser.storage.local.set({ whitelist: whitelist.getAll() });
        }
        return Promise.resolve({ success: true });
      }

      case "GET_TAB_STATS":
        return Promise.resolve(stats.getTabStats(message.payload as number));

      default:
        return Promise.resolve({ error: "Unknown message type" });
    }
  });
}

// ─── Content Script for Resource Observation ──────────────────────────────────

/**
 * Code injected into pages to observe loaded resources.
 * Uses PerformanceObserver to detect third-party requests that weren't blocked.
 */
export const SAFARI_CONTENT_SCRIPT = `
(function() {
  var pageDomain = window.location.hostname;
  
  // Use PerformanceObserver to detect loaded resources
  var observer = new PerformanceObserver(function(list) {
    var entries = list.getEntries();
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.entryType !== "resource") continue;
      
      try {
        var url = new URL(entry.name);
        var targetDomain = url.hostname;
        
        // Only report third-party resources
        if (targetDomain === pageDomain) continue;
        if (targetDomain.endsWith("." + pageDomain)) continue;
        
        // Determine resource type from initiatorType
        var type = "other";
        if (entry.initiatorType === "script") type = "script";
        else if (entry.initiatorType === "img") type = "image";
        else if (entry.initiatorType === "css" || entry.initiatorType === "link") type = "stylesheet";
        else if (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") type = "xmlhttprequest";
        else if (entry.initiatorType === "iframe") type = "iframe";
        
        // Report to background
        browser.runtime.sendMessage({
          type: "RESOURCE_REPORT",
          payload: {
            url: entry.name,
            type: type,
            initiatorDomain: pageDomain,
            targetDomain: targetDomain
          }
        }).catch(function() {});
      } catch(e) {}
    }
  });
  
  observer.observe({ type: "resource", buffered: true });
})();
`;

// Initialize
declare const browser: any;
initialize().catch(console.error);

export { initialize, processResourceReport, compileAndReload, autoRules, stats, whitelist };
