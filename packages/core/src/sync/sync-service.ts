import type { ISyncService } from "../types/interfaces.js";
import type { ConflictCallback, Settings, SettingsChange } from "../types/index.js";

declare const chrome: any;
declare const browser: any;

/**
 * Returns the appropriate storage API (browser.storage or chrome.storage).
 */
function getStorageApi(): any {
  if (typeof browser !== "undefined" && browser?.storage?.sync) {
    return browser.storage;
  }
  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    return chrome.storage;
  }
  return null;
}

/**
 * Sync service for synchronizing settings across devices.
 * Uses browser.storage.sync / chrome.storage.sync as the sync backend.
 * Employs last-write-wins conflict resolution strategy.
 */
export class SyncService implements ISyncService {
  private _userId: string | null = null;
  private conflictCallbacks: ConflictCallback[] = [];
  private pendingChanges: SettingsChange[] = [];
  private _isOnline = true;

  async initialize(userId: string): Promise<void> {
    this._userId = userId;

    try {
      const storage = getStorageApi();
      if (!storage) {
        return;
      }

      // Listen for storage.onChanged events to detect remote changes
      const onChangedListener = (
        changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
        areaName: string,
      ) => {
        if (areaName !== "sync") {
          return;
        }

        // If the remote settings key changed, handle conflict resolution
        if (changes["veil_settings"]) {
          const remoteSettings = changes["veil_settings"].newValue as Settings | undefined;
          if (remoteSettings) {
            void this.handleRemoteChange(remoteSettings);
          }
        }
      };

      storage.onChanged.addListener(onChangedListener);
    } catch {
      // storage.onChanged may not be available in all contexts (e.g., content scripts)
    }
  }

  async push(changes: SettingsChange[]): Promise<void> {
    if (!this._userId) {
      throw new Error("Sync service not initialized");
    }

    if (!this._isOnline) {
      // Queue changes for later
      this.pendingChanges.push(...changes);
      return;
    }

    try {
      const storage = getStorageApi();
      if (!storage) {
        // No storage API available — queue for later
        this.pendingChanges.push(...changes);
        return;
      }

      // Read current remote settings, apply changes, and write back
      const result = await storage.sync.get("veil_settings");
      const currentSettings: Settings = result["veil_settings"] ?? this.getDefaultSettings();

      // Apply each change to the settings object
      for (const change of changes) {
        (currentSettings as any)[change.key] = change.value;
      }

      // Update the sync timestamp
      currentSettings.lastSyncTimestamp = Date.now();

      await storage.sync.set({ veil_settings: currentSettings });
      this.pendingChanges = [];
    } catch {
      // If write fails (e.g., quota exceeded, offline), queue changes
      this.pendingChanges.push(...changes);
    }
  }

  async pull(): Promise<Settings> {
    if (!this._userId) {
      throw new Error("Sync service not initialized");
    }

    try {
      const storage = getStorageApi();
      if (!storage) {
        return this.getDefaultSettings();
      }

      const result = await storage.sync.get("veil_settings");
      const remoteSettings = result["veil_settings"] as Settings | undefined;
      return remoteSettings ?? this.getDefaultSettings();
    } catch {
      return this.getDefaultSettings();
    }
  }

  resolveConflict(local: Settings, remote: Settings): Settings {
    // Last-write-wins strategy: use the most recent lastSyncTimestamp
    if (local.lastSyncTimestamp >= remote.lastSyncTimestamp) {
      return local;
    }
    return remote;
  }

  onConflict(callback: ConflictCallback): void {
    this.conflictCallbacks.push(callback);
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  set isOnline(value: boolean) {
    this._isOnline = value;
    if (value && this.pendingChanges.length > 0) {
      void this.push(this.pendingChanges);
    }
  }

  private async handleRemoteChange(remoteSettings: Settings): Promise<void> {
    try {
      const storage = getStorageApi();
      if (!storage) {
        return;
      }

      // Get local settings from local storage for comparison
      const localResult = await storage.local.get("veil_local_settings");
      const localSettings = localResult["veil_local_settings"] as Settings | undefined;

      if (!localSettings) {
        // No local settings — accept remote
        await storage.local.set({ veil_local_settings: remoteSettings });
        return;
      }

      // Detect conflict: both have been modified since last sync
      if (
        localSettings.lastSyncTimestamp !== remoteSettings.lastSyncTimestamp &&
        localSettings.lastSyncTimestamp > 0
      ) {
        // Notify conflict callbacks
        for (const cb of this.conflictCallbacks) {
          cb(localSettings, remoteSettings);
        }

        // Resolve using last-write-wins
        const resolved = this.resolveConflict(localSettings, remoteSettings);
        await storage.local.set({ veil_local_settings: resolved });
      } else {
        // No conflict — accept remote
        await storage.local.set({ veil_local_settings: remoteSettings });
      }
    } catch {
      // Silently handle errors in background listener
    }
  }

  private getDefaultSettings(): Settings {
    return {
      enabled: true,
      whitelist: [],
      filterLists: [],
      customRules: [],
      updateInterval: 24,
      syncEnabled: false,
      statisticsEnabled: true,
      lastSyncTimestamp: 0,
    };
  }
}
