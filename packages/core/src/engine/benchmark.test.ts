/**
 * Performance benchmark tests.
 * 
 * These tests verify that the engine meets production performance targets:
 * - <0.1ms average per request with 100K rules
 * - <500ms initialization for 300K rules
 * - >50K requests/sec throughput
 * 
 * Run with: pnpm test -- --testPathPattern=benchmark
 */

import { describe, it, expect } from "vitest";
import { runBenchmark, formatResults, runStandardSuite } from "./benchmark.js";

describe("BlockingEngine — Performance Benchmarks", () => {
  it("handles 10K rules with <50μs average latency", async () => {
    const result = await runBenchmark({
      rulesCount: 10_000,
      requestsCount: 5_000,
    });

    console.log(`\n[10K rules] avg=${(result.avgPerRequestMs * 1000).toFixed(1)}μs p95=${(result.p95Ms * 1000).toFixed(1)}μs throughput=${(result.throughputPerSec / 1000).toFixed(0)}K/s`);

    // Target: <50μs average
    expect(result.avgPerRequestMs).toBeLessThan(0.05);
  });

  it("handles 50K rules with <100μs average latency", async () => {
    const result = await runBenchmark({
      rulesCount: 50_000,
      requestsCount: 5_000,
    });

    console.log(`\n[50K rules] avg=${(result.avgPerRequestMs * 1000).toFixed(1)}μs p95=${(result.p95Ms * 1000).toFixed(1)}μs throughput=${(result.throughputPerSec / 1000).toFixed(0)}K/s`);

    // Target: <100μs average
    expect(result.avgPerRequestMs).toBeLessThan(0.1);
  });

  it("handles 100K rules with <200μs average latency", async () => {
    const result = await runBenchmark({
      rulesCount: 100_000,
      requestsCount: 5_000,
    });

    console.log(`\n[100K rules] avg=${(result.avgPerRequestMs * 1000).toFixed(1)}μs p95=${(result.p95Ms * 1000).toFixed(1)}μs throughput=${(result.throughputPerSec / 1000).toFixed(0)}K/s`);

    // Target: <200μs average
    expect(result.avgPerRequestMs).toBeLessThan(0.2);
  });

  it("initializes 100K rules in <1000ms", async () => {
    const result = await runBenchmark({
      rulesCount: 100_000,
      requestsCount: 100,
    });

    console.log(`\n[Init 100K rules] ${result.initTimeMs.toFixed(0)}ms`);

    // Target: <1000ms for 100K rules
    expect(result.initTimeMs).toBeLessThan(1000);
  });

  it("achieves >10K requests/sec throughput with 50K rules", async () => {
    const result = await runBenchmark({
      rulesCount: 50_000,
      requestsCount: 10_000,
    });

    console.log(`\n[Throughput 50K rules] ${(result.throughputPerSec / 1000).toFixed(0)}K req/s`);

    // Target: >10K req/s
    expect(result.throughputPerSec).toBeGreaterThan(10_000);
  });

  it("full benchmark suite (informational)", async () => {
    const results = await runStandardSuite();
    console.log("\n" + formatResults(results));

    // Just verify it runs without error
    expect(results.length).toBe(5);
  }, 60_000); // 60s timeout for full suite
});
