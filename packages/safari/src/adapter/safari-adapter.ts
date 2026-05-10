import type { IPlatformAdapter } from "@veil/core";
import type { NavigationCallback, Rule, TabInfo } from "@veil/core";
import { reloadContentBlocker } from "../native/bridge.js";

declare const browser: any;

/**
 * WebKit Content Blocker JSON rule format.
 */
export interface WebKitRule {
  trigger: {
    "url-filter": string;
    "resource-type"?: string[];
    "if-domain"?: string[];
    "unless-domain"?: string[];
    "load-type"?: string[];
  };
  action: {
    type:
      | "block"
      | "block-cookies"
      | "css-display-none"
      | "ignore-previous-rules"
      | "make-https";
    selector?: string;
  };
}

/** Content blocker extension identifier */
const CONTENT_BLOCKER_ID = "com.veil.app.content-blocker";

/**
 * Safari extension adapter.
 * Compiles rules to WebKit Content Blocker JSON format.
 * Handles the 150,000 rule limit per content blocker extension.
 */
export class SafariAdapter implements IPlatformAdapter {
  private static readonly RULE_LIMIT = 150000;
  private navigationCallbacks: NavigationCallback[] = [];

  async initialize(): Promise<void> {
    try {
      if (typeof browser !== "undefined" && browser?.webNavigation) {
        browser.webNavigation.onCommitted.addListener(
          (details: { tabId: number; url: string; frameId: number }) => {
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

  async applyRules(rules: Rule[]): Promise<void> {
    const webkitRules = this.compileToWebKitJSON(rules);
    const chunks = this.splitIntoExtensions(webkitRules);

    try {
      if (typeof browser !== "undefined" && browser?.storage?.local) {
        // Store compiled WebKit JSON rules in browser.storage.local
        await browser.storage.local.set({
          veil_webkit_rules: webkitRules,
          veil_webkit_chunks: chunks,
          veil_rules_updated_at: Date.now(),
        });

        // Trigger native content blocker reload
        await reloadContentBlocker(CONTENT_BLOCKER_ID);
      }
    } catch {
      // Storage or native bridge may not be available
    }
  }

  async updateRules(added: Rule[], removed: string[]): Promise<void> {
    void added;
    void removed;
    // Safari requires full recompilation — no incremental updates.
    // Callers should use applyRules() with the full rule set after modifications.
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
      // Safari 16+ supports browser.action.setBadgeText (Manifest V3 style)
      if (typeof browser !== "undefined" && browser?.action?.setBadgeText) {
        browser.action.setBadgeText({
          text: count > 0 ? String(count) : "",
          tabId,
        });
        browser.action.setBadgeBackgroundColor({
          color: "#6366f1",
          tabId,
        });
      } else if (typeof browser !== "undefined" && browser?.browserAction?.setBadgeText) {
        // Fallback for older Safari versions using browserAction
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
      // Badge API may not be available in all Safari versions
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

  /**
   * Compile internal rules to WebKit Content Blocker JSON format.
   */
  compileToWebKitJSON(rules: Rule[]): WebKitRule[] {
    return rules.map((rule) => this.ruleToWebKit(rule));
  }

  /**
   * Split rules into chunks that respect Safari's 150,000 rule limit.
   */
  splitIntoExtensions(rules: WebKitRule[]): WebKitRule[][] {
    const chunks: WebKitRule[][] = [];
    for (let i = 0; i < rules.length; i += SafariAdapter.RULE_LIMIT) {
      chunks.push(rules.slice(i, i + SafariAdapter.RULE_LIMIT));
    }
    return chunks;
  }

  private ruleToWebKit(rule: Rule): WebKitRule {
    const trigger: WebKitRule["trigger"] = {
      "url-filter": this.patternToRegex(rule.pattern),
    };

    // Resource types
    if (rule.modifiers.resourceTypes && rule.modifiers.resourceTypes.length > 0) {
      trigger["resource-type"] = rule.modifiers.resourceTypes.map((t) =>
        this.mapResourceType(t),
      );
    }

    // Domain constraints
    if (rule.domains?.include && rule.domains.include.length > 0) {
      trigger["if-domain"] = rule.domains.include.map((d) => `*${d}`);
    }
    if (rule.domains?.exclude && rule.domains.exclude.length > 0) {
      trigger["unless-domain"] = rule.domains.exclude.map((d) => `*${d}`);
    }

    // Third-party
    if (rule.modifiers.thirdParty === true) {
      trigger["load-type"] = ["third-party"];
    } else if (rule.modifiers.thirdParty === false) {
      trigger["load-type"] = ["first-party"];
    }

    // Action
    const action: WebKitRule["action"] = {
      type: this.mapAction(rule),
    };

    if (rule.type === "cosmetic-hide" || rule.type === "cosmetic-css") {
      action.type = "css-display-none";
      action.selector = rule.pattern;
    }

    return { trigger, action };
  }

  private patternToRegex(pattern: string): string {
    if (pattern.startsWith("||")) {
      const domain = pattern.slice(2).replace("^", "");
      return `^https?://([^/]*\\.)?${this.escapeRegex(domain)}`;
    }
    return this.escapeRegex(pattern).replace(/\\\*/g, ".*");
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private mapAction(rule: Rule): WebKitRule["action"]["type"] {
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

  private mapResourceType(type: string): string {
    const mapping: Record<string, string> = {
      script: "script",
      image: "image",
      stylesheet: "style-sheet",
      xmlhttprequest: "raw",
      media: "media",
      font: "font",
      iframe: "document",
      popup: "popup",
    };
    return mapping[type] ?? "raw";
  }
}
