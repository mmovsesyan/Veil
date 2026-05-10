import type { IRuleParser } from "../types/interfaces.js";
import type { DomainConstraint, ParseResult, Rule, RuleModifiers } from "../types/index.js";
import { RuleAction, RuleType } from "../types/index.js";
import { parseModifiers as parseExtendedModifiers, formatModifiers as formatExtendedModifiers } from "./modifiers.js";
import type { ExtendedModifiers } from "./modifiers.js";

/**
 * Production-grade parser for Adblock Plus / uBlock Origin / AdGuard filter syntax.
 * 
 * Supports:
 * - Network rules: ||domain.com^, ||domain.com/path$modifiers
 * - Exception rules: @@||domain.com^
 * - Cosmetic rules: ##.selector, #?#.selector (extended CSS)
 * - Scriptlet rules: #%#//scriptlet("name", "arg1")
 * - HTML filtering: $$script[tag-content="ad"]
 * - All modifiers: $important, $redirect, $csp, $removeparam, $badfilter, etc.
 * - Regex rules: /regex/$modifiers
 */
export class RuleParser implements IRuleParser {
  private ruleCounter = 0;

  parse(rawRule: string): Rule | null {
    const trimmed = rawRule.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("[")) {
      return null;
    }

    // Scriptlet injection rules: domain#%#//scriptlet(...)
    if (trimmed.includes("#%#")) {
      return this.parseScriptletRule(trimmed);
    }

    // HTML filtering rules: domain$$selector
    if (trimmed.includes("$$") && !trimmed.startsWith("@@")) {
      return this.parseHtmlFilterRule(trimmed);
    }

    // Cosmetic rules (check after scriptlet to avoid false positives)
    if (trimmed.includes("##") || trimmed.includes("#?#") || trimmed.includes("#@#")) {
      // Exception cosmetic rules: domain#@#.selector
      if (trimmed.includes("#@#")) {
        return this.parseCosmeticExceptionRule(trimmed);
      }
      return this.parseCosmeticRule(trimmed);
    }

    // Exception rules
    if (trimmed.startsWith("@@")) {
      return this.parseNetworkRule(trimmed.slice(2), true);
    }

