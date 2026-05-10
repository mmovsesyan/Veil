#!/bin/bash
# Generates WebKit Content Blocker JSON from filter rules
# Run before building in Xcode: ./scripts/build-ios-rules.sh

set -e
cd "$(dirname "$0")/.."

echo "[Veil] Building iOS content blocker rules..."

# Build core + safari if needed
pnpm --filter @veil/core run build 2>/dev/null
pnpm --filter @veil/safari run build 2>/dev/null

# Generate blockerList.json
node --input-type=module -e "
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { RuleParser } from './packages/core/dist/index.js';
import { SafariAdapter } from './packages/safari/dist/index.js';

const parser = new RuleParser();
const adapter = new SafariAdapter();

const files = [
  'packages/chrome/bundled-rules/easylist-mini.txt',
  'packages/chrome/bundled-rules/easyprivacy-mini.txt',
  'packages/chrome/bundled-rules/rutube.txt',
];

let allRules = [];
for (const file of files) {
  try {
    const text = readFileSync(file, 'utf-8');
    const result = parser.parseList(text);
    allRules.push(...result.rules);
  } catch (e) {
    console.warn('Skipped:', file, e.message);
  }
}

const webkitRules = adapter.compileToWebKitJSON(allRules);

// Write to both projects
const targets = [
  'apps/xcode-ios/Veil/Veil Extension/blockerList.json',
  'apps/xcode/Veil/Veil Extension/blockerList.json',
];

for (const target of targets) {
  writeFileSync(target, JSON.stringify(webkitRules));
}

console.log('[Veil] Generated ' + webkitRules.length + ' WebKit rules');
"

echo "[Veil] Done. Rebuild in Xcode to apply."
