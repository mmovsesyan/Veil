import type { FilterList, Rule } from "../types/index.js";
import { FilterCategory } from "../types/index.js";
import type { IBlockingEngine } from "../types/interfaces.js";
import { RuleParser } from "./parser.js";

interface FilterListRegistry {
  id: string;
  name: string;
  category: string;
  url: string;
  enabled: boolean;
  description: string;
}

/**
 * Manages filter lists: loading, activation, deactivation, updates.
 * Coordinates between parser and blocking engine.
 */
export class RuleManager {
  private parser = new RuleParser();
  private filterLists: Map<string, FilterList> = new Map();
  private rulesByList: Map<string, Rule[]> = new Map();
  private customRules: Rule[] = [];
  private engine: IBlockingEngine;
  private updateIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private maxRetries = 3;
  private retryDelayMs = 30000;

  constructor(engine: IBlockingEngine) {
    this.engine = engine;
  }

  /**
   * Load filter list registry and activate enabled lists.
   */
  async loadRegistry(registry: FilterListRegistry[]): Promise<void> {
    for (const entry of registry) {
      const filterList: FilterList = {
        id: entry.id,
        name: entry.name,
        category: entry.category as FilterCategory,
        url: entry.url,
        enabled: entry.enabled,
        lastUpdated: 0,
        rulesCount: 0,
        checksum: "",
      };
      this.filterLists.set(entry.id, filterList);
    }
  }

  /**
   * Activate a filter list by ID. Downloads and parses rules.
   */
  async activateList(listId: string, rawContent?: string): Promise<void> {
    const list = this.filterLists.get(listId);
    if (!list) throw new Error(`Filter list not found: ${listId}`);

    let content = rawContent;
    if (!content) {
      content = await this.fetchWithRetry(list.url);
    }

    const result = this.parser.parseList(content);
    const rules = result.rules.map((r) => ({ ...r, source: listId }));

    this.rulesByList.set(listId, rules);
    this.engine.addRules(rules);

    list.enabled = true;
    list.rulesCount = rules.length;
    list.lastUpdated = Date.now();
  }

  /**
   * Deactivate a filter list by ID. Removes its rules from engine.
   */
  deactivateList(listId: string): void {
    const list = this.filterLists.get(listId);
    if (!list) return;

    this.engine.removeRules(listId);
    this.rulesByList.delete(listId);
    list.enabled = false;
  }

  /**
   * Add a custom rule from user input.
   */
  addCustomRule(rawRule: string): { success: boolean; error?: string } {
    const rule = this.parser.parse(rawRule);
    if (!rule) {
      return { success: false, error: "Invalid rule syntax" };
    }

    rule.source = "custom";
    this.customRules.push(rule);
    this.engine.addRules([rule]);
    return { success: true };
  }

  /**
   * Remove a custom rule.
   */
  removeCustomRule(ruleId: string): void {
    this.customRules = this.customRules.filter((r) => r.id !== ruleId);
    this.engine.removeRules("custom");
    if (this.customRules.length > 0) {
      this.engine.addRules(this.customRules);
    }
  }

  /**
   * Import rules from an external URL.
   */
  async importFromUrl(url: string): Promise<{ imported: number; errors: number }> {
    const content = await this.fetchWithRetry(url);
    const result = this.parser.parseList(content);

    const rules = result.rules.map((r) => ({ ...r, source: "custom" }));
    this.customRules.push(...rules);
    this.engine.addRules(rules);

    return { imported: rules.length, errors: result.errors.length };
  }

  /**
   * Check for updates on all active filter lists.
   */
  async checkUpdates(): Promise<string[]> {
    const updated: string[] = [];

    for (const [listId, list] of this.filterLists) {
      if (!list.enabled) continue;

      const timeSinceUpdate = Date.now() - list.lastUpdated;
      if (timeSinceUpdate < this.updateIntervalMs) continue;

      try {
        const content = await this.fetchWithRetry(list.url);
        const result = this.parser.parseList(content);
        const newRules = result.rules.map((r) => ({ ...r, source: listId }));

        // Remove old rules and add new ones
        this.engine.removeRules(listId);
        this.engine.addRules(newRules);
        this.rulesByList.set(listId, newRules);

        list.rulesCount = newRules.length;
        list.lastUpdated = Date.now();
        updated.push(listId);
      } catch {
        // Keep current rules on failure
        console.warn(`Failed to update filter list: ${listId}`);
      }
    }

    return updated;
  }

  /**
   * Start periodic update checks.
   */
  startAutoUpdates(): void {
    if (this.updateTimer) return;
    this.updateTimer = setInterval(() => {
      void this.checkUpdates();
    }, this.updateIntervalMs);
  }

  /**
   * Stop periodic update checks.
   */
  stopAutoUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Get all filter lists with their current state.
   */
  getFilterLists(): FilterList[] {
    return Array.from(this.filterLists.values());
  }

  /**
   * Get custom rules as text.
   */
  getCustomRulesText(): string[] {
    return this.customRules.map((r) => this.parser.format(r));
  }

  private async fetchWithRetry(url: string, attempt = 0): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (text.length > 10 * 1024 * 1024) {
        throw new Error("File exceeds 10MB limit");
      }

      return text;
    } catch (error) {
      if (attempt < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        return this.fetchWithRetry(url, attempt + 1);
      }
      throw error;
    }
  }
}
