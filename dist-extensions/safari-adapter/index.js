var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const _SafariAdapter = class _SafariAdapter {
  async initialize() {
  }
  async applyRules(rules) {
    const webkitRules = this.compileToWebKitJSON(rules);
    this.splitIntoExtensions(webkitRules);
  }
  async updateRules(added, removed) {
  }
  async getActiveTabInfo() {
    return { id: 0, url: "", domain: "" };
  }
  setBadgeCount(tabId, count) {
  }
  onNavigationEvent(callback) {
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
    var _a, _b;
    const trigger = {
      "url-filter": this.patternToRegex(rule.pattern)
    };
    if (rule.modifiers.resourceTypes && rule.modifiers.resourceTypes.length > 0) {
      trigger["resource-type"] = rule.modifiers.resourceTypes.map(
        (t) => this.mapResourceType(t)
      );
    }
    if (((_a = rule.domains) == null ? void 0 : _a.include) && rule.domains.include.length > 0) {
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
export {
  SafariAdapter
};
//# sourceMappingURL=index.js.map
