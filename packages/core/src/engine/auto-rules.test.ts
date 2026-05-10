import { describe, it, expect, beforeEach } from "vitest";
import { analyzeRequest, AutoRulesEngine } from "./auto-rules.js";

describe("Auto-Rules", () => {
  describe("analyzeRequest", () => {
    it("detects known ad network domains", () => {
      const result = analyzeRequest(
        "https://ad.doubleclick.net/pagead/ads?client=123",
        "script",
        "example.com",
        "ad.doubleclick.net"
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe("ad");
      expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("detects tracking pixels", () => {
      const result = analyzeRequest(
        "https://tracker.example.com/pixel?uid=abc&event=pageview",
        "image",
        "mysite.com",
        "tracker.example.com"
      );
      // "pixel" in URL + tracking params + third-party + image type
      expect(result).not.toBeNull();
      expect(result!.type).toBe("tracker");
    });

    it("detects ad URL patterns", () => {
      const result = analyzeRequest(
        "https://cdn.example.com/ads/banner-300x250.js",
        "script",
        "mysite.com",
        "cdn.example.com"
      );
      expect(result).not.toBeNull();
      expect(result!.reason).toContain("ad pattern");
    });

    it("detects tracker URL patterns", () => {
      const result = analyzeRequest(
        "https://analytics.example.com/tracking/collect?event=click",
        "xmlhttprequest",
        "mysite.com",
        "analytics.example.com"
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe("tracker");
    });

    it("returns null for safe first-party requests", () => {
      const result = analyzeRequest(
        "https://example.com/api/users",
        "xmlhttprequest",
        "example.com",
        "example.com"
      );
      expect(result).toBeNull();
    });

    it("returns null for low-confidence requests", () => {
      const result = analyzeRequest(
        "https://cdn.example.com/lib/react.min.js",
        "script",
        "example.com",
        "cdn.example.com"
      );
      expect(result).toBeNull();
    });

    it("generates domain-level rule for ad networks", () => {
      const result = analyzeRequest(
        "https://googlesyndication.com/pagead/show_ads.js",
        "script",
        "blog.com",
        "googlesyndication.com"
      );
      expect(result).not.toBeNull();
      expect(result!.suggestedRule).toContain("||googlesyndication.com^");
    });
  });

  describe("AutoRulesEngine", () => {
    let engine: AutoRulesEngine;

    beforeEach(() => {
      engine = new AutoRulesEngine();
    });

    it("does not confirm on first detection", () => {
      const result = engine.processRequest(
        "https://ad.doubleclick.net/ads",
        "script",
        "example.com",
        "ad.doubleclick.net",
        false
      );
      // First detection — not yet confirmed (needs 3)
      expect(result).toBeNull();
      expect(engine.getConfirmedRules().length).toBe(0);
    });

    it("confirms after threshold detections with high confidence", () => {
      // Simulate 5 detections of the same pattern (googlesyndication has higher confidence)
      for (let i = 0; i < 5; i++) {
        engine.processRequest(
          "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
          "script",
          `site${i}.com`,
          "pagead2.googlesyndication.com",
          false
        );
      }

      const confirmed = engine.getConfirmedRules();
      expect(confirmed.length).toBe(1);
      expect(confirmed[0]).toContain("googlesyndication.com");
    });

    it("ignores already blocked requests", () => {
      const result = engine.processRequest(
        "https://ad.doubleclick.net/ads",
        "script",
        "example.com",
        "ad.doubleclick.net",
        true // already blocked
      );
      expect(result).toBeNull();
    });

    it("exports confirmed rules as filter list", () => {
      engine.confirmRule("||ads.example.com^");
      engine.confirmRule("||tracker.net^$third-party");

      const exported = engine.exportAsFilterList();
      expect(exported).toContain("||ads.example.com^");
      expect(exported).toContain("||tracker.net^$third-party");
      expect(exported).toContain("! Title: Auto-detected rules");
    });

    it("rejects false positives", () => {
      // This URL has /ads/ in path which triggers detection
      engine.processRequest(
        "https://cdn.safe.com/ads/lib.js",
        "script",
        "example.com",
        "cdn.safe.com",
        false
      );

      const pending = engine.getPendingDetections();
      if (pending.length > 0) {
        engine.rejectRule(pending[0]!.suggestedRule);
      }
      expect(engine.getPendingDetections().length).toBe(0);
    });

    it("provides statistics", () => {
      engine.processRequest("https://ad.doubleclick.net/x", "script", "a.com", "ad.doubleclick.net", false);
      engine.processRequest("https://ad.doubleclick.net/y", "script", "b.com", "ad.doubleclick.net", false);

      const stats = engine.getStats();
      expect(stats.totalDetections).toBe(2);
      expect(stats.topDomains[0]?.domain).toBe("ad.doubleclick.net");
    });
  });
});
