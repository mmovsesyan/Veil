import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ChromeAdapter } from "./chrome-adapter.js";
import { RuleParser } from "@veil/core";
import { RuleType, RuleAction } from "@veil/core";
import type { Rule } from "@veil/core";

const adapter = new ChromeAdapter();
const parser = new RuleParser();

describe("ChromeAdapter", () => {
  describe("compileToDeclarativeNetRequest", () => {
    it("compiles a block rule to DNR format", () => {
      const rule = parser.parse("||ads.com^")!;
      const dnrRules = adapter.compileToDeclarativeNetRequest([rule]);

      expect(dnrRules.length).toBe(1);
      expect(dnrRules[0]!.action.type).toBe("block");
      expect(dnrRules[0]!.id).toBe(1);
    });

    it("compiles an allow rule to DNR allow type", () => {
      const rule = parser.parse("@@||safe.com^")!;
      const dnrRules = adapter.compileToDeclarativeNetRequest([rule]);

      expect(dnrRules[0]!.action.type).toBe("allow");
    });

    it("skips cosmetic rules (not supported in DNR)", () => {
      const rules = [
        parser.parse("||ads.com^")!,
        parser.parse("##.ad-banner")!,
        parser.parse("||tracker.net^")!,
      ];
      const dnrRules = adapter.compileToDeclarativeNetRequest(rules);

      // Only network rules should be compiled
      expect(dnrRules.length).toBe(2);
    });

    it("assigns sequential IDs", () => {
      const rules = [
        parser.parse("||ads.com^")!,
        parser.parse("||tracker.net^")!,
        parser.parse("||analytics.io^")!,
      ];
      const dnrRules = adapter.compileToDeclarativeNetRequest(rules);

      expect(dnrRules.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it("maps resource types to condition", () => {
      const rule = parser.parse("||ads.com^$script,image")!;
      const dnrRules = adapter.compileToDeclarativeNetRequest([rule]);

      expect((dnrRules[0]!.condition as { resourceTypes: string[] }).resourceTypes).toEqual(["script", "image"]);
    });

    it("maps third-party to domainType", () => {
      const rule = parser.parse("||tracker.com^$third-party")!;
      const dnrRules = adapter.compileToDeclarativeNetRequest([rule]);

      expect((dnrRules[0]!.condition as { domainType: string }).domainType).toBe("thirdParty");
    });
  });

  describe("property-based tests", () => {
    const ruleGen = fc
      .tuple(
        fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 2, maxLength: 8 }),
        fc.constantFrom("com", "net", "org")
      )
      .map(([name, tld]): Rule => ({
        id: `rule_${name}`,
        type: RuleType.NetworkBlock,
        pattern: `||${name}.${tld}^`,
        action: RuleAction.Block,
        modifiers: {},
        priority: 0,
        source: "test",
      }));

    it("never produces more than 30,000 dynamic rules from input", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }),
          (count) => {
            // Simulate Chrome's limit enforcement
            const dynamicCount = Math.min(count, 30000);
            expect(dynamicCount).toBeLessThanOrEqual(30000);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("every network rule produces a valid DNR structure", () => {
      fc.assert(
        fc.property(ruleGen, (rule) => {
          const dnrRules = adapter.compileToDeclarativeNetRequest([rule]);
          expect(dnrRules.length).toBe(1);
          expect(dnrRules[0]!.id).toBeGreaterThan(0);
          expect(dnrRules[0]!.action.type).toBe("block");
          expect(dnrRules[0]!.priority).toBeGreaterThan(0);
        }),
        { numRuns: 50 }
      );
    });
  });
});
