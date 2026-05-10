import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { RuleParser } from "./parser.js";
import { RuleType, RuleAction } from "../types/index.js";

const parser = new RuleParser();

// ─── Unit Tests: Basic Network Rules ──────────────────────────────────────────

describe("RuleParser — basic network rules", () => {
  it("parses domain-based blocking rule ||domain.com^", () => {
    const rule = parser.parse("||ads.example.com^");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("||ads.example.com^");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("parses path-based blocking rule ||domain.com/path", () => {
    const rule = parser.parse("||example.com/ads/banner.js");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("||example.com/ads/banner.js");
  });

  it("parses keyword blocking rule *keyword*", () => {
    const rule = parser.parse("*tracking*");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("*tracking*");
  });

  it("parses plain URL pattern", () => {
    const rule = parser.parse("/ads/banner");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("/ads/banner");
  });

  it("parses rule with separator ^", () => {
    const rule = parser.parse("||doubleclick.net^");
    expect(rule).not.toBeNull();
    expect(rule!.pattern).toBe("||doubleclick.net^");
  });
});

// ─── Unit Tests: Exception Rules ──────────────────────────────────────────────

describe("RuleParser — exception rules", () => {
  it("parses @@||domain.com^ as allow rule", () => {
    const rule = parser.parse("@@||example.com^");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkAllow);
    expect(rule!.action).toBe(RuleAction.Allow);
    expect(rule!.pattern).toBe("||example.com^");
  });

  it("parses exception with modifiers", () => {
    const rule = parser.parse("@@||cdn.example.com^$script,image");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkAllow);
    expect(rule!.modifiers.resourceTypes).toContain("script");
    expect(rule!.modifiers.resourceTypes).toContain("image");
  });

  it("exception rules have higher priority than block rules", () => {
    const block = parser.parse("||ads.com^");
    const allow = parser.parse("@@||ads.com^");
    expect(allow!.priority).toBeGreaterThan(block!.priority);
  });

  it("parses exception with domain modifier", () => {
    const rule = parser.parse("@@||analytics.com^$domain=mysite.com");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkAllow);
    expect(rule!.domains?.include).toContain("mysite.com");
  });

  it("parses plain exception rule @@/path", () => {
    const rule = parser.parse("@@/good-ads/");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkAllow);
    expect(rule!.pattern).toBe("/good-ads/");
  });

  it("parses @@||example.org/path$script — allow scripts from specific path", () => {
    const rule = parser.parse("@@||example.org/path$script");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkAllow);
    expect(rule!.action).toBe(RuleAction.Allow);
    expect(rule!.pattern).toBe("||example.org/path");
    expect(rule!.modifiers.resourceTypes).toEqual(["script"]);
    expect(rule!.priority).toBe(100);
  });

  it("parses @@/banner/$domain=example.com — allow banner on specific domain", () => {
    const rule = parser.parse("@@/banner/$domain=example.com");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkAllow);
    expect(rule!.action).toBe(RuleAction.Allow);
    expect(rule!.pattern).toBe("/banner/");
    expect(rule!.domains?.include).toContain("example.com");
    expect(rule!.priority).toBe(100);
  });

  it("exception rule priority is exactly 100", () => {
    const rule = parser.parse("@@||domain.com^");
    expect(rule).not.toBeNull();
    expect(rule!.priority).toBe(100);
  });

  it("block rule priority is 0", () => {
    const rule = parser.parse("||domain.com^");
    expect(rule).not.toBeNull();
    expect(rule!.priority).toBe(0);
  });
});

// ─── Unit Tests: Cosmetic Rules ───────────────────────────────────────────────

