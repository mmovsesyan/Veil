/**
 * Production benchmark suite for the blocking engine.
 * 
 * Tests performance against realistic workloads:
 * - EasyList-scale rule sets (70,000+ rules)
 * - Real-world URL patterns from top sites
 * - Memory consumption tracking
 * - Latency percentiles (p50, p95, p99)
 * 
 * Target metrics (matching uBlock Origin / Brave):
 * - Matching latency: <0.1ms per URL (p95)
 * - Initialization: <500ms for 300K rules
 * - Memory: <50MB for 300K rules
 * - Throughput: >50,000 URLs/sec
 */

import { BlockingEngine } from "./blocking-engine.js";
import { RuleParser } from "../rules/parser.js";
import type { NetworkRequest, ResourceType } from "../types/index.js";

// ─── Realistic URL Generators ─────────────────────────────────────────────────

const TOP_DOMAINS = [
  "google.com", "youtube.com", "facebook.com", "amazon.com", "twitter.com",
  "instagram.com", "linkedin.com", "reddit.com", "netflix.com", "microsoft.com",
  "apple.com", "github.com", "stackoverflow.com", "wikipedia.org", "yahoo.com",
  "bing.com", "twitch.tv", "discord.com", "spotify.com", "pinterest.com",
];

const AD_DOMAINS = [
  "doubleclick.net", "googlesyndication.com", "googleadservices.com",
  "facebook.net", "fbcdn.net", "analytics.google.com", "adnxs.com",
  "adsrvr.org", "criteo.com", "outbrain.com", "taboola.com",
  "scorecardresearch.com", "quantserve.com", "moatads.com",
  "amazon-adsystem.com", "pubmatic.com", "rubiconproject.com",
];

const RESOURCE_TYPES: ResourceType[] = [
  "script", "image", "stylesheet", "xmlhttprequest", "media", "font", "iframe",
];

const PATHS = [
  "/ads/banner.js", "/pixel.gif", "/track?id=123", "/analytics.js",
  "/page/content.html", "/api/data.json", "/static/style.css",
  "/images/photo.jpg", "/video/stream.mp4", "/font/roboto.woff2",
  "/widget/social.js", "/sdk/v3/loader.js", "/beacon?t=pageview",
];

/**
 * Generate realistic network requests for benchmarking.
 */
export function generateRequests(count: number): NetworkRequest[] {
  const requests: NetworkRequest[] = [];
  const allDomains = [...TOP_DOMAINS, ...AD_DOMAINS];

  for (let i = 0; i < count; i++) {
    const targetDomain = allDomains[i % allDomains.length]!;
    const initiatorDomain = TOP_DOMAINS[i % TOP_DOMAINS.length]!;
    const path = PATHS[i % PATHS.length]!;
    const type = RESOURCE_TYPES[i % RESOURCE_TYPES.length]!;

    requests.push({
      url: `https://${targetDomain}${path}`,
      type,
      initiatorDomain,
      targetDomain,
    });
  }

  return requests;
}

/**
 * Generate synthetic rules that mimic EasyList patterns.
 */
export function generateRules(count: number): string[] {
  const rules: string[] = [];
  const modifiers = ["", "$third-party", "$script", "$image", "$script,third-party"];

  for (let i = 0; i < count; i++) {
    const type = i % 5;
    switch (type) {
      case 0: // Hostname-only (most common, ~40% of EasyList)
        rules.push(`||ad${i}.example.com^`);
        break;
      case 1: // Domain with path
        rules.push(`||tracker${i}.net/pixel${modifiers[i % modifiers.length]}`);
        break;
      case 2: // Keyword pattern
        rules.push(`/ads/banner${i}${modifiers[i % modifiers.length]}`);
        break;
      case 3: // Cosmetic rule (~30% of EasyList)
        rules.push(`##.ad-slot-${i}`);
        break;
      case 4: // Exception rule (~5%)
        rules.push(`@@||cdn${i}.example.com^`);
        break;
    }
  }

  return rules;
}

