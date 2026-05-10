import { IPlatformAdapter, NavigationCallback, Rule, TabInfo } from '@veil/core';
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
        type: "block" | "block-cookies" | "css-display-none" | "ignore-previous-rules" | "make-https";
        selector?: string;
    };
}
/**
 * Safari extension adapter.
 * Compiles rules to WebKit Content Blocker JSON format.
 * Handles the 150,000 rule limit per content blocker extension.
 */
export declare class SafariAdapter implements IPlatformAdapter {
    private static readonly RULE_LIMIT;
    initialize(): Promise<void>;
    applyRules(rules: Rule[]): Promise<void>;
    updateRules(added: Rule[], removed: string[]): Promise<void>;
    getActiveTabInfo(): Promise<TabInfo>;
    setBadgeCount(tabId: number, count: number): void;
    onNavigationEvent(callback: NavigationCallback): void;
    /**
     * Compile internal rules to WebKit Content Blocker JSON format.
     */
    compileToWebKitJSON(rules: Rule[]): WebKitRule[];
    /**
     * Split rules into chunks that respect Safari's 150,000 rule limit.
     */
    splitIntoExtensions(rules: WebKitRule[]): WebKitRule[][];
    private ruleToWebKit;
    private patternToRegex;
    private escapeRegex;
    private mapAction;
    private mapResourceType;
}
//# sourceMappingURL=safari-adapter.d.ts.map