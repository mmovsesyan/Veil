import type { IPlatformAdapter } from "@veil/core";
import type { NavigationCallback, Rule, TabInfo } from "@veil/core";

/**
 * Chrome extension adapter using Manifest V3 declarativeNetRequest API.
 * Compiles internal rules to Chrome's declarativeNetRequest format and manages
 * dynamic/static rule sets within Chrome's limits.
 */
export class ChromeAdapter implements IPlatformAdapter {
  private static readonly DYNAMIC_RULE_LIMIT = 30000;
  private navigationCallbacks: NavigationCallback[] = [];

  async initialize(): Promise<void> {
    // Listen for navigation events
    if (typeof chrome !== "undefined" && chrome.webNavigation) {
      chrome.webNavigation.onCommitted.addListener((details) => {
        if (details.frameId === 0) {
          for (const cb of this.navigationCallbacks) {
            cb(details.tabId, details.url);
          }
        }
      });
    }
  }

  async applyRules(rules: Rule[]): Promise<void> {
    const dnrRules = this.compileToDeclarativeNetRequest(rules);

    // Enforce Chrome's dynamic rule limit
    const dynamicRules = dnrRules.slice(0, ChromeAdapter.DYNAMIC_RULE_LIMIT);

    if (typeof chrome !== "undefined" && chrome.declarativeNetRequest) {
      // Get existing rule IDs to remove
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = existingRules.map((r) => r.id);

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules: dynamicRules as chrome.declarativeNetRequest.Rule[],
      });
    }

    if (dnrRules.length > ChromeAdapter.DYNAMIC_RULE_LIMIT) {
      console.warn(
        `[ChromeAdapter] ${dnrRules.length} rules exceed limit of ${ChromeAdapter.DYNAMIC_RULE_LIMIT}. ` +
        `${dnrRules.length - ChromeAdapter.DYNAMIC_RULE_LIMIT} rules dropped. Use static rulesets for full coverage.`
      );
    }
  }

  async updateRules(added: Rule[], removed: string[]): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.declarativeNetRequest) return;

    const addRules = this.compileToDeclarativeNetRequest(added);

    // Find IDs of rules to remove (by source matching)
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules
      .filter((r) => {
        // Match by URL filter pattern against removed source IDs
        return removed.some((sourceId) => r.id.toString().startsWith(sourceId.slice(0, 4)));
      })
      .map((r) => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: addRules as chrome.declarativeNetRequest.Rule[],
    });
  }

  async getActiveTabInfo(): Promise<TabInfo> {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      return { id: 0, url: "", domain: "" };
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) {
      return { id: 0, url: "", domain: "" };
    }

    let domain = "";
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      // Invalid URL
    }

    return { id: tab.id, url: tab.url, domain };
  }

  setBadgeCount(tabId: number, count: number): void {
    if (typeof chrome === "undefined" || !chrome.action) return;

    const text = count === 0 ? "" : count > 999 ? "999+" : String(count);
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4A90D9" });
  }

  onNavigationEvent(callback: NavigationCallback): void {
    this.navigationCallbacks.push(callback);
  }

  /**
   * Compile internal rules to Chrome declarativeNetRequest format.
   */
  compileToDeclarativeNetRequest(
    rules: Rule[],
  ): Array<{ id: number; priority: number; action: { type: string }; condition: Record<string, unknown> }> {
    return rules
      .filter((r) => r.type === "network-block" || r.type === "network-allow")
      .map((rule, index) => ({
        id: index + 1,
        priority: rule.priority + 1,
        action: {
          type: rule.type === "network-allow" ? "allow" : "block",
        },
        condition: {
          urlFilter: this.patternToUrlFilter(rule.pattern),
          resourceTypes: rule.modifiers.resourceTypes ?? undefined,
          domainType: rule.modifiers.thirdParty === true ? "thirdParty" : undefined,
          initiatorDomains: rule.domains?.include ?? undefined,
          excludedInitiatorDomains: rule.domains?.exclude ?? undefined,
        },
      }));
  }

  private patternToUrlFilter(pattern: string): string {
    // Convert ABP pattern to Chrome's urlFilter syntax
    if (pattern.startsWith("||")) {
      return pattern; // Chrome supports || syntax natively
    }
    return pattern;
  }
}
