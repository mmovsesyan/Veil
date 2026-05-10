/**
 * IndexedDB-based storage for compiled rules.
 * 
 * Service workers in MV3 can be terminated at any time.
 * This store persists compiled rules so they can be restored instantly
 * without re-parsing filter list text on every wake-up.
 * 
 * Schema:
 *   - rules: Serialized Rule[] per filter list
 *   - metadata: Last update timestamps, checksums
 *   - cosmetic: Pre-computed cosmetic rules per domain
 */

const DB_NAME = "content-blocker";
const DB_VERSION = 1;

interface RuleStore {
  listId: string;
  rules: string; // JSON-serialized Rule[]
  timestamp: number;
  checksum: string;
}

interface MetadataStore {
  key: string;
  value: string;
}

export class IndexedDBStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("rules")) {
          db.createObjectStore("rules", { keyPath: "listId" });
        }
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("cosmetic")) {
          db.createObjectStore("cosmetic", { keyPath: "domain" });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store compiled rules for a filter list.
   */
  async saveRules(listId: string, rulesJson: string, checksum: string): Promise<void> {
    const store: RuleStore = {
      listId,
      rules: rulesJson,
      timestamp: Date.now(),
      checksum,
    };
    await this.put("rules", store);
  }

  /**
   * Load compiled rules for a filter list.
   */
  async loadRules(listId: string): Promise<RuleStore | null> {
    return this.get("rules", listId);
  }

  /**
   * Load all stored rule sets.
   */
  async loadAllRules(): Promise<RuleStore[]> {
    return this.getAll("rules");
  }

  /**
   * Save metadata (settings, timestamps, etc.)
   */
  async saveMetadata(key: string, value: string): Promise<void> {
    await this.put("metadata", { key, value });
  }

  /**
   * Load metadata.
   */
  async loadMetadata(key: string): Promise<string | null> {
    const result = await this.get<MetadataStore>("metadata", key);
    return result?.value ?? null;
  }

  /**
   * Cache cosmetic rules for a domain.
   */
  async saveCosmeticCache(domain: string, selectors: string[]): Promise<void> {
    await this.put("cosmetic", { domain, selectors: JSON.stringify(selectors), timestamp: Date.now() });
  }

  /**
   * Load cached cosmetic rules for a domain.
   */
  async loadCosmeticCache(domain: string): Promise<string[] | null> {
    const result = await this.get<{ domain: string; selectors: string; timestamp: number }>("cosmetic", domain);
    if (!result) return null;

    // Cache expires after 1 hour
    if (Date.now() - result.timestamp > 3600000) return null;

    return JSON.parse(result.selectors);
  }

  /**
   * Clear all stored data.
   */
  async clear(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(["rules", "metadata", "cosmetic"], "readwrite");
    tx.objectStore("rules").clear();
    tx.objectStore("metadata").clear();
    tx.objectStore("cosmetic").clear();
    await this.txComplete(tx);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async put(storeName: string, value: unknown): Promise<void> {
    if (!this.db) await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.db) await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  private txComplete(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
