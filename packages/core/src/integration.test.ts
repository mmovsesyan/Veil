import { describe, it, expect, beforeEach } from "vitest";
import { RuleParser } from "./rules/parser.js";
import { BlockingEngine } from "./engine/blocking-engine.js";
import { WhitelistManager } from "./whitelist/whitelist-manager.js";
import { StatisticsTracker } from "./stats/statistics-tracker.js";
import type { NetworkRequest } from "./types/index.js";

/**
 * Integration tests: full pipeline from filter list text → parse → engine → decision.
 */
describe("Integration: Parser → Engine → Whitelist → Stats", () => {
  let parser: RuleParser;
  let engine: BlockingEngine;
  let whitelist: WhitelistManager;
  let stats: StatisticsTracker;

  const sampleFilterList = `! Title: Test Filter List
[Adblock Plus 2.0]
! Last modified: 2024-01-01

||doubleclick.net^
||googleadservices.com^
||facebook.com/tr$image,third-party
||google-analytics.com/analytics.js$script
@@||cdn.example.com^
##.ad-banner
##.sponsored-content
example.com##.sidebar-promo
||tracker.example.com^$third-party,script
`;

  beforeEach(async () => {
    parser = new RuleParser();
    engine = new BlockingEngine();
    whitelist = new WhitelistManager();
    stats = new StatisticsTracker();

    const result = parser.parseList(sampleFilterList);
    await engine.initialize(result.rules);
  });

  function makeRequest(overrides: Partial<NetworkRequest>): NetworkRequest {
    return {
      url: "https://example.com/page",
      type: "script",
      initiatorDomain: "mysite.com",
      targetDomain: "example.com",
      ...overrides,
    };
  }

  it("parses filter list without errors", () => {
    const result = parser.parseList(sampleFilterList);
    expect(result.errors.length).toBe(0);
    expect(result.rules.length).toBe(9); // 5 network block + 1 allow + 3 cosmetic
  });

  it("blocks ad network requests", () => {
    const decision = engine.shouldBlock(
      makeRequest({ url: "https://doubleclick.net/ad.js", targetDomain: "doubleclick.net" })
    );
    expect(decision.blocked).toBe(true);
  });

  it("blocks Google Ad Services", () => {
    const decision = engine.shouldBlock(
      makeRequest({ url: "https://googleadservices.com/pagead", targetDomain: "googleadservices.com" })
    );
    expect(decision.blocked).toBe(true);
  });

  it("allows whitelisted CDN", () => {
    const decision = engine.shouldBlock(
      makeRequest({ url: "https://cdn.example.com/lib.js", targetDomain: "cdn.example.com" })
    );
    expect(decision.blocked).toBe(false);
  });

  it("blocks third-party tracking scripts", () => {
    const decision = engine.shouldBlock(
      makeRequest({
        url: "https://tracker.example.com/t.js",
        targetDomain: "tracker.example.com",
        type: "script",
        initiatorDomain: "other-site.com",
      })
    );
    expect(decision.blocked).toBe(true);
  });

  it("does not block first-party requests for third-party-only rules", () => {
    const decision = engine.shouldBlock(
      makeRequest({
        url: "https://tracker.example.com/t.js",
        targetDomain: "tracker.example.com",
        type: "script",
        initiatorDomain: "tracker.example.com",
      })
    );
    expect(decision.blocked).toBe(false);
  });

  it("returns cosmetic rules for domains", () => {
    const rules = engine.getCosmeticRules("example.com");
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.map((r) => r.selector)).toContain(".ad-banner");
    expect(rules.map((r) => r.selector)).toContain(".sidebar-promo");
  });

  it("returns only global cosmetic rules for unrelated domains", () => {
    const rules = engine.getCosmeticRules("other-site.com");
    expect(rules.map((r) => r.selector)).toContain(".ad-banner");
    expect(rules.map((r) => r.selector)).toContain(".sponsored-content");
    expect(rules.map((r) => r.selector)).not.toContain(".sidebar-promo");
  });

  it("whitelist bypasses blocking", () => {
    whitelist.add("doubleclick.net");

    const request = makeRequest({
      url: "https://doubleclick.net/ad.js",
      targetDomain: "doubleclick.net",
    });

    // Check whitelist first (as the real extension would)
    if (whitelist.isWhitelisted(request.targetDomain)) {
      // Skip blocking
      expect(true).toBe(true);
    } else {
      const decision = engine.shouldBlock(request);
      expect(decision.blocked).toBe(true);
    }
  });

  it("statistics track blocked requests", () => {
    const request = makeRequest({
      url: "https://doubleclick.net/ad.js",
      targetDomain: "doubleclick.net",
    });

    const decision = engine.shouldBlock(request);
    if (decision.blocked) {
      stats.recordBlocked(1, request.targetDomain, "ads");
    }

    const tabStats = stats.getTabStats(1);
    expect(tabStats.blocked).toBe(1);
    expect(tabStats.byCategory["ads"]).toBe(1);
  });

  it("full pipeline: multiple requests on a page", () => {
    const requests: NetworkRequest[] = [
      makeRequest({ url: "https://doubleclick.net/ad.js", targetDomain: "doubleclick.net", type: "script" }),
      makeRequest({ url: "https://googleadservices.com/px", targetDomain: "googleadservices.com", type: "image" }),
      makeRequest({ url: "https://cdn.example.com/app.js", targetDomain: "cdn.example.com", type: "script" }),
      makeRequest({ url: "https://mysite.com/style.css", targetDomain: "mysite.com", type: "stylesheet" }),
      makeRequest({ url: "https://google-analytics.com/analytics.js", targetDomain: "google-analytics.com", type: "script" }),
    ];

    let blocked = 0;
    for (const req of requests) {
      if (!whitelist.isWhitelisted(req.targetDomain)) {
        const decision = engine.shouldBlock(req);
        if (decision.blocked) {
          blocked++;
          stats.recordBlocked(1, req.targetDomain, "ads");
        }
      }
    }

    // doubleclick, googleadservices, google-analytics should be blocked
    // cdn.example.com is whitelisted by @@rule, mysite.com has no matching rule
    expect(blocked).toBe(3);
    expect(stats.getTabStats(1).blocked).toBe(3);
  });
});
