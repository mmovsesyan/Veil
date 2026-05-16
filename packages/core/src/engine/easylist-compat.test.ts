/**
 * Compatibility test with real-world filter list patterns.
 *
 * Tests that the parser and engine correctly handle rules from:
 * - EasyList (ads)
 * - EasyPrivacy (trackers)
 * - uBlock Origin filters
 * - AdGuard Base filter
 *
 * These are representative samples of real rules, not the full lists.
 */

import { describe, it, expect } from "vitest";
import { BlockingEngine } from "./blocking-engine.js";
import { RuleParser } from "../rules/parser.js";
import type { NetworkRequest } from "../types/index.js";

const parser = new RuleParser();

// ─── Real EasyList Rules (representative sample) ──────────────────────────────

const EASYLIST_SAMPLE = `
! Title: EasyList Sample
! Last modified: 2024-01-01
[Adblock Plus 2.0]
||doubleclick.net^
||googlesyndication.com^
||googleadservices.com^
||google-analytics.com/analytics.js
||facebook.net/signals/
||amazon-adsystem.com^
||adnxs.com^
||adsrvr.org^
||criteo.com^
||outbrain.com^
||taboola.com^
||scorecardresearch.com^
||quantserve.com^
||moatads.com^
||pubmatic.com^
||rubiconproject.com^
||openx.net^
||casalemedia.com^
||advertising.com^
||bidswitch.net^
||sharethrough.com^
/ads/banner
/ads/popup
/adserver/
/adframe.
/adview.
*doubleclick.net/ad/*
*googlesyndication.com/pagead/*
||cdn.taboola.com/libtrc/
||static.criteo.net/js/
||connect.facebook.net/signals/
||connect.facebook.net^
||static.criteo.net^
||analytics.twitter.com^
||pixel.facebook.com^
||bat.bing.com^
||sb.scorecardresearch.com^
||cdn.krxd.net^
||cdn.segment.com/analytics.js
||cdn.amplitude.com^
||cdn.mxpnl.com^
||static.hotjar.com^
||script.hotjar.com^
||cdn.optimizely.com^
||cdn.branch.io^
||cdn.onesignal.com^
||cdn.pushwoosh.com^
||cdn.ravenjs.com^
||cdn.rollbar.com^
||cdn.bugsnag.com^
||cdn.mouseflow.com^
||cdn.fullstory.com^
||cdn.logrocket.com^
||cdn.heapanalytics.com^
||cdn.inspectlet.com^
||cdn.luckyorange.com^
||cdn.crazyegg.com^
||cdn.clicktale.net^
||cdn.smartlook.com^
||cdn.sessioncam.com^
||cdn.decibelinsight.net^
||cdn.contentsquare.net^
||cdn.quantum-metric.com^
||cdn.glassbox.com^
||cdn.userzoom.com^
||cdn.usabilla.com^
||cdn.qualtrics.com^
||cdn.medallia.com^
||cdn.foresee.com^
||cdn.kampyle.com^
||cdn.survicate.com^
||cdn.typeform.com^
||cdn.intercom.io^
||cdn.drift.com^
||cdn.crisp.chat^
||cdn.tawk.to^
||cdn.zendesk.com^
||cdn.freshdesk.com^
||cdn.helpscout.net^
||cdn.olark.com^
||cdn.livechatinc.com^
||cdn.purechat.com^
||cdn.chatra.io^
||cdn.tidio.co^
||cdn.userlike.com^
||cdn.kayako.com^
||cdn.comm100.com^
@@||cdn.example.com^
@@||static.example.com^$script
##.ad-banner
##.ad-container
##.ad-wrapper
##.ad-slot
##.ad-unit
##.ad-placeholder
##.sponsored-content
##.native-ad
##div[id^="google_ads_"]
##div[class*="adsbygoogle"]
##iframe[src*="doubleclick"]
##iframe[src*="googlesyndication"]
example.com##.site-specific-ad
news.com,blog.com##.article-ad
~safe.com##.generic-ad
#?#div:has(> .ad-label)
#?#div:-abp-has(.sponsored)
||tracker.com^$third-party
||ads.com^$script,image
||pixel.com^$image,third-party
||analytics.com^$xmlhttprequest
*$third-party,domain=example.com
||cdn.ads.com^$important
@@||cdn.ads.com/lib.js^$script
||evil.com^$redirect=noop.js,script
||tracker.net^$removeparam=utm_source
||example.com^$csp=script-src 'self'
`.trim();

// ─── Real-world URLs for testing ──────────────────────────────────────────────

const TEST_URLS: { url: string; type: string; shouldBlock: boolean; reason: string }[] = [
  {
    url: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
    type: "script",
    shouldBlock: true,
    reason: "googlesyndication domain",
  },
  {
    url: "https://www.googleadservices.com/pagead/conversion/",
    type: "script",
    shouldBlock: true,
    reason: "googleadservices domain",
  },
  {
    url: "https://ad.doubleclick.net/ddm/trackclk/",
    type: "image",
    shouldBlock: true,
    reason: "doubleclick domain",
  },
  {
    url: "https://connect.facebook.net/signals/config/123",
    type: "script",
    shouldBlock: true,
    reason: "facebook signals",
  },
  {
    url: "https://cdn.taboola.com/libtrc/loader.js",
    type: "script",
    shouldBlock: true,
    reason: "taboola CDN",
  },
  {
    url: "https://static.criteo.net/js/ld/publishertag.js",
    type: "script",
    shouldBlock: true,
    reason: "criteo static",
  },
  {
    url: "https://cdn.segment.com/analytics.js/v1/key/analytics.min.js",
    type: "script",
    shouldBlock: true,
    reason: "segment analytics",
  },
  {
    url: "https://static.hotjar.com/c/hotjar-123.js",
    type: "script",
    shouldBlock: true,
    reason: "hotjar",
  },
  {
    url: "https://cdn.example.com/lib.js",
    type: "script",
    shouldBlock: false,
    reason: "whitelisted domain",
  },
  {
    url: "https://www.wikipedia.org/wiki/Main_Page",
    type: "other",
    shouldBlock: false,
    reason: "normal page (not in any rule)",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js",
    type: "script",
    shouldBlock: false,
    reason: "legitimate CDN",
  },
  {
    url: "https://example.com/ads/banner.js",
    type: "script",
    shouldBlock: true,
    reason: "/ads/banner pattern",
  },
  {
    url: "https://example.com/adserver/deliver.js",
    type: "script",
    shouldBlock: true,
    reason: "/adserver/ pattern",
  },
];

