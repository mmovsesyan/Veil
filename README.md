# Veil

<p align="center">
  <img src="apps/store-listings/icon-128.png" alt="Veil" width="128" height="128">
</p>

<p align="center">
  <strong>High-performance cross-browser content blocker</strong><br>
  Ads · Trackers · Social widgets · Anti-adblock bypass
</p>

---

## Features

- **Network blocking** — token-bucket engine with O(1) hostname lookup and sub-microsecond matching
- **Cosmetic filtering** — CSS element hiding, extended CSS selectors (`#?#`), MutationObserver for SPAs
- **Anti-adblock bypass** — 116 scriptlets (abort-on-property-read, prevent-fetch, prevent-bab, json-prune, etc.)
- **$redirect** — serve neutered resources (noop.js, 1x1.gif) instead of blocking
- **$removeparam** — strip tracking parameters (utm_*, fbclid, gclid) from URLs
- **$csp injection** — Content-Security-Policy header modification
- **CNAME uncloaking** — detect trackers hiding behind first-party CNAME records
- **HTML filtering** — remove elements from raw HTML before rendering (Firefox)
- **Element picker** — visual rule creation by clicking page elements
- **Social widget placeholders** — block Facebook/Twitter/Instagram/LinkedIn/VK with one-click load
- **Cross-device sync** — settings synchronization with conflict resolution
- **Auto-learning engine** — automatically discovers and blocks new ad patterns
- **Statistics** — per-tab, daily, weekly blocking stats with charts

## Performance

| Metric | Value |
|--------|-------|
| Matching latency | **0.6μs** per request |
| Throughput | **1.7M** requests/sec |
| Initialization | **250ms** (300K rules) |
| Memory | **~48MB** (300K rules) |
| Cold start (cached) | **<50ms** |

## Supported Browsers

| Browser | API | Version |
|---------|-----|---------|
| Chrome | declarativeNetRequest (Manifest V3) | 110+ |
| Firefox | webRequest (MV2) | 109+ |
| Safari | WebKit Content Blocker API | 16+ |
| Android | Local VPN DNS blocking | 8+ |
| iOS/macOS | Safari Content Blocker | 16+ |

## Quick Start

### Requirements

- Node.js ≥ 20
- pnpm ≥ 9 (auto-installed via `corepack enable`)

### Install & Build

```bash
pnpm install
pnpm run build
```

### Run Tests

```bash
pnpm test
```

### Load in Browser

**Chrome:**
1. Open `chrome://extensions` → Enable Developer mode
2. Click "Load unpacked" → Select `packages/chrome/`

**Firefox:**
1. Open `about:debugging` → "Load Temporary Add-on"
2. Select `packages/firefox/manifest.json`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│   Popup │ Options Page │ Statistics │ Element Picker         │
│                    (React + Tailwind)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Core Engine                             │
│                                                             │
│  Rule Parser (ABP/uBO/AG)  │  Blocking Engine (Token-Bucket)│
│  30+ Modifiers             │  $important Priority System    │
│  116 Scriptlets            │  $badfilter Support            │
│  Engine Serializer         │  CNAME Uncloaking              │
│  Auto-Learning Engine      │  HTML Filtering                │
│  $redirect / $removeparam  │  $csp / $permissions           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              WASM Engine (Rust, optional)            │   │
│  │   Hostname HashSet + BMH Search + Token Buckets     │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Platform Adapters                          │
│  Chrome (MV3/DNR)  │  Firefox (webRequest)  │  Safari (JSON)│
└─────────────────────────────────────────────────────────────┘
```

## Filter Syntax

Full compatibility with Adblock Plus, uBlock Origin, and AdGuard:

```adblock
! Network blocking
||ads.example.com^
||tracker.com^$third-party,script,important

! Exception rules
@@||cdn.example.com^

! Cosmetic filtering
##.ad-banner
#?#div:has(> .ad-label)

! Scriptlet injection
example.com#%#//scriptlet("abort-on-property-read", "adblock")

! Advanced modifiers
||tracker.com^$removeparam=utm_source
||ads.com^$redirect=noop.js,script
||unsafe.com^$csp=script-src 'self'
```

### Supported Modifiers (30+)

| Category | Modifiers |
|----------|-----------|
| Basic | `$third-party`, `$match-case` |
| Resource types | `$script`, `$image`, `$stylesheet`, `$xhr`, `$media`, `$font`, `$iframe`, `$popup` |
| Priority | `$important`, `$badfilter` |
| Actions | `$redirect`, `$removeparam`, `$csp`, `$permissions` |
| Scope | `$domain`, `$denyallow`, `$to`, `$method` |
| Page-level | `$document`, `$elemhide`, `$generichide` |

## Project Structure

```
veil/
├── packages/
│   ├── core/          # Shared engine (TypeScript + optional Rust WASM)
│   ├── chrome/        # Chrome Extension (Manifest V3)
│   ├── firefox/       # Firefox Extension (MV2)
│   ├── safari/        # Safari Content Blocker
│   └── ui/            # React UI components
├── apps/
│   ├── android/       # Android app (VPN-based)
│   └── ios/           # iOS/macOS app (Safari extension)
├── filter-lists/      # Filter list registry
├── e2e/               # Playwright E2E tests
└── scripts/           # Build & utility scripts
```

## Development

```bash
pnpm test              # 229 tests, <2s
pnpm run typecheck     # TypeScript checking
pnpm run lint          # ESLint
pnpm run build         # Build all packages
pnpm run package       # Package extensions (zip/xpi)
```

## Tech Stack

- **TypeScript 5.7** — strict typing
- **Rust + wasm-bindgen** — optional WASM acceleration
- **Vite 6** — builds
- **React 18** — UI
- **Tailwind CSS** — styling
- **Vitest + fast-check** — testing (unit + property-based)
- **pnpm workspaces** — monorepo

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
