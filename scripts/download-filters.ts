/**
 * Script to download filter lists for offline bundling.
 * Run: npx tsx scripts/download-filters.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface RegistryEntry {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

interface Registry {
  lists: RegistryEntry[];
}

const FILTER_DIR = join(import.meta.dirname ?? ".", "..", "filter-lists", "downloaded");

async function downloadList(entry: RegistryEntry): Promise<void> {
  console.log(`Downloading: ${entry.name} (${entry.id})...`);

  try {
    const response = await fetch(entry.url, {
      headers: { "User-Agent": "ContentBlocker/0.1.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split("\n").length;

    writeFileSync(join(FILTER_DIR, `${entry.id}.txt`), text);
    console.log(`  ✓ ${entry.name}: ${lines} lines`);
  } catch (error) {
    console.error(`  ✗ ${entry.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(FILTER_DIR, { recursive: true });

  const registryPath = join(import.meta.dirname ?? ".", "..", "filter-lists", "registry.json");
  const registry: Registry = JSON.parse(readFileSync(registryPath, "utf-8"));

  console.log(`Found ${registry.lists.length} filter lists\n`);

  for (const entry of registry.lists) {
    await downloadList(entry);
  }

  console.log("\nDone!");
}

void main();