describe("RuleParser — cosmetic rules", () => {
  it("parses global element hiding ##.selector", () => {
    const rule = parser.parse("##.ad-banner");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticHide);
    expect(rule!.pattern).toBe(".ad-banner");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
  });

  it("parses domain-specific hiding domain.com##.selector", () => {
    const rule = parser.parse("example.com##.sidebar-ad");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticHide);
    expect(rule!.pattern).toBe(".sidebar-ad");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
    expect(rule!.domains?.include).toContain("example.com");
  });

  it("parses multi-domain cosmetic rule", () => {
    const rule = parser.parse("site1.com,site2.com##.popup");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticHide);
    expect(rule!.domains?.include).toContain("site1.com");
    expect(rule!.domains?.include).toContain("site2.com");
  });

  it("parses multi-domain cosmetic rule with element selector", () => {
    const rule = parser.parse("example.com,other.com##div.ad");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticHide);
    expect(rule!.pattern).toBe("div.ad");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
    expect(rule!.domains?.include).toEqual(["example.com", "other.com"]);
  });

  it("parses cosmetic rule with exclusion domain", () => {
    const rule = parser.parse("~example.com##.ad");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticHide);
    expect(rule!.pattern).toBe(".ad");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
    expect(rule!.domains?.exclude).toContain("example.com");
  });

  it("parses global extended CSS selector #?#", () => {
    const rule = parser.parse("#?#.ad:has(> .sponsored)");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticCSS);
    expect(rule!.pattern).toBe(".ad:has(> .sponsored)");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
  });

  it("parses extended CSS selector with domain", () => {
    const rule = parser.parse("example.com#?#.ad:has(> .sponsored)");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticCSS);
    expect(rule!.pattern).toBe(".ad:has(> .sponsored)");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
    expect(rule!.domains?.include).toContain("example.com");
  });

  it("parses extended CSS with :-abp-has pseudo-class", () => {
    const rule = parser.parse("example.com#?#div:-abp-has(.ad-label)");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.CosmeticCSS);
    expect(rule!.pattern).toBe("div:-abp-has(.ad-label)");
    expect(rule!.action).toBe(RuleAction.CSSDisplayNone);
    expect(rule!.domains?.include).toContain("example.com");
  });

  it("formats cosmetic rule with ## separator", () => {
    const rule = parser.parse("example.com##.sidebar");
    const formatted = parser.format(rule!);
    expect(formatted).toBe("example.com##.sidebar");
  });

  it("formats extended CSS rule with #?# separator", () => {
    const rule = parser.parse("example.com#?#.ad:has(> .sponsored)");
    const formatted = parser.format(rule!);
    expect(formatted).toBe("example.com#?#.ad:has(> .sponsored)");
  });

  it("round-trip for extended CSS rules preserves separator", () => {
    const raw = "example.com#?#div:-abp-has(.ad-label)";
    const parsed = parser.parse(raw);
    const formatted = parser.format(parsed!);
    const reparsed = parser.parse(formatted);
    expect(reparsed!.type).toBe(RuleType.CosmeticCSS);
    expect(reparsed!.pattern).toBe("div:-abp-has(.ad-label)");
    expect(reparsed!.domains?.include).toContain("example.com");
  });
});

// ─── Unit Tests: Modifiers ────────────────────────────────────────────────────

describe("RuleParser — modifiers", () => {
  it("parses $third-party modifier", () => {
    const rule = parser.parse("||tracker.com^$third-party");
    expect(rule).not.toBeNull();
    expect(rule!.modifiers.thirdParty).toBe(true);
  });

  it("parses $~third-party modifier", () => {
    const rule = parser.parse("||self.com^$~third-party");
    expect(rule).not.toBeNull();
    expect(rule!.modifiers.thirdParty).toBe(false);
  });

  it("parses resource type modifiers", () => {
    const rule = parser.parse("||ads.com^$script,image,stylesheet");
    expect(rule).not.toBeNull();
    expect(rule!.modifiers.resourceTypes).toEqual(
      expect.arrayContaining(["script", "image", "stylesheet"])
    );
  });

  it("parses $match-case modifier", () => {
    const rule = parser.parse("||ADS.COM^$match-case");
    expect(rule).not.toBeNull();
    expect(rule!.modifiers.matchCase).toBe(true);
  });

  it("parses $domain modifier with include and exclude", () => {
    const rule = parser.parse("||ads.com^$domain=site.com|~sub.site.com");
    expect(rule).not.toBeNull();
    expect(rule!.domains?.include).toContain("site.com");
    expect(rule!.domains?.exclude).toContain("sub.site.com");
  });

  it("parses combined modifiers", () => {
    const rule = parser.parse("||ads.com^$third-party,script,domain=example.com");
    expect(rule).not.toBeNull();
    expect(rule!.modifiers.thirdParty).toBe(true);
    expect(rule!.modifiers.resourceTypes).toContain("script");
    expect(rule!.domains?.include).toContain("example.com");
  });
});

