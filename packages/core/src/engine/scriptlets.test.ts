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

  it("escapes malicious argument values to prevent injection", () => {
    const malicious = 'foo"); alert("XSS'; // double-quote + paren injection
    const code = generateScriptlet("abort-on-property-read", malicious);
    expect(code).not.toBeNull();
    // The generated code must remain syntactically valid and not execute alert
    expect(() => new Function(code!)).not.toThrow();
    // The payload must be trapped inside the string literal, not raw JS
    expect(code).toContain('"foo\\"); alert(\\"XSS"');
  });

  it("escapes backticks and template interpolation", () => {
    const malicious = "`${process.env}`";
    const code = generateScriptlet("no-setTimeout-if", malicious);
    expect(code).not.toBeNull();
    // Must remain syntactically valid — back-tick must not break out of string literal
    expect(() => new Function(code!)).not.toThrow();
    // The back-tick should appear inside the double-quoted string, not as raw JS
    expect(code).toMatch(/needle = "[^"]*`[^"]*"/);
  });

  it("escapes newlines and carriage returns", () => {
    const malicious = "line1\nline2\rline3";
    const code = generateScriptlet("prevent-fetch", malicious);
    expect(code).not.toBeNull();
    // Newlines must be serialized as \\n inside the string literal
    expect(code).toContain('"line1\\nline2\\rline3"');
    expect(() => new Function(code!)).not.toThrow();
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