    // Network block rules
    return this.parseNetworkRule(trimmed, false);
  }

  parseList(rawText: string): ParseResult {
    const lines = rawText.split("\n");
    const rules: Rule[] = [];
    const errors: Array<{ line: number; content: string; reason: string }> = [];
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();

      if (!line || line.startsWith("!") || line.startsWith("[")) {
        skipped++;
        continue;
      }

      try {
        const rule = this.parse(line);
        if (rule) {
          rules.push(rule);
        } else {
          skipped++;
        }
      } catch (e) {
        errors.push({
          line: i + 1,
          content: line,
          reason: e instanceof Error ? e.message : "Unknown parse error",
        });
      }
    }

    return { rules, errors, skipped };
  }

  format(rule: Rule): string {
    switch (rule.type) {
      case RuleType.NetworkAllow:
        return `@@${this.formatNetworkPattern(rule)}`;
      case RuleType.NetworkBlock:
        return this.formatNetworkPattern(rule);
      case RuleType.CosmeticHide:
        return this.formatCosmeticRule(rule);
      case RuleType.CosmeticCSS:
        return this.formatCosmeticRule(rule);
      case RuleType.ScriptBlock:
        return this.formatNetworkPattern(rule);
      case RuleType.Comment:
        return `! ${rule.pattern}`;
    }
  }

  private parseCosmeticRule(raw: string): Rule {
    const isExtended = raw.includes("#?#");
    const separator = isExtended ? "#?#" : "##";
    const separatorIndex = raw.indexOf(separator);
    const domainPart = raw.slice(0, separatorIndex);
    const selector = raw.slice(separatorIndex + separator.length);

    const domains = domainPart
      ? this.parseDomainList(domainPart)
      : undefined;

    return {
      id: this.generateId(),
      type: isExtended ? RuleType.CosmeticCSS : RuleType.CosmeticHide,
      pattern: selector,
      action: RuleAction.CSSDisplayNone,
      modifiers: {},
      domains,
      priority: 0,
      source: "custom",
    };
  }

  private parseNetworkRule(raw: string, isAllow: boolean): Rule {
    const { pattern, modifierStr } = this.splitModifierString(raw);

    let modifiers: RuleModifiers = {};
    let domains: DomainConstraint | undefined;
    let action: RuleAction = isAllow ? RuleAction.Allow : RuleAction.Block;
    let priority = isAllow ? 100 : 0;

    if (modifierStr) {
      const parsed = parseExtendedModifiers(modifierStr);
      modifiers = parsed.modifiers as RuleModifiers;
      domains = parsed.domains;

      // Handle $important — highest priority
      if ((parsed.modifiers as ExtendedModifiers).important) {
        priority = isAllow ? 200 : 150;
        (modifiers as ExtendedModifiers).important = true;
      }

      // Handle $redirect — change action
      if ((parsed.modifiers as ExtendedModifiers).redirect) {
        action = RuleAction.Redirect;
        modifiers.redirect = (parsed.modifiers as ExtendedModifiers).redirect;
      }

      // Handle $badfilter
      if ((parsed.modifiers as ExtendedModifiers).badfilter) {
        (modifiers as ExtendedModifiers).badfilter = true;
      }
    }

    return {
      id: this.generateId(),
      type: isAllow ? RuleType.NetworkAllow : RuleType.NetworkBlock,
      pattern,
      action,
      modifiers,
      domains,
      priority,
      source: "custom",
    };
  }

  private splitModifierString(raw: string): { pattern: string; modifierStr: string } {
    // Handle regex rules: /regex/$modifiers
    if (raw.startsWith("/")) {
      const lastSlash = raw.lastIndexOf("/");
      if (lastSlash > 0) {
        const afterSlash = raw.slice(lastSlash + 1);
        if (afterSlash.startsWith("$")) {
          return {
            pattern: raw.slice(0, lastSlash + 1),
            modifierStr: afterSlash.slice(1),
          };
        }
        // Regex without modifiers
        if (!afterSlash.includes("$")) {
          return { pattern: raw, modifierStr: "" };
        }
      }
    }

    // Find the last $ that's not inside a regex
    const dollarIndex = this.findModifierSeparator(raw);
    if (dollarIndex === -1) {
      return { pattern: raw, modifierStr: "" };
    }

    return {
      pattern: raw.slice(0, dollarIndex),
      modifierStr: raw.slice(dollarIndex + 1),
    };
  }

  /**
   * Find the $ separator between pattern and modifiers.
   * Handles edge cases like $$ in regex patterns.
   */
  private findModifierSeparator(raw: string): number {
    // Simple case: last $ in the string
    const idx = raw.lastIndexOf("$");
    if (idx <= 0) return -1;

    // Verify it's not part of a regex pattern
    const afterDollar = raw.slice(idx + 1);

    // If what follows looks like modifiers (contains known modifier keywords), it's a separator
    if (this.looksLikeModifiers(afterDollar)) {
      return idx;
    }

    return -1;
  }

  private looksLikeModifiers(str: string): boolean {
    const knownPrefixes = [
      "third-party", "~third-party", "first-party", "1p", "3p",
      "important", "badfilter", "match-case", "domain=", "from=",
      "redirect=", "redirect-rule=", "csp=", "removeparam=", "queryprune=",
      "permissions=", "to=", "denyallow=", "method=", "header=",
      "cookie=", "replace=", "document", "doc", "elemhide", "generichide",
      "ghide", "genericblock", "specifichide", "shide", "all", "popup",
      "strict1p", "strict3p",
      "script", "image", "stylesheet", "xmlhttprequest", "xhr", "css",
      "media", "font", "iframe", "frame", "subdocument", "other",
      "~script", "~image", "~stylesheet", "~xmlhttprequest",
      "~media", "~font", "~iframe", "~other",
      "object", "websocket", "webrtc", "ping",
    ];

    const firstPart = str.split(",")[0]?.toLowerCase().trim() ?? "";
    return knownPrefixes.some((p) => firstPart === p || firstPart.startsWith(p));
  }

  private parseDomainList(raw: string): { include?: string[]; exclude?: string[] } | undefined {
    // Domains can be separated by | (in modifiers) or , (in cosmetic rules)
    const separator = raw.includes("|") ? "|" : ",";
    const parts = raw.split(separator).map((d) => d.trim()).filter(Boolean);
    const include: string[] = [];
    const exclude: string[] = [];

    for (const part of parts) {
      if (part.startsWith("~")) {
        exclude.push(part.slice(1));
      } else {
        include.push(part);
      }
    }

    const result: { include?: string[]; exclude?: string[] } = {};
    if (include.length > 0) result.include = include;
    if (exclude.length > 0) result.exclude = exclude;
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private formatNetworkPattern(rule: Rule): string {
    let result = rule.pattern;
    const modStr = formatExtendedModifiers(
      rule.modifiers as ExtendedModifiers,
      rule.domains
    );

    if (modStr) {
      result += `$${modStr}`;
    }

    return result;
  }

  // ─── Scriptlet Rules ────────────────────────────────────────────────────────

  private parseScriptletRule(raw: string): Rule {
    const separatorIdx = raw.indexOf("#%#");
    const domainPart = raw.slice(0, separatorIdx);
    const scriptletPart = raw.slice(separatorIdx + 3);

    const domains = domainPart ? this.parseDomainList(domainPart) : undefined;

    return {
      id: this.generateId(),
      type: RuleType.ScriptBlock,
      pattern: scriptletPart.trim(),
      action: RuleAction.Block,
      modifiers: {},
      domains,
      priority: 0,
      source: "custom",
    };
  }

  // ─── HTML Filtering Rules ───────────────────────────────────────────────────

  private parseHtmlFilterRule(raw: string): Rule {
    const separatorIdx = raw.indexOf("$$");
    const domainPart = raw.slice(0, separatorIdx);
    const selectorPart = raw.slice(separatorIdx + 2);

    const domains = domainPart ? this.parseDomainList(domainPart) : undefined;

    return {
      id: this.generateId(),
      type: RuleType.CosmeticHide,
      pattern: `$$${selectorPart}`,
      action: RuleAction.Block,
      modifiers: {},
      domains,
      priority: 0,
      source: "custom",
    };
  }

  // ─── Cosmetic Exception Rules ───────────────────────────────────────────────

  private parseCosmeticExceptionRule(raw: string): Rule {
    const separatorIdx = raw.indexOf("#@#");
    const domainPart = raw.slice(0, separatorIdx);
    const selector = raw.slice(separatorIdx + 3);

    const domains = domainPart ? this.parseDomainList(domainPart) : undefined;

    return {
      id: this.generateId(),
      type: RuleType.CosmeticHide,
      pattern: selector,
      action: RuleAction.Allow, // Exception cosmetic rule
      modifiers: {},
      domains,
      priority: 100,
      source: "custom",
    };
  }

  private formatCosmeticRule(rule: Rule): string {
    const domainPart = rule.domains
      ? [
          ...(rule.domains.include ?? []),
          ...(rule.domains.exclude ?? []).map((d) => `~${d}`),
        ].join(",")
      : "";

    const separator = rule.type === RuleType.CosmeticCSS ? "#?#" : "##";
    return `${domainPart}${separator}${rule.pattern}`;
  }

  private generateId(): string {
    return `rule_${Date.now()}_${++this.ruleCounter}`;
  }
}
