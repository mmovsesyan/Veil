import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { compileAdBlockPattern, matchAdBlockPattern } from "./pattern-compiler.js";

describe("Pattern Compiler — Property-based tests", () => {
  it("reflexivity: * matches every URL", () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(matchAdBlockPattern("*", url)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("separator ^ never matches inside an alphanumeric token", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 20 }), (token) => {
        const clean = token.replace(/[^a-zA-Z0-9]/g, "");
        if (clean.length < 3) return true;
        const pattern = `||example.com^${clean}^`;
        const url = `https://example.com/${clean}X${clean}`;
        // The second ^ should NOT match because cleanXclean has no separator between tokens
        return !matchAdBlockPattern(pattern, url);
      }),
      { numRuns: 500 },
    );
  });

  it("domain anchor || does not match partial domain names", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 15 }), (sub) => {
        const clean = sub.replace(/[^a-zA-Z0-9-]/g, "");
        if (clean.length < 3) return true;
        const pattern = `||${clean}.com^`;
        const badUrl = `https://not${clean}.com/`;
        return !matchAdBlockPattern(pattern, badUrl);
      }),
      { numRuns: 500 },
    );
  });

  it("wildcards allow arbitrary insertion", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 3, maxLength: 10 }),
        (prefix, middle, suffix) => {
          const p = prefix.replace(/[^a-zA-Z0-9]/g, "");
          const m = middle.replace(/[^a-zA-Z0-9]/g, "");
          const s = suffix.replace(/[^a-zA-Z0-9]/g, "");
          if (p.length < 2 || s.length < 2) return true;
          const pattern = `${p}*${s}`;
          const url = `https://example.com/${p}${m}${s}`;
          return matchAdBlockPattern(pattern, url);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("plain substring patterns are case-insensitive", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 15 }), (raw) => {
        const lower = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lower.length < 3) return true;
        const urlLower = `https://example.com/${lower}`;
        const urlUpper = `https://example.com/${lower.toUpperCase()}`;
        return (
          matchAdBlockPattern(lower, urlLower) ===
          matchAdBlockPattern(lower, urlUpper)
        );
      }),
      { numRuns: 500 },
    );
  });

  it("compiled regex never throws on any pattern string", () => {
    fc.assert(
      fc.property(fc.string(), (pattern) => {
        expect(() => compileAdBlockPattern(pattern)).not.toThrow();
        expect(() => matchAdBlockPattern(pattern, "https://example.com/")).not.toThrow();
      }),
      { numRuns: 1000 },
    );
  });
});
