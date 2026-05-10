import type { IPlatformAdapter } from "@veil/core";
import type { NavigationCallback, Rule, TabInfo } from "@veil/core";

/**
 * Firefox extension adapter using webRequest API.
 * Intercepts and blocks requests using onBeforeRequest.
 */
export class FirefoxAdapter implements IPlatformAdapter {
  async initialize(): Promise<void> {
    // Register webRequest listeners
  }

  async applyRules(rules: Rule[]): Promise<void> {
    void rules;
    // In a real implementation, rules are stored and matched in onBeforeRequest
  }

  async updateRules(added: Rule[], removed: string[]): Promise<void> {
    void added;
    void removed;
    // Update the internal rule set
  }

  async getActiveTabInfo(): Promise<TabInfo> {
    // In a real implementation, this would query browser.tabs
    return { id: 0, url: "", domain: "" };
  }

  setBadgeCount(tabId: number, count: number): void {
    void tabId;
    void count;
    // In a real implementation, this would call browser.browserAction.setBadgeText
  }

  onNavigationEvent(callback: NavigationCallback): void {
    void callback;
    // In a real implementation, this would listen to browser.webNavigation events
  }
}
