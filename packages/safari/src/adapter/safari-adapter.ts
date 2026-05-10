import type { IPlatformAdapter } from "@veil/core";
import type { NavigationCallback, Rule, TabInfo } from "@veil/core";

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

/**
 * Safari extension adapter.
 * Compiles rules to WebKit Content Blocker JSON format.
 * Handles the 150,000 rule limit per content blocker extension.
 */
export class SafariAdapter implements IPlatformAdapter {
  private static readonly RULE_LIMIT = 150000;

  async initialize(): Promise<void> {
    // Initialize Safari Web Extension
  }

  async applyRules(rules: Rule[]): Promise<void> {
    const webkitRules = this.compileToWebKitJSON(rules);
    this.splitIntoExtensions(webkitRules);
    // In a real implementation, this would call SFContentBlockerManager
  }

  async updateRules(added: Rule[], removed: string[]): Promise<void> {
    void added;
    void removed;
    // Safari requires full recompilation — no incremental updates
  }

  async getActiveTabInfo(): Promise<TabInfo> {
    return { id: 0, url: "", domain: "" };
  }

  setBadgeCount(tabId: number, count: number): void {
    void tabId;
    void count;
    // Safari has limited badge support
  }

  onNavigationEvent(callback: NavigationCallback): void {
    void callback;
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
