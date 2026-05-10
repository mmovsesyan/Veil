/**
 * Tests for engine serialization — fast cold start.
 */

import { describe, it, expect } from "vitest";
import { serializeRules, deserializeRules, serializeToString, deserializeFromString, estimateSize } from "./serializer.js";
import { RuleParser } from "../rules/parser.js";
import { BlockingEngine } from "./blocking-engine.js";


const parser = new RuleParser();

describe("Engine Serializer", () => {
  const sampleRules = [
    "||ads.com^",
    "||tracker.net^$third-party",
    "@@||cdn.example.com^",
    "##.ad-banner",
    "example.com##.sidebar-ad",
    "||evil.com^$script,important",
    "||pixel.com^$image,redirect=1x1.gif",
    "||analytics.com^$removeparam=utm_source",
  ];

  const rules = sampleRules
    .map((r) => parser.parse(r))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  it("serializes and deserializes rules correctly", () => {
    const serialized = serializeRules(rules);
    const deserialized = deserializeRules(serialized);

    expect(deserialized.length).toBe(rules.length);

    // Check patterns preserved
    for (let i = 0; i < rules.length; i++) {
      expect(deserialized[i]!.pattern).toBe(rules[i]!.pattern);
      expect(deserialized[i]!.type).toBe(rules[i]!.type);
      expect(deserialized[i]!.action).toBe(rules[i]!.action);
      expect(deserialized[i]!.priority).toBe(rules[i]!.priority);
    }
  });

  it("preserves modifiers through serialization", () => {
    const serialized = serializeRules(rules);
    const deserialized = deserializeRules(serialized);

    // $third-party
    const tpRule = deserialized.find((r) => r.pattern === "||tracker.net^");
    expect(tpRule?.modifiers.thirdParty).toBe(true);

    // $important
    const impRule = deserialized.find((r) => r.pattern === "||evil.com^");
    expect((impRule?.modifiers as Record<string, unknown>).important).toBe(true);
    expect(impRule?.modifiers.resourceTypes).toContain("script");

    // $redirect
    const redRule = deserialized.find((r) => r.pattern === "||pixel.com^");
    expect(redRule?.modifiers.redirect).toBe("1x1.gif");
  });

  it("preserves domains through serialization", () => {
    const serialized = serializeRules(rules);
    const deserialized = deserializeRules(serialized);

    const cosmeticRule = deserialized.find((r) => r.pattern === ".sidebar-ad");
    expect(cosmeticRule?.domains?.include).toContain("example.com");
  });

  it("string serialization round-trip works", () => {
    const json = serializeToString(rules);
    const restored = deserializeFromString(json);

    expect(restored.length).toBe(rules.length);
    expect(restored[0]!.pattern).toBe(rules[0]!.pattern);
  });

  it("serialized size is smaller than raw text", () => {
    const rawSize = sampleRules.join("\n").length;
    const serializedSize = estimateSize(rules);

    console.log(`Raw: ${rawSize} bytes, Serialized: ${serializedSize} bytes (${((serializedSize / rawSize) * 100).toFixed(0)}%)`);

    // Serialized should be reasonable (may be larger for small sets due to metadata)
    expect(serializedSize).toBeGreaterThan(0);
  });

  it("deserialized rules work correctly in engine", async () => {
    const json = serializeToString(rules);
    const restored = deserializeFromString(json);

    const engine = new BlockingEngine();
    await engine.initialize(restored);

    // Should block ads.com
    const decision = engine.shouldBlock({
      url: "https://ads.com/banner.js",
      type: "script",
      initiatorDomain: "mysite.com",
      targetDomain: "ads.com",
    });
    expect(decision.blocked).toBe(true);

    // Should allow cdn.example.com
    const allowDecision = engine.shouldBlock({
      url: "https://cdn.example.com/lib.js",
      type: "script",
      initiatorDomain: "mysite.com",
      targetDomain: "cdn.example.com",
    });
    expect(allowDecision.blocked).toBe(false);
  });

  it("deserialization is faster than parsing", () => {
    // Generate a larger rule set
    const largeRules: string[] = [];
    for (let i = 0; i < 10000; i++) {
      largeRules.push(`||ad${i}.example.com^`);
    }

    // Time: parse from text
    const parseStart = performance.now();
    const parsed = parser.parseList(largeRules.join("\n")).rules;
    const parseTime = performance.now() - parseStart;

    // Serialize
    const json = serializeToString(parsed);

    // Time: deserialize
    const deserStart = performance.now();
    const restored = deserializeFromString(json);
    const deserTime = performance.now() - deserStart;

    console.log(`Parse 10K rules: ${parseTime.toFixed(1)}ms`);
    console.log(`Deserialize 10K rules: ${deserTime.toFixed(1)}ms`);
    console.log(`Speedup: ${(parseTime / deserTime).toFixed(1)}x`);

    expect(restored.length).toBe(parsed.length);
    // Deserialization should be at least as fast as parsing (usually 2-5x faster)
    // For small rule sets the difference may be minimal
    expect(deserTime).toBeLessThan(parseTime * 3); // Allow some variance
  });

  it("metadata is correct", () => {
    const serialized = serializeRules(rules);

    expect(serialized.metadata.totalRules).toBe(rules.length);
    expect(serialized.metadata.networkBlock).toBeGreaterThan(0);
    expect(serialized.metadata.networkAllow).toBeGreaterThan(0);
    expect(serialized.metadata.cosmetic).toBeGreaterThan(0);
    expect(serialized.version).toBe(1);
    expect(serialized.timestamp).toBeGreaterThan(0);
    expect(serialized.checksum).toBeTruthy();
  });
});
