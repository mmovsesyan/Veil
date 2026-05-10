import type { ISyncService } from "../types/interfaces.js";
import type { ConflictCallback, Settings, SettingsChange } from "../types/index.js";

/**
 * Sync service for synchronizing settings across devices.
 * Uses last-write-wins conflict resolution strategy.
 */
export class SyncService implements ISyncService {
  private _userId: string | null = null;
  private conflictCallbacks: ConflictCallback[] = [];
  private pendingChanges: SettingsChange[] = [];
  private _isOnline = true;

  async initialize(userId: string): Promise<void> {
    this._userId = userId;
    // In a real implementation, this would connect to Firebase/Supabase
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

    // In a real implementation, this would push to the remote backend
    this.pendingChanges = [];
  }

  async pull(): Promise<Settings> {
    if (!this._userId) {
      throw new Error("Sync service not initialized");
    }

    // In a real implementation, this would pull from the remote backend
    return this.getDefaultSettings();
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
