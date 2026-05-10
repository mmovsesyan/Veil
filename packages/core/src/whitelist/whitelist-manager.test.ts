import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { WhitelistManager } from "./whitelist-manager.js";

describe("WhitelistManager", () => {
  it("should add and check domains", () => {
    const manager = new WhitelistManager();
    manager.add("example.com");
    expect(manager.isWhitelisted("example.com")).toBe(true);
    expect(manager.isWhitelisted("other.com")).toBe(false);
  });

  it("should support wildcard patterns", () => {
    const manager = new WhitelistManager();
    manager.add("*.example.com");
    expect(manager.isWhitelisted("sub.example.com")).toBe(true);
    expect(manager.isWhitelisted("example.com")).toBe(true);
    expect(manager.isWhitelisted("other.com")).toBe(false);
  });

  it("should remove domains", () => {
    const manager = new WhitelistManager();
    manager.add("example.com");
    manager.remove("example.com");
    expect(manager.isWhitelisted("example.com")).toBe(false);
  });

  it("should be case-insensitive", () => {
    const manager = new WhitelistManager();
    manager.add("Example.COM");
    expect(manager.isWhitelisted("example.com")).toBe(true);
  });

  // Property-based test: idempotency
  it("adding a domain twice should not create duplicates", () => {
    fc.assert(
      fc.property(fc.domain(), (domain) => {
        const manager = new WhitelistManager();
        manager.add(domain);
        manager.add(domain);
        expect(manager.getAll().filter((d) => d === domain.toLowerCase()).length).toBe(1);
      }),
    );
  });

  // Property-based test: add then remove is empty
  it("adding then removing a domain results in not whitelisted", () => {
    fc.assert(
      fc.property(fc.domain(), (domain) => {
        const manager = new WhitelistManager();
        manager.add(domain);
        manager.remove(domain);
        expect(manager.isWhitelisted(domain)).toBe(false);
      }),
    );
  });
});
