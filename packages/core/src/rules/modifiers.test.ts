/**
 * Tests for extended modifier parsing — full uBO/AdGuard compatibility.
 */

import { describe, it, expect } from "vitest";
import { RuleParser } from "./parser.js";
import { RuleType, RuleAction } from "../types/index.js";
import type { ExtendedModifiers } from "./modifiers.js";

const parser = new RuleParser();

describe("Extended Modifiers", () => {
  describe("$important", () => {
    it("parses $important modifier and sets higher priority", () => {
      const rule = parser.parse("||ads.com^$important");
      expect(rule).not.toBeNull();
      expect(rule!.priority).toBe(150); // higher than normal block (0)
      expect((rule!.modifiers as ExtendedModifiers).important).toBe(true);
    });

    it("$important on exception rule gets priority 200", () => {
      const rule = parser.parse("@@||safe.com^$important");
      expect(rule).not.toBeNull();
      expect(rule!.priority).toBe(200);
    });
  });

  describe("$redirect", () => {
    it("parses $redirect modifier", () => {
      const rule = parser.parse("||ads.com/script.js$script,redirect=noop.js");
      expect(rule).not.toBeNull();
      expect(rule!.action).toBe(RuleAction.Redirect);
      expect(rule!.modifiers.redirect).toBe("noop.js");
      expect(rule!.modifiers.resourceTypes).toContain("script");
    });

    it("parses $redirect with 1x1.gif", () => {
      const rule = parser.parse("||tracker.com/pixel$image,redirect=1x1.gif");
      expect(rule).not.toBeNull();
      expect(rule!.modifiers.redirect).toBe("1x1.gif");
      expect(rule!.modifiers.resourceTypes).toContain("image");
    });
  });

  describe("$removeparam", () => {
    it("parses $removeparam modifier", () => {
      const rule = parser.parse("||example.com^$removeparam=utm_source");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).removeparam).toBe("utm_source");
    });

    it("parses $removeparam with regex", () => {
      const rule = parser.parse("||example.com^$removeparam=/^utm_/");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).removeparam).toBe("/^utm_/");
    });
  });

  describe("$csp", () => {
    it("parses $csp modifier", () => {
      const rule = parser.parse("||example.com^$csp=script-src 'self'");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).csp).toBe("script-src 'self'");
    });
  });

  describe("$badfilter", () => {
    it("parses $badfilter modifier", () => {
      const rule = parser.parse("||ads.com^$badfilter");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).badfilter).toBe(true);
    });
  });

  describe("$denyallow", () => {
    it("parses $denyallow modifier", () => {
      const rule = parser.parse("*$script,domain=example.com,denyallow=cdn.example.com|api.example.com");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).denyallow).toEqual(["cdn.example.com", "api.example.com"]);
    });
  });

  describe("$method", () => {
    it("parses $method modifier", () => {
      const rule = parser.parse("||api.example.com^$method=post|put");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).method).toEqual(["post", "put"]);
    });
  });

  describe("$document / $elemhide / $generichide", () => {
    it("parses $document modifier", () => {
      const rule = parser.parse("@@||example.com^$document");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).document).toBe(true);
    });

    it("parses $elemhide modifier", () => {
      const rule = parser.parse("@@||example.com^$elemhide");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).elemhide).toBe(true);
    });

    it("parses $generichide modifier", () => {
      const rule = parser.parse("@@||example.com^$generichide");
      expect(rule).not.toBeNull();
      expect((rule!.modifiers as ExtendedModifiers).generichide).toBe(true);
    });
  });

  describe("resource type aliases", () => {
    it("parses $xhr as xmlhttprequest", () => {
      const rule = parser.parse("||api.ads.com^$xhr");
      expect(rule).not.toBeNull();
      expect(rule!.modifiers.resourceTypes).toContain("xmlhttprequest");
    });

    it("parses $css as stylesheet", () => {
      const rule = parser.parse("||ads.com/style$css");
      expect(rule).not.toBeNull();
      expect(rule!.modifiers.resourceTypes).toContain("stylesheet");
    });

    it("parses $frame as iframe", () => {
      const rule = parser.parse("||ads.com/frame$frame");
      expect(rule).not.toBeNull();
      expect(rule!.modifiers.resourceTypes).toContain("iframe");
    });
  });

  describe("negated resource types", () => {
    it("parses ~script (all except script)", () => {
      const rule = parser.parse("||ads.com^$~script");
      expect(rule).not.toBeNull();
      expect(rule!.modifiers.resourceTypes).not.toContain("script");
      expect(rule!.modifiers.resourceTypes!.length).toBeGreaterThan(5);
    });
  });

  describe("combined modifiers", () => {
    it("parses complex modifier combination", () => {
      const rule = parser.parse("||tracker.com^$third-party,script,important,domain=site.com|~sub.site.com");
      expect(rule).not.toBeNull();
      expect(rule!.modifiers.thirdParty).toBe(true);
      expect(rule!.modifiers.resourceTypes).toContain("script");
      expect((rule!.modifiers as ExtendedModifiers).important).toBe(true);
      expect(rule!.domains?.include).toContain("site.com");
      expect(rule!.domains?.exclude).toContain("sub.site.com");
      expect(rule!.priority).toBe(150);
    });
  });

  describe("scriptlet rules", () => {
    it("parses scriptlet injection rule", () => {
      const rule = parser.parse('example.com#%#//scriptlet("abort-on-property-read", "adblock")');
      expect(rule).not.toBeNull();
      expect(rule!.type).toBe(RuleType.ScriptBlock);
      expect(rule!.pattern).toContain("abort-on-property-read");
      expect(rule!.domains?.include).toContain("example.com");
    });

    it("parses global scriptlet rule", () => {
      const rule = parser.parse('#%#//scriptlet("prevent-bab")');
      expect(rule).not.toBeNull();
      expect(rule!.type).toBe(RuleType.ScriptBlock);
      expect(rule!.pattern).toContain("prevent-bab");
    });
  });

  describe("cosmetic exception rules", () => {
    it("parses #@# cosmetic exception", () => {
      const rule = parser.parse("example.com#@#.ad-banner");
      expect(rule).not.toBeNull();
      expect(rule!.type).toBe(RuleType.CosmeticHide);
      expect(rule!.action).toBe(RuleAction.Allow);
      expect(rule!.pattern).toBe(".ad-banner");
      expect(rule!.domains?.include).toContain("example.com");
    });
  });
});
