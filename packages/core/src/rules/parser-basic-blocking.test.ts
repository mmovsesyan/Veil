import { describe, it, expect } from "vitest";
import { RuleParser } from "./parser.js";
import { RuleType, RuleAction } from "../types/index.js";

const parser = new RuleParser();

describe("RuleParser — basic blocking rules (Task 2.2)", () => {
  it("parses ||domain.com^ — block domain and subdomains", () => {
    const rule = parser.parse("||domain.com^");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("||domain.com^");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("parses ||example.org/path — block specific path", () => {
    const rule = parser.parse("||example.org/path");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("||example.org/path");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("parses /banner/ — block URLs containing /banner/", () => {
    const rule = parser.parse("/banner/");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("/banner/");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("parses |https://example.com — block exact URL start", () => {
    const rule = parser.parse("|https://example.com");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("|https://example.com");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("parses domain.com — simple pattern match", () => {
    const rule = parser.parse("domain.com");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("domain.com");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("parses ||ad*.example.com^ — wildcard in domain pattern", () => {
    const rule = parser.parse("||ad*.example.com^");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("||ad*.example.com^");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("produces Rule objects with correct structure", () => {
    const rule = parser.parse("||ads.tracker.com^");
    expect(rule).not.toBeNull();
    expect(rule!.id).toBeDefined();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("||ads.tracker.com^");
    expect(rule!.action).toBe(RuleAction.Block);
    expect(rule!.modifiers).toBeDefined();
    expect(rule!.priority).toBe(0);
    expect(rule!.source).toBe("custom");
  });

  it("handles single pipe anchor |http://", () => {
    const rule = parser.parse("|http://ads.example.com/");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("|http://ads.example.com/");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("handles wildcard patterns like ad*banner", () => {
    const rule = parser.parse("ad*banner");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("ad*banner");
    expect(rule!.action).toBe(RuleAction.Block);
  });

  it("handles trailing pipe anchor example.com|", () => {
    const rule = parser.parse("example.com/ads|");
    expect(rule).not.toBeNull();
    expect(rule!.type).toBe(RuleType.NetworkBlock);
    expect(rule!.pattern).toBe("example.com/ads|");
    expect(rule!.action).toBe(RuleAction.Block);
  });
});
