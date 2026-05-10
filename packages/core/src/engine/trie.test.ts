import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PatternTrie } from "./trie.js";

describe("PatternTrie (Aho-Corasick)", () => {
  it("finds a single pattern in text", () => {
    const trie = new PatternTrie();
    trie.insert("ads.com", 1);
    trie.build();

    const matches = trie.search("https://ads.com/banner.js");
    expect(matches).toContain(1);
  });

  it("finds multiple patterns in text", () => {
    const trie = new PatternTrie();
    trie.insert("ads.com", 1);
    trie.insert("tracker.net", 2);
    trie.insert("banner", 3);
    trie.build();

    const matches = trie.search("https://ads.com/banner.js");
    expect(matches).toContain(1);
    expect(matches).toContain(3);
    expect(matches).not.toContain(2);
  });

  it("returns empty for no matches", () => {
    const trie = new PatternTrie();
    trie.insert("ads.com", 1);
    trie.build();

    const matches = trie.search("https://safe-site.org/page");
    expect(matches).toEqual([]);
  });

  it("handles overlapping patterns", () => {
    const trie = new PatternTrie();
    trie.insert("abc", 1);
    trie.insert("bcd", 2);
    trie.build();

    const matches = trie.search("xabcdy");
    expect(matches).toContain(1);
    expect(matches).toContain(2);
  });

  it("handles many patterns efficiently", () => {
    const trie = new PatternTrie();
    for (let i = 0; i < 10000; i++) {
      trie.insert(`pattern${i}.com`, i);
    }
    trie.build();

    const start = performance.now();
    const matches = trie.search("https://pattern5000.com/page?q=test");
    const elapsed = performance.now() - start;

    expect(matches).toContain(5000);
    expect(elapsed).toBeLessThan(10); // Should be <1ms but allow 10ms for CI
  });

  it("property: inserted patterns are always found", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz.".split("")), { minLength: 3, maxLength: 15 }),
          { minLength: 1, maxLength: 50 }
        ),
        (patterns) => {
          const trie = new PatternTrie();
          patterns.forEach((p, i) => trie.insert(p, i));
          trie.build();

          // Each pattern should be found in a text containing it
          for (let i = 0; i < patterns.length; i++) {
            const text = `prefix${patterns[i]}suffix`;
            const matches = trie.search(text);
            expect(matches).toContain(i);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
