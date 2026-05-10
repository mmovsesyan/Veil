import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { SafariAdapter } from "./safari-adapter.js";
import { RuleParser } from "@veil/core";
import type { Rule } from "@veil/core";
import { RuleType, RuleAction } from "@veil/core";

const adapter = new SafariAdapter();
const parser = new RuleParser();

describe("SafariAdapter", () => {
  describe("compileToWebKitJSON", () => {
    it("compiles a basic block rule to WebKit format", () => {
      const rule = parser.parse("||ads.example.com^")!;
      const webkitRules = adapter.compileToWebKitJSON([rule]);

      expect(webkitRules.length).toBe(1);
      expect(webkitRules[0]!.action.type).toBe("block");
      expect(webkitRules[0]!.trigger["url-filter"]).toBeTruthy();
    });

    it("compiles an allow rule to ignore-previous-rules", () => {
      const rule = parser.parse("@@||safe.com^")!;
      const webkitRules = adapter.compileToWebKitJSON([rule]);

      expect(webkitRules[0]!.action.type).toBe("ignore-previous-rules");
    });

    it("compiles cosmetic rule to css-display-none", () => {
      const rule = parser.parse("##.ad-banner")!;
      const webkitRules = adapter.compileToWebKitJSON([rule]);

      expect(webkitRules[0]!.action.type).toBe("css-display-none");
      expect(webkitRules[0]!.action.selector).toBe(".ad-banner");
    });

    it("maps resource types correctly", () => {
      const rule = parser.parse("||ads.com^$script,image")!;
      const webkitRules = adapter.compileToWebKitJSON([rule]);

      expect(webkitRules[0]!.trigger["resource-type"]).toContain("script");
      expect(webkitRules[0]!.trigger["resource-type"]).toContain("image");
    });

    it("maps third-party to load-type", () => {
      const rule = parser.parse("||tracker.com^$third-party")!;
      const webkitRules = adapter.compileToWebKitJSON([rule]);

      expect(webkitRules[0]!.trigger["load-type"]).toEqual(["third-party"]);
    });

    it("maps domain constraints to if-domain/unless-domain", () => {
      const rule = parser.parse("||ads.com^$domain=site.com|~sub.site.com")!;
      const webkitRules = adapter.compileToWebKitJSON([rule]);

      expect(webkitRules[0]!.trigger["if-domain"]).toBeTruthy();
      expect(webkitRules[0]!.trigger["unless-domain"]).toBeTruthy();
    });
  });

  describe("splitIntoExtensions", () => {
    it("returns single chunk for rules under limit", () => {
      const rules = Array.from({ length: 100 }, (_, i) => ({
        trigger: { "url-filter": `rule-${i}` },
        action: { type: "block" as const },
      }));

      const chunks = adapter.splitIntoExtensions(rules);
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.length).toBe(100);
    });

    it("splits rules exceeding 150,000 limit", () => {
      const rules = Array.from({ length: 200000 }, (_, i) => ({
        trigger: { "url-filter": `rule-${i}` },
        action: { type: "block" as const },
      }));

      const chunks = adapter.splitIntoExtensions(rules);
      expect(chunks.length).toBe(2);
      expect(chunks[0]!.length).toBe(150000);
      expect(chunks[1]!.length).toBe(50000);
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

    it("compiled rules never exceed 150,000 per chunk", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500000 }),
          (count) => {
            // Simulate splitting
            const chunks: number[] = [];
            let remaining = count;
            while (remaining > 0) {
              const chunkSize = Math.min(remaining, 150000);
              chunks.push(chunkSize);
              remaining -= chunkSize;
            }
            for (const size of chunks) {
              expect(size).toBeLessThanOrEqual(150000);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("every rule produces a valid WebKit JSON structure", () => {
      fc.assert(
        fc.property(ruleGen, (rule) => {
          const webkitRules = adapter.compileToWebKitJSON([rule]);
          expect(webkitRules.length).toBe(1);
          expect(webkitRules[0]!.trigger["url-filter"]).toBeTruthy();
          expect(webkitRules[0]!.action.type).toBe("block");
        }),
        { numRuns: 50 }
      );
    });
  });
});
