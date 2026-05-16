import { describe, it, expect } from "vitest";
import { PrivacyBudgetTracker, generatePrivacyMonitorScript } from "./tracker.js";

describe("PrivacyBudgetTracker", () => {
  it("starts at zero for unknown domains", () => {
    const t = new PrivacyBudgetTracker();
    expect(t.getScore("example.com")).toBeUndefined();
  });

  it("accumulates score from multiple events", () => {
    const t = new PrivacyBudgetTracker();
    t.recordEvent("tracker.com", { api: "canvas", method: "canvas.getImageData", entropyBits: 8.5 });
    t.recordEvent("tracker.com", { api: "canvas", method: "canvas.toDataURL", entropyBits: 8.5 });
    const score = t.getScore("tracker.com")!;
    expect(score.totalScore).toBeGreaterThan(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
    expect(score.apiCounts["canvas"]).toBe(2);
  });

  it("caps score at 100", () => {
    const t = new PrivacyBudgetTracker();
    for (let i = 0; i < 50; i++) {
      t.recordEvent("evil.com", { api: "canvas", method: "canvas.getImageData", entropyBits: 8.5 });
    }
    const score = t.getScore("evil.com")!;
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it("sorts top domains by score", () => {
    const t = new PrivacyBudgetTracker();
    t.recordEvent("a.com", { api: "canvas", method: "canvas.getImageData", entropyBits: 8.5 });
    t.recordEvent("b.com", { api: "canvas", method: "canvas.getImageData", entropyBits: 8.5 });
    t.recordEvent("b.com", { api: "webgl", method: "webgl.getParameter", entropyBits: 6.0 });
    const top = t.getTopDomains(2);
    expect(top[0].domain).toBe("b.com");
    expect(top[1].domain).toBe("a.com");
  });

  it("exports and imports data correctly", () => {
    const t1 = new PrivacyBudgetTracker();
    t1.recordEvent("x.com", { api: "canvas", method: "canvas.getImageData", entropyBits: 8.5 });
    const data = t1.export();

    const t2 = new PrivacyBudgetTracker();
    t2.import(data);
    expect(t2.getScore("x.com")).toBeDefined();
    expect(t2.getScore("x.com")!.events.length).toBe(1);
  });
});

describe("generatePrivacyMonitorScript", () => {
  it("generates syntactically valid JS", () => {
    const code = generatePrivacyMonitorScript();
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("postMessage");
    expect(code).toContain("canvas.getImageData");
    expect(code).toContain("webgl.getParameter");
  });
});
