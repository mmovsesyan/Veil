import { describe, it, expect } from "vitest";
import { generateScriptlet, parseScriptletRule, getAvailableScriptlets } from "./scriptlets.js";

describe("Scriptlets", () => {
  it("generates abort-on-property-read scriptlet", () => {
    const code = generateScriptlet("abort-on-property-read", "adblock");
    expect(code).not.toBeNull();
    expect(code).toContain("adblock");
    expect(code).toContain("defineProperty");
  });

  it("generates abort-on-property-write scriptlet", () => {
    const code = generateScriptlet("abort-on-property-write", "ads_loaded");
    expect(code).not.toBeNull();
    expect(code).toContain("ads_loaded");
  });

  it("generates set-constant scriptlet with true", () => {
    const code = generateScriptlet("set-constant", "adsEnabled", "true");
    expect(code).not.toBeNull();
    expect(code).toContain("adsEnabled");
    expect(code).toContain("true");
  });

  it("generates set-constant with noopFunc", () => {
    const code = generateScriptlet("set-constant", "checkAds", "noopFunc");
    expect(code).toContain("function(){}");
  });

  it("generates no-setTimeout-if scriptlet", () => {
    const code = generateScriptlet("no-setTimeout-if", "adblock");
    expect(code).not.toBeNull();
    expect(code).toContain("setTimeout");
    expect(code).toContain("adblock");
  });

  it("generates window.open-defuser", () => {
    const code = generateScriptlet("window.open-defuser");
    expect(code).toContain("window.open");
    expect(code).toContain("null");
  });

  it("returns null for unknown scriptlet", () => {
    const code = generateScriptlet("nonexistent-scriptlet");
    expect(code).toBeNull();
  });

  it("parses scriptlet rule format", () => {
    const result = parseScriptletRule('//scriptlet("abort-on-property-read", "adDetector")');
    expect(result).not.toBeNull();
    expect(result!.name).toBe("abort-on-property-read");
    expect(result!.args).toContain("adDetector");
    expect(result!.code).toContain("adDetector");
  });

  it("parses scriptlet rule with multiple args", () => {
    const result = parseScriptletRule('//scriptlet("set-constant", "ads.loaded", "true")');
    expect(result).not.toBeNull();
    expect(result!.name).toBe("set-constant");
    expect(result!.args).toEqual(["ads.loaded", "true"]);
  });

  it("returns null for invalid scriptlet rule", () => {
    const result = parseScriptletRule("not a scriptlet rule");
    expect(result).toBeNull();
  });

  it("lists available scriptlets", () => {
    const list = getAvailableScriptlets();
    expect(list).toContain("abort-on-property-read");
    expect(list).toContain("set-constant");
    expect(list).toContain("no-setTimeout-if");
    expect(list.length).toBeGreaterThan(5);
  });
});
