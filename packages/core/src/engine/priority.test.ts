/**
 * Tests for $important priority system.
 * 
 * Priority hierarchy (matching uBlock Origin):
 * - @@...$important (200) > ...$important (150) > @@... (100) > ... (0)
 */

import { describe, it, expect } from "vitest";
import { BlockingEngine } from "./blocking-engine.js";
import { RuleParser } from "../rules/parser.js";
import type { NetworkRequest } from "../types/index.js";

const parser = new RuleParser();

function makeRequest(url: string, domain?: string): NetworkRequest {
  const targetDomain = domain || new URL(url).hostname;
  return {
    url,
    type: "script",
    initiatorDomain: "mysite.com",
    targetDomain,
  };
}

describe("BlockingEngine — $important priority", () => {
  it("$important block overrides normal exception", async () => {
    const engine = new BlockingEngine();
    const rules = [
      parser.parse("||ads.com^$important")!,  // priority 150
      parser.parse("@@||ads.com^")!,           // priority 100
    ];
    await engine.initialize(rules);

    const decision = engine.shouldBlock(makeRequest("https://ads.com/banner.js", "ads.com"));
    expect(decision.blocked).toBe(true);
  });

  it("@@$important overrides $important block", async () => {
    const engine = new BlockingEngine();
    const rules = [
      parser.parse("||ads.com^$important")!,       // priority 150
      parser.parse("@@||ads.com^$important")!,     // priority 200
    ];
    await engine.initialize(rules);

    const decision = engine.shouldBlock(makeRequest("https://ads.com/banner.js", "ads.com"));
    expect(decision.blocked).toBe(false);
  });

  it("normal exception overrides normal block", async () => {
    const engine = new BlockingEngine();
    const rules = [
      parser.parse("||cdn.example.com^")!,     // priority 0
      parser.parse("@@||cdn.example.com^")!,   // priority 100
    ];
    await engine.initialize(rules);

    const decision = engine.shouldBlock(makeRequest("https://cdn.example.com/lib.js", "cdn.example.com"));
    expect(decision.blocked).toBe(false);
  });

  it("$important block with modifiers still works", async () => {
    const engine = new BlockingEngine();
    const rules = [
      parser.parse("||tracker.com^$script,important")!,
      parser.parse("@@||tracker.com^")!,
    ];
    await engine.initialize(rules);

    // Script request — should be blocked ($important overrides exception)
    const scriptReq = makeRequest("https://tracker.com/t.js", "tracker.com");
    expect(engine.shouldBlock(scriptReq).blocked).toBe(true);

    // Image request — $important rule only matches scripts, so exception wins
    const imgReq: NetworkRequest = {
      url: "https://tracker.com/pixel.gif",
      type: "image",
      initiatorDomain: "mysite.com",
      targetDomain: "tracker.com",
    };
    expect(engine.shouldBlock(imgReq).blocked).toBe(false);
  });

  it("multiple block rules — highest priority wins", async () => {
    const engine = new BlockingEngine();
    const rules = [
      parser.parse("||ads.com^")!,              // priority 0
      parser.parse("||ads.com^$important")!,    // priority 150
    ];
    await engine.initialize(rules);

    const decision = engine.shouldBlock(makeRequest("https://ads.com/x.js", "ads.com"));
    expect(decision.blocked).toBe(true);
    expect(decision.matchedRule?.priority).toBe(150);
  });
});
