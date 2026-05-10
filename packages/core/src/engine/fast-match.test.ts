import { describe, it, expect } from "vitest";
import { compilePattern, matchCompiled, batchMatch, benchmarkMatch } from "./fast-match.js";

describe("FastMatch", () => {
  describe("compilePattern", () => {
    it("compiles domain pattern", () => {
      const p = compilePattern("||ads.example.com^");
      expect(p.type).toBe("domain");
      expect(p.value).toBe("ads.example.com");
    });

    it("compiles prefix pattern", () => {
      const p = compilePattern("|https://ads.com");
      expect(p.type).toBe("prefix");
    });

    it("compiles wildcard pattern", () => {
      const p = compilePattern("*tracking*pixel*");
      expect(p.type).toBe("wildcard");
    });

    it("compiles contains pattern with BMH table", () => {
      const p = compilePattern("doubleclick");
      expect(p.type).toBe("contains");
      expect(p.badCharTable).toBeDefined();
    });
  });

  describe("matchCompiled", () => {
    it("matches domain pattern", () => {
      const p = compilePattern("||ads.example.com^");
      expect(matchCompiled(p, "https://ads.example.com/banner.js")).toBe(true);
      expect(matchCompiled(p, "https://sub.ads.example.com/x")).toBe(true);
      expect(matchCompiled(p, "https://safe.com/page")).toBe(false);
    });

    it("matches contains pattern", () => {
      const p = compilePattern("doubleclick");
      expect(matchCompiled(p, "https://ad.doubleclick.net/pagead")).toBe(true);
      expect(matchCompiled(p, "https://example.com/page")).toBe(false);
    });

    it("matches wildcard pattern", () => {
      const p = compilePattern("*ads*banner*");
      expect(matchCompiled(p, "https://example.com/ads/banner.js")).toBe(true);
      expect(matchCompiled(p, "https://example.com/page")).toBe(false);
    });

    it("matches prefix pattern", () => {
      const p = compilePattern("|https://ads.com");
      expect(matchCompiled(p, "https://ads.com/x")).toBe(true);
      expect(matchCompiled(p, "https://other.com/ads.com")).toBe(false);
    });
  });

  describe("batchMatch", () => {
    it("returns first matching pattern index", () => {
      const patterns = [
        compilePattern("||ads.com^"),
        compilePattern("||tracker.net^"),
        compilePattern("||analytics.io^"),
      ];
      expect(batchMatch(patterns, "https://tracker.net/pixel")).toBe(1);
    });

    it("returns -1 for no match", () => {
      const patterns = [
        compilePattern("||ads.com^"),
        compilePattern("||tracker.net^"),
      ];
      expect(batchMatch(patterns, "https://safe.org/page")).toBe(-1);
    });
  });

  describe("performance", () => {
    it("matches 10K patterns against 100 URLs in <50ms", () => {
      // Generate patterns
      const patterns = Array.from({ length: 10000 }, (_, i) =>
        compilePattern(`||domain${i}.com^`)
      );

      // Generate URLs (some matching, some not)
      const urls = Array.from({ length: 100 }, (_, i) =>
        i % 10 === 0
          ? `https://domain${i * 100}.com/page`
          : `https://safe-site-${i}.org/page`
      );

      const result = benchmarkMatch(patterns, urls);
      expect(result.totalMs).toBeLessThan(200);
      expect(result.matchRate).toBeGreaterThan(0);
    });

    it("Boyer-Moore is faster than includes for long patterns", () => {
      const pattern = compilePattern("googleadservices");
      const url = "https://www.googleadservices.com/pagead/conversion/123456/?random=abc&label=xyz";

      // Warm up
      for (let i = 0; i < 100; i++) matchCompiled(pattern, url);

      const start = performance.now();
      for (let i = 0; i < 100000; i++) {
        matchCompiled(pattern, url);
      }
      const elapsed = performance.now() - start;

      // 100K matches should take <100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});