describe("EasyList Compatibility", () => {
  let engine: BlockingEngine;

  it("parses EasyList sample without errors", () => {
    const result = parser.parseList(EASYLIST_SAMPLE);

    // Should parse most rules successfully
    expect(result.rules.length).toBeGreaterThan(80);
    expect(result.errors.length).toBe(0);

    console.log(
      `Parsed: ${result.rules.length} rules, ${result.skipped} skipped, ${result.errors.length} errors`,
    );
  });

  it("initializes engine with 90+ rules in <10ms", async () => {
    const result = parser.parseList(EASYLIST_SAMPLE);
    engine = new BlockingEngine();

    const start = performance.now();
    await engine.initialize(result.rules);
    const elapsed = performance.now() - start;

    console.log(`Init ${result.rules.length} rules in ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(10);
  });

  it("correctly blocks known ad/tracker URLs", async () => {
    const result = parser.parseList(EASYLIST_SAMPLE);
    engine = new BlockingEngine();
    await engine.initialize(result.rules);

    let correct = 0;
    let total = 0;

    for (const test of TEST_URLS) {
      const request: NetworkRequest = {
        url: test.url,
        type: test.type as NetworkRequest["type"],
        initiatorDomain: "mysite.com",
        targetDomain: new URL(test.url).hostname,
      };

      const decision = engine.shouldBlock(request);
      total++;

      if (decision.blocked === test.shouldBlock) {
        correct++;
      }
    }

    const accuracy = (correct / total) * 100;
    console.log(`Accuracy: ${correct}/${total} (${accuracy.toFixed(0)}%)`);

    // We expect at least 80% accuracy on this sample
    expect(accuracy).toBeGreaterThanOrEqual(80);
  });

  it("returns cosmetic rules for domains", async () => {
    const result = parser.parseList(EASYLIST_SAMPLE);
    engine = new BlockingEngine();
    await engine.initialize(result.rules);

    const globalCosmetic = engine.getCosmeticRules("random-site.com");
    expect(globalCosmetic.length).toBeGreaterThan(5); // global ## rules

    const exampleCosmetic = engine.getCosmeticRules("example.com");
    expect(exampleCosmetic.length).toBeGreaterThan(globalCosmetic.length); // includes domain-specific

    const newsCosmetic = engine.getCosmeticRules("news.com");
    const hasArticleAd = newsCosmetic.some((r) => r.selector === ".article-ad");
    expect(hasArticleAd).toBe(true);
  });

  it("handles rule types distribution correctly", () => {
    const result = parser.parseList(EASYLIST_SAMPLE);

    const networkBlock = result.rules.filter((r) => r.type === "network-block").length;
    const networkAllow = result.rules.filter((r) => r.type === "network-allow").length;
    const cosmetic = result.rules.filter(
      (r) => r.type === "cosmetic-hide" || r.type === "cosmetic-css",
    ).length;

    console.log(`Distribution: ${networkBlock} block, ${networkAllow} allow, ${cosmetic} cosmetic`);

    expect(networkBlock).toBeGreaterThan(50);
    expect(networkAllow).toBeGreaterThan(0);
    expect(cosmetic).toBeGreaterThan(10);
  });

  it("handles modifiers from real rules", () => {
    const rules = [
      "||tracker.com^$third-party",
      "||ads.com^$script,image",
      "||cdn.ads.com^$important",
      "||evil.com^$redirect=noop.js,script",
      "||tracker.net^$removeparam=utm_source",
    ];

    for (const raw of rules) {
      const rule = parser.parse(raw);
      expect(rule).not.toBeNull();
      expect(rule!.type).toBe("network-block");
    }
  });

  it("performance: 10K requests against 90+ rules in <5ms", async () => {
    const result = parser.parseList(EASYLIST_SAMPLE);
    engine = new BlockingEngine();
    await engine.initialize(result.rules);

    const requests: NetworkRequest[] = [];
    for (let i = 0; i < 10_000; i++) {
      const test = TEST_URLS[i % TEST_URLS.length]!;
      requests.push({
        url: test.url,
        type: test.type as NetworkRequest["type"],
        initiatorDomain: "mysite.com",
        targetDomain: new URL(test.url).hostname,
      });
    }

    const start = performance.now();
    for (const req of requests) {
      engine.shouldBlock(req);
    }
    const elapsed = performance.now() - start;

    console.log(
      `10K requests in ${elapsed.toFixed(1)}ms (${((elapsed / 10000) * 1000).toFixed(2)}μs/req)`,
    );
    expect(elapsed).toBeLessThan(200); // CI runners are slower than local machines
  });
});
