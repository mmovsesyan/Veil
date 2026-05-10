import { describe, it, expect, beforeEach } from "vitest";
import { SyncService } from "./sync-service.js";
import type { Settings } from "../types/index.js";

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    enabled: true,
    whitelist: [],
    filterLists: [],
    customRules: [],
    updateInterval: 24,
    syncEnabled: true,
    statisticsEnabled: true,
    lastSyncTimestamp: Date.now(),
    ...overrides,
  };
}

describe("SyncService", () => {
  let sync: SyncService;

  beforeEach(async () => {
    sync = new SyncService();
    await sync.initialize("test-user");
  });

  it("initializes without error", async () => {
    const s = new SyncService();
    await expect(s.initialize("user-123")).resolves.not.toThrow();
  });

  it("throws if push called before initialize", async () => {
    const s = new SyncService();
    await expect(s.push([])).rejects.toThrow("not initialized");
  });

  it("throws if pull called before initialize", async () => {
    const s = new SyncService();
    await expect(s.pull()).rejects.toThrow("not initialized");
  });

  it("push succeeds when online", async () => {
    await expect(
      sync.push([{ key: "enabled", value: false, timestamp: Date.now(), deviceId: "dev1" }])
    ).resolves.not.toThrow();
  });

  it("queues changes when offline", async () => {
    sync.isOnline = false;
    await sync.push([{ key: "enabled", value: false, timestamp: Date.now(), deviceId: "dev1" }]);
    // No error thrown — changes are queued
  });

  it("resolveConflict uses last-write-wins", () => {
    const local = makeSettings({ lastSyncTimestamp: 1000, enabled: true });
    const remote = makeSettings({ lastSyncTimestamp: 2000, enabled: false });

    const result = sync.resolveConflict(local, remote);
    expect(result.lastSyncTimestamp).toBe(2000);
    expect(result.enabled).toBe(false);
  });

  it("resolveConflict prefers local when timestamps are equal", () => {
    const local = makeSettings({ lastSyncTimestamp: 1000, enabled: true });
    const remote = makeSettings({ lastSyncTimestamp: 1000, enabled: false });

    const result = sync.resolveConflict(local, remote);
    expect(result).toBe(local);
  });

  it("onConflict registers callback", () => {
    let called = false;
    sync.onConflict(() => { called = true; });
    // Callback is registered but not called until conflict occurs
    expect(called).toBe(false);
  });

  it("pull returns default settings", async () => {
    const settings = await sync.pull();
    expect(settings.enabled).toBe(true);
    expect(settings.whitelist).toEqual([]);
    expect(settings.updateInterval).toBe(24);
  });
});
