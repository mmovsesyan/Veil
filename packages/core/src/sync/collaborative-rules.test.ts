import { describe, it, expect } from "vitest";
import { CollaborativeRulesEngine } from "./collaborative-rules.js";
import { BroadcastSync } from "./broadcast-sync.js";
import { QRRulesExporter } from "./qr-share.js";
import type { CollaborativeRule } from "./collaborative-rules.js";

describe("CollaborativeRulesEngine (serverless)", () => {
  const makeRule = (domain: string, pattern: string): CollaborativeRule => ({
    domain,
    pattern,
    type: "cosmetic-hide" as unknown as RuleType,
    mlConfidence: 0.9,
    timestamp: Date.now(),
    signature: "abc",
    confirmations: 1,
  });

  it("starts empty", () => {
    const engine = new CollaborativeRulesEngine({ hmacKey: "test" });
    expect(engine.getStats().confirmed).toBe(0);
    expect(engine.getStats().pending).toBe(0);
    engine.destroy();
  });

  it("imports external rules directly", () => {
    const engine = new CollaborativeRulesEngine({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
    });

    engine.importRules([makeRule("a.com", "##.ad")]);
    expect(engine.getStats().confirmed).toBe(1);
    expect(engine.getRulesForDomain("a.com")).toHaveLength(1);
    engine.destroy();
  });

  it("trims old rules when max exceeded", () => {
    const engine = new CollaborativeRulesEngine({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
      maxRules: 3,
    });

    for (let i = 0; i < 5; i++) {
      engine.importRules([makeRule(`site${i}.com`, "##.ad")]);
    }

    expect(engine.getStats().confirmed).toBe(3);
    engine.destroy();
  });

  it("round-trips through QR exporter", () => {
    const engine = new CollaborativeRulesEngine({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
    });

    const rules = [
      makeRule("example.com", "##.ad-banner"),
      makeRule("tracker.net", "||pixel^"),
    ];

    engine.importRules(rules);

    const exported = QRRulesExporter.export(engine.getRulesForDomain("example.com"));
    const imported = QRRulesExporter.import(exported.text);

    expect(imported.length).toBeGreaterThan(0);
    expect(imported[0].domain).toBe("example.com");
    engine.destroy();
  });

  it("rejects low-confidence rules on import", () => {
    const engine = new CollaborativeRulesEngine({
      hmacKey: "test",
      minConfidence: 0.8,
      minConfirmations: 1,
    });

    const lowConf = makeRule("x.com", "##.ad");
    lowConf.mlConfidence = 0.5;

    engine.importRules([lowConf]);
    expect(engine.getStats().confirmed).toBe(0);
    engine.destroy();
  });
});

describe("BroadcastSync", () => {
  const makeRule = (domain: string, pattern: string): CollaborativeRule => ({
    domain,
    pattern,
    type: "cosmetic-hide" as unknown as RuleType,
    mlConfidence: 0.9,
    timestamp: Date.now(),
    signature: "",
    confirmations: 1,
  });

  it("self-publishing auto-confirms with minConfirmations=1", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
      useStorageFallback: false,
    });

    await sync.publish(makeRule("example.com", "##.ad"));
    expect(sync.getStats().confirmed).toBe(1);
    sync.destroy();
  });

  it("keeps rule pending until enough confirmations", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 3,
      useStorageFallback: false,
    });

    await sync.publish(makeRule("example.com", "##.ad"));
    expect(sync.getStats().pending).toBe(1);
    expect(sync.getStats().confirmed).toBe(0);
    sync.destroy();
  });
});
