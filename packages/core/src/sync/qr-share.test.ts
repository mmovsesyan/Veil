import { describe, it, expect } from "vitest";
import { QRRulesExporter } from "./qr-share.js";
import type { CollaborativeRule } from "./collaborative-rules.js";

describe("QRRulesExporter", () => {
  const makeRule = (domain: string, pattern: string): CollaborativeRule => ({
    domain,
    pattern,
    type: "cosmetic-hide" as unknown as RuleType,
    mlConfidence: 0.95,
    timestamp: Date.now(),
    signature: "",
    confirmations: 1,
  });

  it("round-trips rules correctly", () => {
    const rules = [
      makeRule("example.com", "##.ad-banner"),
      makeRule("tracker.net", "||pixel^"),
      makeRule("social.org", "##.share-button"),
    ];

    const exported = QRRulesExporter.export(rules);
    const imported = QRRulesExporter.import(exported.text);

    expect(imported).toHaveLength(3);
    expect(imported[0].domain).toBe("example.com");
    expect(imported[1].domain).toBe("tracker.net");
    expect(imported[2].domain).toBe("social.org");
  });

  it("caps at 150 rules", () => {
    const rules = Array.from({ length: 200 }, (_, i) =>
      makeRule(`site${i}.com`, "##.ad")
    );
    const exported = QRRulesExporter.export(rules);
    const imported = QRRulesExporter.import(exported.text);
    expect(imported.length).toBeLessThanOrEqual(150);
  });

  it("handles empty input", () => {
    const exported = QRRulesExporter.export([]);
    expect(exported.text).toBeTruthy();
    const imported = QRRulesExporter.import(exported.text);
    expect(imported).toHaveLength(0);
  });

  it("handles corrupt input gracefully", () => {
    const imported = QRRulesExporter.import("not-valid-base64!!!");
    expect(imported).toHaveLength(0);
  });

  it("estimates capacity", () => {
    expect(QRRulesExporter.estimateCapacity(2953)).toBeGreaterThan(50);
    expect(QRRulesExporter.estimateCapacity(50)).toBe(0);
  });
});
