import { describe, it, expect } from "vitest";
import { BroadcastSync } from "./broadcast-sync.js";
import type { CollaborativeRule } from "./collaborative-rules.js";
import type { RuleType } from "../types/index.js";

describe("BroadcastSync", () => {
  it("starts empty", () => {
    const sync = new BroadcastSync({ hmacKey: "test" });
    const stats = sync.getStats();
    expect(stats.pending).toBe(0);
    expect(stats.confirmed).toBe(0);
    sync.destroy();
  });

  it("auto-confirms self-published rule when minConfirmations is 1", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
    });

    const rule: CollaborativeRule = {
      domain: "example.com",
      pattern: "##.ad",
      type: "cosmetic-hide" as unknown as RuleType,
      mlConfidence: 0.9,
      timestamp: Date.now(),
      signature: "",
      confirmations: 1,
    };

    await sync.publish(rule);
    expect(sync.getStats().confirmed).toBe(1);
    expect(sync.getRulesForDomain("example.com")).toHaveLength(1);
    sync.destroy();
  });

  it("keeps rule pending until enough confirmations", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 3,
    });

    const rule: CollaborativeRule = {
      domain: "example.com",
      pattern: "##.ad",
      type: "cosmetic-hide" as unknown as RuleType,
      mlConfidence: 0.9,
      timestamp: Date.now(),
      signature: "",
      confirmations: 1,
    };

    await sync.publish(rule);
    expect(sync.getStats().pending).toBe(1);
    expect(sync.getStats().confirmed).toBe(0);
    sync.destroy();
  });

  it("trims old confirmed rules when max exceeded", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
      maxRules: 3,
    });

    for (let i = 0; i < 5; i++) {
      const rule: CollaborativeRule = {
        domain: `site${i}.com`,
        pattern: "##.ad",
        type: "cosmetic-hide" as unknown as RuleType,
        mlConfidence: 0.9,
        timestamp: Date.now() + i,
        signature: "",
        confirmations: 1,
      };
      await sync.publish(rule);
    }

    expect(sync.getStats().confirmed).toBe(3);
    sync.destroy();
  });

  it("filters rules by domain", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.5,
      minConfirmations: 1,
    });

    await sync.publish({
      domain: "a.com",
      pattern: "##.ad",
      type: "cosmetic-hide" as unknown as RuleType,
      mlConfidence: 0.9,
      timestamp: Date.now(),
      signature: "",
      confirmations: 1,
    });

    await sync.publish({
      domain: "b.com",
      pattern: "##.track",
      type: "cosmetic-hide" as unknown as RuleType,
      mlConfidence: 0.9,
      timestamp: Date.now(),
      signature: "",
      confirmations: 1,
    });

    expect(sync.getRulesForDomain("a.com")).toHaveLength(1);
    expect(sync.getRulesForDomain("b.com")).toHaveLength(1);
    sync.destroy();
  });

  it("rejects low-confidence rules", async () => {
    const sync = new BroadcastSync({
      hmacKey: "test",
      minConfidence: 0.8,
      minConfirmations: 1,
    });

    const rule: CollaborativeRule = {
      domain: "example.com",
      pattern: "##.ad",
      type: "cosmetic-hide" as unknown as RuleType,
      mlConfidence: 0.5,
      timestamp: Date.now(),
      signature: "",
      confirmations: 1,
    };

    await sync.publish(rule);
    expect(sync.getStats().confirmed).toBe(0);
    expect(sync.getStats().pending).toBe(0);
    sync.destroy();
  });
});
