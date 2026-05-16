import { describe, it, expect } from "vitest";
import { compileAdBlockPattern, matchAdBlockPattern } from "./pattern-compiler.js";

describe("Pattern Compiler", () => {
  describe("wildcards", () => {
    it("matches any URL with *", () => {
      expect(matchAdBlockPattern("*", "https://example.com/")).toBe(true);
    });

    it("matches wildcard in middle", () => {
      const re = compileAdBlockPattern("banner*ads");
      expect(re.test("https://example.com/banner_ads")).toBe(true);
      expect(re.test("https://example.com/bannerads")).toBe(true);
      expect(re.test("https://example.com/banner_not_ads")).toBe(true);
      expect(re.test("https://example.com/bad")).toBe(false);
    });
  });

  describe("domain anchor ||", () => {
    it("matches exact domain", () => {
      expect(matchAdBlockPattern("||example.com^", "https://example.com/")).toBe(true);
      expect(matchAdBlockPattern("||example.com^", "http://example.com/")).toBe(true);
    });

    it("matches subdomains", () => {
      expect(matchAdBlockPattern("||example.com^", "https://www.example.com/")).toBe(true);
      expect(matchAdBlockPattern("||example.com^", "https://ads.example.com/")).toBe(true);
    });

    it("does not match partial domain name", () => {
      expect(matchAdBlockPattern("||example.com^", "https://badexample.com/")).toBe(false);
      expect(matchAdBlockPattern("||example.com^", "https://example.com.fake/")).toBe(false);
    });

    it("matches domain + path", () => {
      expect(matchAdBlockPattern("||example.com^/ads", "https://example.com/ads")).toBe(true);
      expect(matchAdBlockPattern("||example.com^/ads", "https://www.example.com/ads")).toBe(true);
      expect(matchAdBlockPattern("||example.com^/ads", "https://example.com/other")).toBe(false);
    });
  });

  describe("separator ^", () => {
    it("matches end of domain", () => {
      expect(matchAdBlockPattern("||example.com^", "https://example.com/")).toBe(true);
      expect(matchAdBlockPattern("||example.com^", "https://example.com:8080/")).toBe(true);
    });

    it("does not match inside domain name", () => {
      // ^ should act as a separator, so example.com^ should not match example.com.fake
      expect(matchAdBlockPattern("||example.com^", "https://example.com.fake/")).toBe(false);
    });

    it("matches query-string boundaries", () => {
      expect(matchAdBlockPattern("ads^", "https://example.com/ads?x=1")).toBe(true);
      expect(matchAdBlockPattern("ads^", "https://example.com/ads#frag")).toBe(true);
    });
  });

  describe("start/end anchors |", () => {
    it("matches start of URL", () => {
      expect(matchAdBlockPattern("|https://example.com/", "https://example.com/")).toBe(true);
      expect(matchAdBlockPattern("|https://example.com/", "http://example.com/")).toBe(false);
    });

    it("matches end of URL", () => {
      expect(matchAdBlockPattern(".jpg|", "https://example.com/a.jpg")).toBe(true);
      expect(matchAdBlockPattern(".jpg|", "https://example.com/a.jpeg")).toBe(false);
    });
  });

  describe("literal substring", () => {
    it("matches plain text anywhere", () => {
      expect(matchAdBlockPattern("advert", "https://example.com/advert.js")).toBe(true);
      expect(matchAdBlockPattern("advert", "https://example.com/script.js")).toBe(false);
    });
  });

  describe("regex special chars in pattern", () => {
    it("escapes regex metacharacters", () => {
      expect(matchAdBlockPattern(".+", "https://example.com/.+")).toBe(true);
      expect(matchAdBlockPattern(".+", "https://example.com/abc")).toBe(false);
    });
  });
});
