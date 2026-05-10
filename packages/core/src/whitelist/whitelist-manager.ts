import type { IWhitelistManager } from "../types/interfaces.js";

/**
 * Manages the whitelist of domains that should bypass blocking.
 * Supports exact domain matching and wildcard patterns (*.example.com).
 */
export class WhitelistManager implements IWhitelistManager {
  private entries = new Set<string>();

  add(pattern: string): void {
    const normalized = this.normalize(pattern);
    if (!normalized) return;
    this.entries.add(normalized);
  }

  remove(pattern: string): void {
    const normalized = this.normalize(pattern);
    if (!normalized) return;
    this.entries.delete(normalized);
  }

  isWhitelisted(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase().trim();

    // Direct match
    if (this.entries.has(normalizedDomain)) {
      return true;
    }

    // Wildcard matching
    for (const entry of this.entries) {
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(2);
        if (normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`)) {
          return true;
        }
      }
    }

    return false;
  }

  getAll(): string[] {
    return Array.from(this.entries).sort();
  }

  clear(): void {
    this.entries.clear();
  }

  private normalize(pattern: string): string | null {
    const trimmed = pattern.toLowerCase().trim();
    if (!trimmed) return null;
    return trimmed;
  }
}
