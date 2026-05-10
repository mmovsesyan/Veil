import type { IPlatformAdapter } from "@veil/core";
import type { NavigationCallback, Rule, TabInfo } from "@veil/core";

declare const browser: any;

/**
 * Firefox extension adapter using webRequest API.
 * Intercepts and blocks requests using onBeforeRequest.
 */
export class FirefoxAdapter implements IPlatformAdapter {
  private rules: Rule[] = [];

  async initialize(): Promise<void> {
    try {
      // Register webNavigation listener to track page loads
      if (typeof browser !== "undefined" && browser?.webNavigation) {
        browser.webNavigation.onCommitted.addListener(
          (details: { tabId: number; url: string; frameId: number }) => {
            // Only handle main frame navigations
            if (details.frameId === 0) {
              this.navigationCallbacks.forEach((cb) => cb(details.tabId, details.url));
            }
          },
        );
      }
    } catch {
      // webNavigation may not be available in all contexts
    }
  }

  private navigationCallbacks: NavigationCallback[] = [];

  async applyRules(rules: Rule[]): Promise<void> {
    // Store rules internally — Firefox uses webRequest for matching,
    // not declarativeNetRequest like Chrome
    this.rules = [...rules];
  }

  async updateRules(added: Rule[], removed: string[]): Promise<void> {
    // Remove rules by ID
    this.rules = this.rules.filter((r) => !removed.includes(r.id));
    // Add new rules
    this.rules.push(...added);
  }

  async getActiveTabInfo(): Promise<TabInfo> {
    try {
      if (typeof browser !== "undefined" && browser?.tabs) {
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
      // tabs API may not be available
    }
    return { id: 0, url: "", domain: "" };
  }

  setBadgeCount(tabId: number, count: number): void {
    try {
      if (typeof browser !== "undefined" && browser?.browserAction) {
        browser.browserAction.setBadgeText({
          text: count > 0 ? String(count) : "",
          tabId,
        });
        browser.browserAction.setBadgeBackgroundColor({
          color: "#6366f1",
          tabId,
        });
      }
    } catch {
      // browserAction may not be available
    }
  }

  onNavigationEvent(callback: NavigationCallback): void {
    this.navigationCallbacks.push(callback);

    try {
      if (typeof browser !== "undefined" && browser?.webNavigation) {
        browser.webNavigation.onCommitted.addListener(
          (details: { tabId: number; url: string; frameId: number }) => {
            if (details.frameId === 0) {
              callback(details.tabId, details.url);
            }
          },
        );
      }
    } catch {
      // webNavigation may not be available
    }
  }
}
