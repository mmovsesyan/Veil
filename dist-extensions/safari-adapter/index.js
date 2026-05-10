var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a;
import { RuleParser, AutoRulesEngine, StatisticsTracker, WhitelistManager } from "@veil/core";
const NATIVE_APP_ID = "com.veil.app";
async function sendNativeMessage(message) {
  var _a2;
  try {
    if (typeof browser !== "undefined" && ((_a2 = browser == null ? void 0 : browser.runtime) == null ? void 0 : _a2.sendNativeMessage)) {
      const response = await browser.runtime.sendNativeMessage(NATIVE_APP_ID, message);
      return response;
    }
    return { success: false, error: "Native messaging API not available" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown native bridge error";
    return { success: false, error: errorMessage };
  }
}
async function reloadContentBlocker(identifier) {
  const response = await sendNativeMessage({
    type: "reload",
    payload: { identifier }
  });
  if (!response.success) {
    throw new Error(
      `Failed to reload content blocker: ${response.error ?? "unknown error"}`
    );
  }
}
const CONTENT_BLOCKER_ID = "com.veil.app.content-blocker";
const _SafariAdapter = class _SafariAdapter {
  constructor() {
    __publicField(this, "navigationCallbacks", []);
  }
  async initialize() {
    try {
      if (typeof browser !== "undefined" && (browser == null ? void 0 : browser.webNavigation)) {
        browser.webNavigation.onCommitted.addListener(
          (details) => {
            if (details.frameId === 0) {
              this.navigationCallbacks.forEach((cb) => cb(details.tabId, details.url));
            }
          }
        );
      }
    } catch {
    }
  }
  async applyRules(rules) {
    var _a2;
    const webkitRules = this.compileToWebKitJSON(rules);
    const chunks = this.splitIntoExtensions(webkitRules);
    try {
      if (typeof browser !== "undefined" && ((_a2 = browser == null ? void 0 : browser.storage) == null ? void 0 : _a2.local)) {
        await browser.storage.local.set({
          veil_webkit_rules: webkitRules,
          veil_webkit_chunks: chunks,
          veil_rules_updated_at: Date.now()
        });
        await reloadContentBlocker(CONTENT_BLOCKER_ID);
      }
    } catch {
    }
  }
  async updateRules(added, removed) {
  }
  async getActiveTabInfo() {
    try {
      if (typeof browser !== "undefined" && (browser == null ? void 0 : browser.tabs)) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
          const tab = tabs[0];
          const url = tab.url ?? "";
          let domain = "";
          try {
            domain = url ? new URL(url).hostname : "";
          } catch {
            domain = "";
          }
          return { id: tab.id ?? 0, url, domain };
        }
      }
    } catch {
    }
    return { id: 0, url: "", domain: "" };
  }
  setBadgeCount(tabId, count) {
    var _a2, _b;
    try {
      if (typeof browser !== "undefined" && ((_a2 = browser == null ? void 0 : browser.action) == null ? void 0 : _a2.setBadgeText)) {
        browser.action.setBadgeText({
          text: count > 0 ? String(count) : "",
          tabId
        });
        browser.action.setBadgeBackgroundColor({
          color: "#6366f1",
          tabId
        });
      } else if (typeof browser !== "undefined" && ((_b = browser == null ? void 0 : browser.browserAction) == null ? void 0 : _b.setBadgeText)) {
        browser.browserAction.setBadgeText({
          text: count > 0 ? String(count) : "",
          tabId
        });
        browser.browserAction.setBadgeBackgroundColor({
          color: "#6366f1",
          tabId
        });
      }
    } catch {
    }
  }
  onNavigationEvent(callback) {
    this.navigationCallbacks.push(callback);
    try {
      if (typeof browser !== "undefined" && (browser == null ? void 0 : browser.webNavigation)) {
        browser.webNavigation.onCommitted.addListener(
          (details) => {
            if (details.frameId === 0) {
              callback(details.tabId, details.url);
            }
          }
        );
      }
    } catch {
    }
  }
  /**
   * Compile internal rules to WebKit Content Blocker JSON format.
   */
  compileToWebKitJSON(rules) {
    return rules.map((rule) => this.ruleToWebKit(rule));
  }
  /**
   * Split rules into chunks that respect Safari's 150,000 rule limit.
   */
  splitIntoExtensions(rules) {
    const chunks = [];
    for (let i = 0; i < rules.length; i += _SafariAdapter.RULE_LIMIT) {
      chunks.push(rules.slice(i, i + _SafariAdapter.RULE_LIMIT));
    }
    return chunks;
  }
  ruleToWebKit(rule) {
    var _a2, _b;
    const trigger = {
      "url-filter": this.patternToRegex(rule.pattern)
    };
    if (rule.modifiers.resourceTypes && rule.modifiers.resourceTypes.length > 0) {
      trigger["resource-type"] = rule.modifiers.resourceTypes.map(
        (t) => this.mapResourceType(t)
      );
    }
    if (((_a2 = rule.domains) == null ? void 0 : _a2.include) && rule.domains.include.length > 0) {
      trigger["if-domain"] = rule.domains.include.map((d) => `*${d}`);
    }
    if (((_b = rule.domains) == null ? void 0 : _b.exclude) && rule.domains.exclude.length > 0) {
      trigger["unless-domain"] = rule.domains.exclude.map((d) => `*${d}`);
    }
    if (rule.modifiers.thirdParty === true) {
      trigger["load-type"] = ["third-party"];
    } else if (rule.modifiers.thirdParty === false) {
      trigger["load-type"] = ["first-party"];
    }
    const action = {
      type: this.mapAction(rule)
    };
    if (rule.type === "cosmetic-hide" || rule.type === "cosmetic-css") {
      action.type = "css-display-none";
      action.selector = rule.pattern;
    }
    return { trigger, action };
  }
  patternToRegex(pattern) {
    if (pattern.startsWith("||")) {
      const domain = pattern.slice(2).replace("^", "");
      return `^https?://([^/]*\\.)?${this.escapeRegex(domain)}`;
    }
    return this.escapeRegex(pattern).replace(/\\\*/g, ".*");
  }
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  mapAction(rule) {
    switch (rule.action) {
      case "block":
        return "block";
      case "allow":
        return "ignore-previous-rules";
      case "block-cookies":
        return "block-cookies";
      case "make-https":
        return "make-https";
      case "css-display-none":
        return "css-display-none";
      default:
        return "block";
    }
  }
  mapResourceType(type) {
    const mapping = {
      script: "script",
      image: "image",
      stylesheet: "style-sheet",
      xmlhttprequest: "raw",
      media: "media",
      font: "font",
      iframe: "document",
      popup: "popup"
    };
    return mapping[type] ?? "raw";
  }
};
__publicField(_SafariAdapter, "RULE_LIMIT", 15e4);
let SafariAdapter = _SafariAdapter;
const parser = new RuleParser();
const adapter = new SafariAdapter();
const autoRules = new AutoRulesEngine();
const stats = new StatisticsTracker();
const whitelist = new WhitelistManager();
const allRules = [];
const MAX_RULES = 5e4;
let isEnabled = true;
async function initialize() {
  try {
    if (typeof browser !== "undefined" && browser.storage) {
      const stored = await browser.storage.local.get(["enabled", "whitelist", "cachedRules", "autoLearnedRules"]);
      isEnabled = stored.enabled !== false;
      if (stored.whitelist && Array.isArray(stored.whitelist)) {
        for (const domain of stored.whitelist) {
          whitelist.add(domain);
        }
      }
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
async function compileAndReload() {
  const webkitRules = adapter.compileToWebKitJSON(allRules);
  const chunks = adapter.splitIntoExtensions(webkitRules);
  if (typeof browser !== "undefined" && browser.storage) {
    await browser.storage.local.set({
      compiledRules: JSON.stringify(chunks[0] ?? []),
      compiledRulesCount: webkitRules.length
    });
  }
  await reloadContentBlocker("com.veil.contentblocker");
}
function processResourceReport(report) {
  if (!isEnabled) return;
  if (whitelist.isWhitelisted(report.targetDomain)) return;
  const confirmed = autoRules.processRequest(
    report.url,
    report.type,
    report.initiatorDomain,
    report.targetDomain,
    false
  );
  if (confirmed) {
    const rule = parser.parse(confirmed.suggestedRule);
    if (rule) {
      rule.source = "auto-learned";
      if (allRules.length >= MAX_RULES) {
        allRules.splice(0, 100);
      }
      allRules.push(rule);
      persistAutoLearnedRules();
      compileAndReload().catch(console.warn);
      console.log(`[Veil Safari Auto-Learn] New rule: ${confirmed.suggestedRule}`);
    }
  }
}
async function persistAutoLearnedRules() {
  if (typeof browser !== "undefined" && browser.storage) {
    await browser.storage.local.set({
      autoLearnedRules: autoRules.getConfirmedRules()
    });
  }
}
if (typeof browser !== "undefined" && ((_a = browser.runtime) == null ? void 0 : _a.onMessage)) {
  browser.runtime.onMessage.addListener((message) => {
    var _a2;
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
        if (!isEnabled) {
          if (typeof browser !== "undefined" && ((_a2 = browser.storage) == null ? void 0 : _a2.local)) {
            browser.storage.local.set({ veil_webkit_rules: "[]" });
          }
          reloadContentBlocker("com.veil.contentblocker").catch(() => {
          });
        } else {
          compileAndReload().catch(() => {
          });
        }
        return Promise.resolve({ enabled: isEnabled });
      case "GET_AUTO_RULES_STATS":
        return Promise.resolve(autoRules.getStats());
      case "GET_AUTO_RULES":
        return Promise.resolve({ rules: autoRules.getConfirmedRules() });
      case "CONFIRM_AUTO_RULE": {
        const raw = message.payload;
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
        autoRules.rejectRule(message.payload);
        return Promise.resolve({ success: true });
      case "ADD_TO_WHITELIST": {
        const domain = message.payload;
        whitelist.add(domain);
        if (typeof browser !== "undefined" && browser.storage) {
          browser.storage.local.set({ whitelist: whitelist.getAll() });
        }
        return Promise.resolve({ success: true });
      }
      case "GET_TAB_STATS":
        return Promise.resolve(stats.getTabStats(message.payload));
      default:
        return Promise.resolve({ error: "Unknown message type" });
    }
  });
}
const SAFARI_CONTENT_SCRIPT = `
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
initialize().catch(console.error);
export {
  SAFARI_CONTENT_SCRIPT,
  SafariAdapter,
  initialize as initSafariBackground,
  autoRules as safariAutoRules
};
//# sourceMappingURL=index.js.map