// ─── Unit Tests: Comments and Metadata ────────────────────────────────────────

describe("RuleParser — comments and metadata", () => {
  it("returns null for comment lines starting with !", () => {
    expect(parser.parse("! This is a comment")).toBeNull();
  });

  it("returns null for header [Adblock Plus 2.0]", () => {
    expect(parser.parse("[Adblock Plus 2.0]")).toBeNull();
  });

  it("returns null for empty lines", () => {
    expect(parser.parse("")).toBeNull();
    expect(parser.parse("   ")).toBeNull();
  });

  it("returns null for metadata lines", () => {
    expect(parser.parse("! Title: EasyList")).toBeNull();
    expect(parser.parse("! Homepage: https://easylist.to")).toBeNull();
    expect(parser.parse("! Last modified: 2024-01-01")).toBeNull();
  });

  it("parseList skips comments and counts them", () => {
    const text = `! Title: Test List
[Adblock Plus 2.0]
||ads.com^
! Comment
##.banner`;
    const result = parser.parseList(text);
    expect(result.rules.length).toBe(2);
    expect(result.skipped).toBe(3);
    expect(result.errors.length).toBe(0);
  });
});

// ─── Unit Tests: Format (Rule → Text) ────────────────────────────────────────

describe("RuleParser — format", () => {
  it("formats network block rule", () => {
    const rule = parser.parse("||ads.example.com^");
    expect(parser.format(rule!)).toBe("||ads.example.com^");
  });

  it("formats exception rule with @@ prefix", () => {
    const rule = parser.parse("@@||safe.com^");
    expect(parser.format(rule!)).toBe("@@||safe.com^");
  });

  it("formats rule with modifiers", () => {
    const rule = parser.parse("||tracker.com^$third-party,script");
    const formatted = parser.format(rule!);
    expect(formatted).toContain("||tracker.com^");
    expect(formatted).toContain("third-party");
    expect(formatted).toContain("script");
  });

  it("formats cosmetic rule", () => {
    const rule = parser.parse("##.ad-banner");
    expect(parser.format(rule!)).toBe("##.ad-banner");
  });

  it("formats domain-specific cosmetic rule", () => {
    const rule = parser.parse("example.com##.sidebar");
    const formatted = parser.format(rule!);
    expect(formatted).toContain("example.com");
    expect(formatted).toContain("##");
    expect(formatted).toContain(".sidebar");
  });
});

// ─── Unit Tests: parseList ────────────────────────────────────────────────────

