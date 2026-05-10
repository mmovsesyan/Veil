# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-05-10

### Added

- **Safari Web Extension for iOS** — full Xcode project, installs on iPhone via cable
- **Safari Web Extension for macOS** — native Safari integration
- **DNS Ad Blocker profile** for iPhone — blocks ads system-wide via AdGuard DoH
- **Automatic install script** (`./scripts/install.sh`) for Chrome, Firefox, Safari

### Fixed

- Chrome: `ReferenceError: Cannot access 'E' before initialization` — fixed variable hoisting
- Chrome: empty `resourceTypes` array rejected by DNR — returns undefined instead
- Chrome: badge counter now works in production via `webRequest.onErrorOccurred`
- Chrome: ON/OFF properly removes/restores all DNR rules + reloads tab
- Chrome: whitelist uses stable hash-based rule IDs (no more collisions)
- Chrome: options page `toLocaleString` crash on undefined `rulesCount`
- Chrome: popup whitelist button toggles state and shows correct label
- Firefox: cosmetic injection checks `isEnabled`
- Firefox: added `GET_COSMETIC_RULES` message handler
- Safari: TOGGLE_ENABLED recompiles content blocker
- All platforms: auto-learned rules persisted and restored on startup
- All platforms: XSS in social widget placeholders (innerHTML → DOM API)
- Core: `findAllowRule` returns highest-priority match
- Core: `rebuildFromRules` preserves nextId
- Core: cosmetic cache bounded (FIFO eviction at 500)
- Core: concurrent initialization mutex

## [1.1.0] — 2026-05-10

### Added

- **Auto-learning engine integration** — now active in all three browsers:
  - Chrome: analyzes unblocked requests via `webRequest.onCompleted`
  - Firefox: inline analysis in `onBeforeRequest` for third-party requests
  - Safari: uses `PerformanceObserver` content script to detect loaded resources
- **Message API for auto-learning**: `GET_AUTO_RULES_STATS`, `GET_AUTO_RULES`, `CONFIRM_AUTO_RULE`, `REJECT_AUTO_RULE`
- Auto-confirmed rules are added to the engine in real-time and persisted

### Fixed

- **Sync Service** — replaced stub with real `browser.storage.sync` / `chrome.storage.sync` implementation with conflict detection, offline queue, and `storage.onChanged` listener
- **Firefox Adapter** — all methods now call real browser APIs (`browser.tabs.query`, `browserAction.setBadgeText`, `webNavigation.onCommitted`)
- **Safari Native Bridge** — uses `browser.runtime.sendNativeMessage` with proper error handling and fallback
- **Safari Adapter** — stores compiled WebKit JSON in `browser.storage.local`, triggers native content blocker reload, real badge and tabs API
- All lint errors resolved, CI fully green

### Performance

- Engine throughput improved to **3.6M req/s** (up from 1.7M in v1.0.0)

## [1.0.0] — 2025-01-15

### 🎉 Initial Release

First stable release of Veil — a high-performance cross-browser content blocker.

### Core Engine

- **Token-bucket matching engine** with O(1) hostname lookup and sub-microsecond matching
- **1.7M requests/sec** throughput on Apple M-series (300K rules loaded)
- **0.6μs** average matching latency per request
- **$important priority system** — rules with `$important` override exceptions
- **$badfilter** — disable specific rules without modifying filter lists
- **Engine serialization** for fast cold start (<50ms from cache vs 250ms full parse)
- **Auto-learning engine** — automatically discovers and blocks new ad patterns

### Parser

- **30+ modifiers** with full ABP/uBlock Origin/AdGuard syntax compatibility
- Basic modifiers: `$third-party`, `$~third-party`, `$match-case`
- Resource types: `$script`, `$image`, `$stylesheet`, `$xhr`, `$media`, `$font`, `$iframe`, `$popup`
- Priority: `$important`, `$badfilter`
- Actions: `$redirect`, `$redirect-rule`, `$removeparam`, `$csp`, `$permissions`
- Scope: `$domain`, `$denyallow`, `$to`, `$method`, `$from`
- Page-level: `$document`, `$elemhide`, `$generichide`, `$genericblock`
- Special: `$all`, `$strict1p`, `$strict3p`, `$header`, `$cookie`

### Scriptlets

- **116 scriptlets** for anti-adblock bypass including:
  - `abort-on-property-read` / `abort-on-property-write`
  - `prevent-fetch` / `prevent-xhr`
  - `prevent-bab` (bypass anti-adblock)
  - `json-prune` — modify JSON responses
  - `set-constant` — override JS variables
  - `remove-class` / `remove-attr`
  - `nano-setInterval-booster` / `nano-setTimeout-booster`
  - `abort-current-inline-script`
  - And 107 more...

### Cross-Browser Support

- **Chrome** — Manifest V3 with declarativeNetRequest API (30K dynamic rule limit)
- **Firefox** — Manifest V2 with webRequest/webRequestBlocking (full streaming support)
- **Safari** — WebKit Content Blocker API with JSON rules (150K rule limit)
- **Android** — Local VPN-based DNS blocking (system-wide, no root required)
- **iOS/macOS** — Safari Content Blocker extension with iCloud sync

### Network Filtering Features

- **$redirect** — serve neutered resources (noop.js, 1x1.gif, empty.css) instead of blocking
- **$removeparam** — strip tracking parameters (utm_*, fbclid, gclid, etc.) from URLs
- **$csp injection** — Content-Security-Policy header modification
- **CNAME uncloaking** — detect trackers hiding behind first-party CNAME records (Firefox)
- **HTML filtering** — remove elements from raw HTML before rendering (Firefox `filterResponseData`)

### Cosmetic Filtering

- CSS element hiding (`##.ad-banner`)
- Extended CSS selectors (`#?#div:has(> .ad-label)`)
- MutationObserver-based filtering for SPAs
- Element picker — visual rule creation by clicking page elements

### UI

- **Popup** — per-tab stats, quick toggle, whitelist current site
- **Options page** — filter list management, custom rules editor, import/export
- **Statistics** — per-tab, daily, weekly blocking stats with charts
- **Social widget placeholders** — block Facebook/Twitter/Instagram/LinkedIn/VK with one-click load
- **Cross-device sync** — settings synchronization with conflict resolution

### Filter List Compatibility

- EasyList, EasyPrivacy, uBlock filters, AdGuard Base
- Peter Lowe's List, Fanboy Social, Fanboy Annoyances
- RU AdList, regional lists
- Custom user rules with full syntax support

### Performance

| Metric | Value |
|--------|-------|
| Matching latency | 0.6μs per request |
| Throughput | 1.7M requests/sec |
| Initialization | 250ms (300K rules) |
| Memory | ~48MB (300K rules) |
| Cold start (cached) | <50ms |

### Testing

- 229 unit and integration tests
- Property-based testing with fast-check
- Coverage: >80% for core package
- CI/CD pipeline with automated builds

[1.0.0]: https://github.com/user/veil/releases/tag/v1.0.0