// ─── Benchmark Runner ─────────────────────────────────────────────────────────

export interface BenchmarkResult {
  name: string;
  rulesCount: number;
  requestsCount: number;
  initTimeMs: number;
  totalMatchTimeMs: number;
  avgPerRequestMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputPerSec: number;
  matchRate: number;
  memoryMB: number;
}

/**
 * Run a full benchmark suite.
 */
export async function runBenchmark(options: {
  rulesCount: number;
  requestsCount: number;
  warmupRuns?: number;
}): Promise<BenchmarkResult> {
  const { rulesCount, requestsCount, warmupRuns = 100 } = options;

  const parser = new RuleParser();
  const engine = new BlockingEngine();

  // Generate rules
  const rawRules = generateRules(rulesCount);
  const rules = rawRules
    .map((r) => parser.parse(r))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Measure initialization
  const memBefore = getMemoryUsage();
  const initStart = performance.now();
  await engine.initialize(rules);
  const initTimeMs = performance.now() - initStart;
  const memAfter = getMemoryUsage();

  // Generate requests
  const requests = generateRequests(requestsCount);

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    engine.shouldBlock(requests[i % requests.length]!);
  }

  // Measure matching
  const latencies: number[] = [];
  let matches = 0;

  for (const request of requests) {
    const start = performance.now();
    const result = engine.shouldBlock(request);
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
    if (result.blocked) matches++;
  }

  // Calculate percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
  const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
  const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
  const totalMs = latencies.reduce((sum, l) => sum + l, 0);

  return {
    name: `${rulesCount} rules × ${requestsCount} requests`,
    rulesCount: rules.length,
    requestsCount,
    initTimeMs,
    totalMatchTimeMs: totalMs,
    avgPerRequestMs: totalMs / requestsCount,
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    throughputPerSec: (requestsCount / totalMs) * 1000,
    matchRate: matches / requestsCount,
    memoryMB: (memAfter - memBefore) / (1024 * 1024),
  };
}

/**
 * Run the standard benchmark suite with multiple configurations.
 */
export async function runStandardSuite(): Promise<BenchmarkResult[]> {
  const configs = [
    { rulesCount: 1_000, requestsCount: 10_000 },
    { rulesCount: 10_000, requestsCount: 10_000 },
    { rulesCount: 50_000, requestsCount: 10_000 },
    { rulesCount: 100_000, requestsCount: 10_000 },
    { rulesCount: 300_000, requestsCount: 10_000 },
  ];

  const results: BenchmarkResult[] = [];
  for (const config of configs) {
    const result = await runBenchmark(config);
    results.push(result);
  }

  return results;
}

/**
 * Format benchmark results as a table.
 */
export function formatResults(results: BenchmarkResult[]): string {
  const header = [
    "Rules", "Init(ms)", "Avg(μs)", "P95(μs)", "P99(μs)",
    "Throughput", "Match%", "Memory(MB)",
  ].join(" | ");

  const separator = header.replace(/[^|]/g, "-");

  const rows = results.map((r) => [
    r.rulesCount.toLocaleString().padStart(7),
    r.initTimeMs.toFixed(1).padStart(8),
    (r.avgPerRequestMs * 1000).toFixed(1).padStart(7),
    (r.p95Ms * 1000).toFixed(1).padStart(7),
    (r.p99Ms * 1000).toFixed(1).padStart(7),
    `${(r.throughputPerSec / 1000).toFixed(0)}K/s`.padStart(10),
    `${(r.matchRate * 100).toFixed(1)}%`.padStart(6),
    r.memoryMB.toFixed(1).padStart(10),
  ].join(" | "));

  return [header, separator, ...rows].join("\n");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getMemoryUsage(): number {
  if (typeof process !== "undefined" && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  // Browser fallback
  if (typeof performance !== "undefined" && "memory" in performance) {
    return (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
  }
  return 0;
}
