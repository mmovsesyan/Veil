import { describe, it, expect } from "vitest";
import { removeParams, removeTrackingParams, parseRemoveParam } from "./removeparam.js";

describe("RemoveParam", () => {
  it("removes a single tracking parameter", () => {
    const result = removeParams(
      "https://example.com/page?utm_source=google&id=123",
      [{ urlPattern: "", param: "utm_source", isRegex: false }]
    );
    expect(result).toBe("https://example.com/page?id=123");
  });

  it("removes multiple parameters", () => {
    const result = removeParams(
      "https://example.com/?utm_source=x&utm_medium=y&page=1",
      [
        { urlPattern: "", param: "utm_source", isRegex: false },
        { urlPattern: "", param: "utm_medium", isRegex: false },
      ]
    );
    expect(result).toBe("https://example.com/?page=1");
  });

  it("removes parameters matching regex", () => {
    const result = removeParams(
      "https://example.com/?utm_source=x&utm_campaign=y&id=1",
      [{ urlPattern: "", param: "^utm_", isRegex: true }]
    );
    expect(result).toBe("https://example.com/?id=1");
  });

  it("returns null if no parameters match", () => {
    const result = removeParams(
      "https://example.com/?page=1&sort=date",
      [{ urlPattern: "", param: "utm_source", isRegex: false }]
    );
    expect(result).toBeNull();
  });

  it("returns null for URL without query string", () => {
    const result = removeParams(
      "https://example.com/page",
      [{ urlPattern: "", param: "utm_source", isRegex: false }]
    );
    expect(result).toBeNull();
  });

  it("removes fbclid from URL", () => {
    const result = removeTrackingParams(
      "https://example.com/article?fbclid=abc123&ref=share"
    );
    expect(result).not.toBeNull();
    expect(result).not.toContain("fbclid");
    // ref is also in the default list
    expect(result).not.toContain("ref=");
  });

  it("removes all utm parameters", () => {
    const result = removeTrackingParams(
      "https://shop.com/product?utm_source=newsletter&utm_medium=email&utm_campaign=sale&price=100"
    );
    expect(result).not.toBeNull();
    expect(result).not.toContain("utm_");
    expect(result).toContain("price=100");
  });

  it("removes gclid (Google Click ID)", () => {
    const result = removeTrackingParams(
      "https://example.com/?gclid=abc&page=home"
    );
    expect(result).toContain("page=home");
    expect(result).not.toContain("gclid");
  });

  it("parseRemoveParam handles plain param", () => {
    const rule = parseRemoveParam("utm_source");
    expect(rule.param).toBe("utm_source");
    expect(rule.isRegex).toBe(false);
  });

  it("parseRemoveParam handles regex param", () => {
    const rule = parseRemoveParam("/^utm_/");
    expect(rule.param).toBe("^utm_");
    expect(rule.isRegex).toBe(true);
  });
});
