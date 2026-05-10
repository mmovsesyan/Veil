import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { BlockingEngine } from "./blocking-engine.js";
import { RuleParser } from "../rules/parser.js";
import { RuleAction } from "../types/index.js";
import type { NetworkRequest } from "../types/index.js";

const parser = new RuleParser();

function makeRequest(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    url: "https://ads.example.com/banner.js",
    type: "script",
    initiatorDomain: "mysite.com",
    targetDomain: "ads.example.com",
    ...overrides,
  };
}

describe("BlockingEngine", () => {
  let engine: BlockingEngine;

  beforeEach(async () => {
    engine = new BlockingEngine();
  });

  // ─── Basic Blocking ───────────────────────────────────────────────────────

  describe("basic blocking", () => {
    it("blocks requests matching a network rule", async () => {
      const rules = [parser.parse("||ads.example.com^")!];
      await engine.initialize(rules);

      const decision = engine.shouldBlock(makeRequest());
      expect(decision.blocked).toBe(true);
    });

    it("allows requests not matching any rule", async () => {
      const rules = [parser.parse("||ads.example.com^")!];
      await engine.initialize(rules);

      const decision = engine.shouldBlock(
        makeRequest({ url: "https://safe.com/page", targetDomain: "safe.com" })
      );
      expect(decision.blocked).toBe(false);
    });

    it("blocks based on URL pattern matching", async () => {
      const rules = [parser.parse("||tracker.net^")!];
      await engine.initialize(rules);

      const decision = engine.shouldBlock(
        makeRequest({ url: "https://tracker.net/pixel.gif", targetDomain: "tracker.net" })
      );
      expect(decision.blocked).toBe(true);
    });

    it("handles multiple rules", async () => {
      const rules = [
        parser.parse("||ads.com^")!,
        parser.parse("||tracker.net^")!,
        parser.parse("||analytics.io^")!,
      ];
      await engine.initialize(rules);

      expect(engine.shouldBlock(makeRequest({ url: "https://ads.com/x", targetDomain: "ads.com" })).blocked).toBe(true);
      expect(engine.shouldBlock(makeRequest({ url: "https://tracker.net/x", targetDomain: "tracker.net" })).blocked).toBe(true);
      expect(engine.shouldBlock(makeRequest({ url: "https://safe.org/x", targetDomain: "safe.org" })).blocked).toBe(false);
    });
  });

  // ─── Exception Rules (Allow) ──────────────────────────────────────────────

  describe("exception rules", () => {
    it("allow rules override block rules", async () => {
      const rules = [
        parser.parse("||cdn.example.com^")!,
        parser.parse("@@||cdn.example.com^")!,
      ];
      await engine.initialize(rules);

      const decision = engine.shouldBlock(
        makeRequest({ url: "https://cdn.example.com/lib.js", targetDomain: "cdn.example.com" })
      );
      expect(decision.blocked).toBe(false);
      expect(decision.action).toBe(RuleAction.Allow);
    });

    it("allow rule only applies to matching URLs", async () => {
      const rules = [
        parser.parse("||ads.com^")!,
        parser.parse("@@||safe.ads.com^")!,
      ];
      await engine.initialize(rules);

      // ads.com should still be blocked
      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/banner", targetDomain: "ads.com" })).blocked
      ).toBe(true);

      // safe.ads.com should be allowed
      expect(
        engine.shouldBlock(makeRequest({ url: "https://safe.ads.com/ok", targetDomain: "safe.ads.com" })).blocked
      ).toBe(false);
    });
  });

  // ─── Resource Type Filtering ──────────────────────────────────────────────

  describe("resource type filtering", () => {
    it("blocks only specified resource types", async () => {
      const rules = [parser.parse("||ads.com^$script")!];
      await engine.initialize(rules);

      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/x.js", targetDomain: "ads.com", type: "script" })).blocked
      ).toBe(true);

      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/x.png", targetDomain: "ads.com", type: "image" })).blocked
      ).toBe(false);
    });
  });

  // ─── Third-Party Filtering ────────────────────────────────────────────────

  describe("third-party filtering", () => {
    it("blocks only third-party requests when $third-party is set", async () => {
      const rules = [parser.parse("||tracker.com^$third-party")!];
      await engine.initialize(rules);

      // Third-party: initiator != target
      expect(
        engine.shouldBlock(makeRequest({
          url: "https://tracker.com/t.js",
          targetDomain: "tracker.com",
          initiatorDomain: "mysite.com",
        })).blocked
      ).toBe(true);

      // First-party: initiator == target
      expect(
        engine.shouldBlock(makeRequest({
          url: "https://tracker.com/t.js",
          targetDomain: "tracker.com",
          initiatorDomain: "tracker.com",
        })).blocked
      ).toBe(false);
    });
  });

  // ─── Dynamic Rule Management ──────────────────────────────────────────────

  describe("addRules / removeRules", () => {
    it("addRules adds new blocking capability", async () => {
      await engine.initialize([]);

      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/x", targetDomain: "ads.com" })).blocked
      ).toBe(false);

      const rule = parser.parse("||ads.com^")!;
      rule.source = "easylist";
      engine.addRules([rule]);

      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/x", targetDomain: "ads.com" })).blocked
      ).toBe(true);
    });

    it("removeRules removes all rules from a source", async () => {
      const rule = parser.parse("||ads.com^")!;
      rule.source = "easylist";
      await engine.initialize([rule]);

      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/x", targetDomain: "ads.com" })).blocked
      ).toBe(true);

      engine.removeRules("easylist");

      expect(
        engine.shouldBlock(makeRequest({ url: "https://ads.com/x", targetDomain: "ads.com" })).blocked
      ).toBe(false);
    });
  });

  // ─── Cosmetic Rules ───────────────────────────────────────────────────────

  describe("cosmetic rules", () => {
    it("returns cosmetic rules for a domain", async () => {
      const rules = [
        parser.parse("##.ad-banner")!,
        parser.parse("example.com##.sidebar-ad")!,
      ];
      await engine.initialize(rules);

      const cosmetic = engine.getCosmeticRules("example.com");
      expect(cosmetic.length).toBe(2);
      expect(cosmetic.map((r) => r.selector)).toContain(".ad-banner");
      expect(cosmetic.map((r) => r.selector)).toContain(".sidebar-ad");
    });

    it("excludes domain-specific rules for other domains", async () => {
      const rules = [
        parser.parse("##.global-ad")!,
        parser.parse("specific.com##.local-ad")!,
      ];
      await engine.initialize(rules);

      const cosmetic = engine.getCosmeticRules("other.com");
      expect(cosmetic.length).toBe(1);
      expect(cosmetic[0]!.selector).toBe(".global-ad");
    });
  });

  // ─── Property-Based Tests ─────────────────────────────────────────────────

  describe("property-based tests", () => {
    const domainGen = fc
      .tuple(
        fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 2, maxLength: 8 }),
        fc.constantFrom("com", "net", "org")
      )
      .map(([name, tld]) => `${name}.${tld}`);

    it("allow rules always override block rules for the same pattern", () => {
      fc.assert(
        fc.property(domainGen, (domain) => {
          const blockRule = parser.parse(`||${domain}^`)!;
          const allowRule = parser.parse(`@@||${domain}^`)!;
          const eng = new BlockingEngine();
          // Synchronous init workaround
          eng.addRules([blockRule, allowRule]);

          const decision = eng.shouldBlock({
            url: `https://${domain}/path`,
            type: "script",
            initiatorDomain: "other.com",
            targetDomain: domain,
          });

          expect(decision.blocked).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it("if no rules match, request is never blocked", () => {
      fc.assert(
        fc.property(domainGen, domainGen, (ruleDomain, requestDomain) => {
          fc.pre(ruleDomain !== requestDomain && !requestDomain.includes(ruleDomain));

          const rule = parser.parse(`||${ruleDomain}^`)!;
          const eng = new BlockingEngine();
          eng.addRules([rule]);

          const decision = eng.shouldBlock({
            url: `https://${requestDomain}/page`,
            type: "script",
            initiatorDomain: "other.com",
            targetDomain: requestDomain,
          });

          expect(decision.blocked).toBe(false);
        }),
        { numRuns: 50 }
      );
    });
  });
});
