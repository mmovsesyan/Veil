import { describe, it, expect, beforeEach } from "vitest";
import { StatisticsTracker } from "./statistics-tracker.js";

describe("StatisticsTracker", () => {
  let tracker: StatisticsTracker;

  beforeEach(() => {
    tracker = new StatisticsTracker();
  });

  it("records blocked requests per tab", () => {
    tracker.recordBlocked(1, "ads.com", "ads");
    tracker.recordBlocked(1, "tracker.net", "trackers");
    tracker.recordBlocked(1, "ads.com", "ads");

    const stats = tracker.getTabStats(1);
    expect(stats.blocked).toBe(3);
    expect(stats.byCategory["ads"]).toBe(2);
    expect(stats.byCategory["trackers"]).toBe(1);
  });

  it("tracks separate stats per tab", () => {
    tracker.recordBlocked(1, "ads.com", "ads");
    tracker.recordBlocked(2, "tracker.net", "trackers");

    expect(tracker.getTabStats(1).blocked).toBe(1);
    expect(tracker.getTabStats(2).blocked).toBe(1);
  });

  it("returns zero stats for unknown tab", () => {
    const stats = tracker.getTabStats(999);
    expect(stats.blocked).toBe(0);
    expect(stats.byCategory).toEqual({});
  });

  it("resets tab stats", () => {
    tracker.recordBlocked(1, "ads.com", "ads");
    tracker.recordBlocked(1, "ads.com", "ads");
    tracker.resetTab(1);

    expect(tracker.getTabStats(1).blocked).toBe(0);
  });

  it("records daily stats", () => {
    tracker.recordBlocked(1, "ads.com", "ads");
    tracker.recordBlocked(1, "tracker.net", "trackers");

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDailyStats(today);
    expect(daily.totalBlocked).toBe(2);
    expect(daily.byCategory["ads"]).toBe(1);
    expect(daily.byCategory["trackers"]).toBe(1);
  });

  it("returns zero for unknown date", () => {
    const stats = tracker.getDailyStats("2020-01-01");
    expect(stats.totalBlocked).toBe(0);
  });
});