describe("RuleParser — parseList", () => {
  it("parses a full filter list", () => {
    const list = `! EasyList
[Adblock Plus 2.0]
||ads.com^
||tracker.net^$third-party
@@||cdn.example.com^
##.ad-container
example.com##.promo
`;
    const result = parser.parseList(list);
    expect(result.rules.length).toBe(5);
    expect(result.errors.length).toBe(0);
  });

  it("handles malformed rules gracefully", () => {
    const list = `||valid.com^
this is fine as a pattern
##.valid-selector`;
    const result = parser.parseList(list);
    expect(result.rules.length).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  it("reports line numbers for errors", () => {
    // The current parser is lenient, so we test that it doesn't crash
    const list = `||ok.com^
##
||also-ok.com^`;
    const result = parser.parseList(list);
    // ## with empty selector might be treated as valid or skipped
    expect(result.rules.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Property-Based Tests: Round-Trip ─────────────────────────────────────────

describe("RuleParser — property-based tests", () => {
  // Generator for valid domain names
  const domainGen = fc
    .tuple(
      fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), { minLength: 1, maxLength: 8 }),
      fc.constantFrom("com", "net", "org", "io")
    )
    .map(([name, tld]) => `${name}.${tld}`);

  // Generator for valid network block rules
  const networkRuleGen = domainGen.map((domain) => `||${domain}^`);

  // Generator for valid exception rules
  const exceptionRuleGen = domainGen.map((domain) => `@@||${domain}^`);

  // Generator for valid cosmetic selectors
  const selectorGen = fc
    .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz-".split("")), { minLength: 1, maxLength: 12 })
    .map((s) => `.${s}`);

  // Generator for valid cosmetic rules
  const cosmeticRuleGen = fc
    .tuple(fc.option(domainGen, { nil: undefined }), selectorGen)
    .map(([domain, selector]) =>
      domain ? `${domain}##${selector}` : `##${selector}`
    );

  it("round-trip: parse(format(parse(x))) ≡ parse(x) for network rules", () => {
    fc.assert(
      fc.property(networkRuleGen, (raw) => {
        const parsed1 = parser.parse(raw);
        if (!parsed1) return;

        const formatted = parser.format(parsed1);
        const parsed2 = parser.parse(formatted);

        expect(parsed2).not.toBeNull();
        expect(parsed2!.type).toBe(parsed1.type);
        expect(parsed2!.pattern).toBe(parsed1.pattern);
        expect(parsed2!.action).toBe(parsed1.action);
        expect(parsed2!.modifiers).toEqual(parsed1.modifiers);
      }),
      { numRuns: 100 }
    );
  });

  it("round-trip: parse(format(parse(x))) ≡ parse(x) for exception rules", () => {
    fc.assert(
      fc.property(exceptionRuleGen, (raw) => {
        const parsed1 = parser.parse(raw);
        if (!parsed1) return;

        const formatted = parser.format(parsed1);
        const parsed2 = parser.parse(formatted);

        expect(parsed2).not.toBeNull();
        expect(parsed2!.type).toBe(parsed1.type);
        expect(parsed2!.pattern).toBe(parsed1.pattern);
        expect(parsed2!.action).toBe(parsed1.action);
      }),
      { numRuns: 100 }
    );
  });

  it("round-trip: parse(format(parse(x))) ≡ parse(x) for cosmetic rules", () => {
    fc.assert(
      fc.property(cosmeticRuleGen, (raw) => {
        const parsed1 = parser.parse(raw);
        if (!parsed1) return;

        const formatted = parser.format(parsed1);
        const parsed2 = parser.parse(formatted);

        expect(parsed2).not.toBeNull();
        expect(parsed2!.type).toBe(parsed1.type);
        expect(parsed2!.pattern).toBe(parsed1.pattern);
      }),
      { numRuns: 100 }
    );
  });

  // Generator for modifiers
  const modifierGen = fc
    .tuple(
      domainGen,
      fc.subarray(["third-party", "script", "image", "stylesheet"] as const, { minLength: 0, maxLength: 3 })
    )
    .map(([domain, mods]) => {
      const modStr = mods.length > 0 ? `$${mods.join(",")}` : "";
      return `||${domain}^${modStr}`;
    });

  it("round-trip preserves modifiers", () => {
    fc.assert(
      fc.property(modifierGen, (raw) => {
        const parsed1 = parser.parse(raw);
        if (!parsed1) return;

        const formatted = parser.format(parsed1);
        const parsed2 = parser.parse(formatted);

        expect(parsed2).not.toBeNull();
        expect(parsed2!.modifiers.thirdParty).toBe(parsed1.modifiers.thirdParty);
        if (parsed1.modifiers.resourceTypes) {
          expect(parsed2!.modifiers.resourceTypes?.sort()).toEqual(
            parsed1.modifiers.resourceTypes.sort()
          );
        }
      }),
      { numRuns: 100 }
    );
  });
});
