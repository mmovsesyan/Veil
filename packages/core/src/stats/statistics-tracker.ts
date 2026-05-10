import type { IStatisticsTracker } from "../types/interfaces.js";

interface TabStatsData {
  blocked: number;
  byCategory: Record<string, number>;
}

interface DailyStatsData {
  totalBlocked: number;
  byCategory: Record<string, number>;
  byDomain: Record<string, number>;
}

/**
 * Tracks blocking statistics per tab and per day.
 * Stores up to 90 days of daily statistics.
 */
export class StatisticsTracker implements IStatisticsTracker {
  private tabStats: Map<number, TabStatsData> = new Map();
  private dailyStats: Map<string, DailyStatsData> = new Map();
  private readonly maxDays = 90;

  recordBlocked(tabId: number, domain: string, category: string): void {
    // Update tab stats
    const tab = this.tabStats.get(tabId) ?? { blocked: 0, byCategory: {} };
    tab.blocked++;
    tab.byCategory[category] = (tab.byCategory[category] ?? 0) + 1;
    this.tabStats.set(tabId, tab);

    // Update daily stats
    const today = this.getDateString();
    const daily = this.dailyStats.get(today) ?? {
      totalBlocked: 0,
      byCategory: {},
      byDomain: {},
    };
    daily.totalBlocked++;
    daily.byCategory[category] = (daily.byCategory[category] ?? 0) + 1;
    daily.byDomain[domain] = (daily.byDomain[domain] ?? 0) + 1;
    this.dailyStats.set(today, daily);

    this.pruneOldStats();
  }

  getTabStats(tabId: number): { blocked: number; byCategory: Record<string, number> } {
    return this.tabStats.get(tabId) ?? { blocked: 0, byCategory: {} };
  }

  getDailyStats(date: string): { totalBlocked: number; byCategory: Record<string, number> } {
    const stats = this.dailyStats.get(date);
    if (!stats) {
      return { totalBlocked: 0, byCategory: {} };
    }
    return { totalBlocked: stats.totalBlocked, byCategory: stats.byCategory };
  }

  resetTab(tabId: number): void {
    this.tabStats.delete(tabId);
  }

  private getDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private pruneOldStats(): void {
    if (this.dailyStats.size <= this.maxDays) return;

    const sortedDates = Array.from(this.dailyStats.keys()).sort();
    while (sortedDates.length > this.maxDays) {
      const oldest = sortedDates.shift();
      if (oldest) this.dailyStats.delete(oldest);
    }
  }
}
