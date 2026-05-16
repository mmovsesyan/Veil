# Veil

<p align="center">
  <img src="apps/store-listings/icon-128.png" alt="Veil" width="128" height="128">
</p>

<p align="center">
  <strong>AI-native cross-browser content blocker</strong><br>
  Ads · Trackers · Social widgets · Anti-adblock bypass · Privacy Budget · On-device ML
</p>

---

## Features

- **Network blocking** — 3.3M req/s, sub-microsecond matching (token-bucket + trie indexes)
- **Cosmetic filtering** — CSS element hiding, extended CSS selectors, MutationObserver for SPAs
- **Anti-adblock bypass** — 116 scriptlets (CSP-safe injection via `world: MAIN`)
- **Auto-learning** — discovers new ad patterns automatically from unblocked requests
- **Element picker** — click any element to block it permanently, with **undo** within 60 seconds
- **Privacy Budget Tracker** — monitors 20+ fingerprinting APIs (Canvas, WebGL, AudioContext, WebRTC, etc.) and scores domains 0-100
- **Smart DOM Classifier** — on-device TensorFlow.js MLP (64→32→16→5) + heuristic fallback detects zero-day ads without filter lists
- **Collaborative Rules** — serverless P2P sync between browser instances via BroadcastChannel; QR-code sharing for cross-user rule exchange
- **$redirect / $removeparam / $csp / $badfilter / $important** — advanced filtering modifiers
- **CNAME uncloaking** — detect hidden trackers behind first-party CNAMEs
- **Cross-browser sync** — rules, whitelist, and settings via browser.storage

## Download & Install (No Build Required)

Pre-built packages are available after running `pnpm run package`:

### Chrome / Edge / Brave (Desktop)

1. Download `dist-extensions/content-blocker-chrome.zip`
2. Unzip to a folder
3. Open `chrome://extensions`
4. Enable **Developer mode** (toggle top-right)
5. Click **Load unpacked** → select the unzipped folder
6. Veil icon appears in toolbar

### Firefox (Desktop)

1. Download `dist-extensions/content-blocker-firefox.xpi`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `manifest.json` from the extracted `.xpi`

> Note: Firefox temporary add-ons unload on browser restart. For permanent install, use `about:addons` → Install from file, or publish to AMO.

### Safari (macOS)

Safari Web Extensions require a native macOS app wrapper (Xcode project). Build from source:

```bash
pnpm run build
open apps/xcode/Veil/Veil.xcodeproj
```

1. In Xcode: select your Team in Signing
2. Press **⌘R** (Run)
3. Safari → Develop → **Allow Unsigned Extensions**
4. Safari → Settings → Extensions → enable **Veil**

### iPhone (Safari)

See [iOS Safari Extension Setup](#iphone--safari) below.

## Build from Source

```bash
# Clone
git clone https://github.com/mmovsesyan/Veil.git
cd Veil

# Install dependencies
pnpm install

# Run tests (281 tests)
pnpm test

# Build all packages
pnpm run build

# Package extensions for distribution
pnpm run package
# Outputs:
#   dist-extensions/content-blocker-chrome.zip
#   dist-extensions/content-blocker-firefox.xpi
#   dist-extensions/safari-adapter/
```

## How It Works

```
User browses → Request intercepted → Engine checks rules → Block/Allow
                                          ↓
                              Privacy Monitor wraps APIs
                              (Canvas, WebGL, Audio, WebRTC...)
                                          ↓
                              ML Classifier scans DOM mutations
                              catches zero-day ads not in lists
                                          ↓
                              Auto-learning observes patterns
                                          ↓
                              After 5 confirmations →
                              New rule added + broadcast via P2P
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UI Layer                                      │
│   Popup │ Options │ Statistics │ Element Picker │ Privacy Dashboard │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                      Core Engine                                     │
│  Rule Parser │ Blocking Engine │ 116 Scriptlets │ Pattern Compiler   │
│  Auto-Learning │ Serializer │ CNAME Uncloaking │ Signature Verify   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                   AI-Native Layer                                    │
│  PrivacyBudgetTracker │ SmartDOMClassifier (TF.js MLP + heuristic)  │
│  CollaborativeRulesEngine │ BroadcastSync │ QRRulesExporter          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                   Platform Adapters                                  │
│  Chrome (DNR + Service Worker) │ Firefox (webRequest) │ Safari      │
└─────────────────────────────────────────────────────────────────────┘
```

## Development

```bash
pnpm test              # 281 tests
pnpm run build         # Build all packages
pnpm run lint          # ESLint
pnpm run typecheck     # TypeScript
pnpm run package       # Chrome .zip + Firefox .xpi
./scripts/build-ios-rules.sh  # Generate Safari Content Blocker JSON
```

## Performance

| Metric | Value |
|--------|-------|
| Throughput | 3.3M req/s |
| Latency | 0.3μs/request |
| Init (300K rules) | 280ms |
| Memory | ~66MB |
| Scriptlets | 116 |
| Filter modifiers | 30+ |
| ML inference | ~2ms/element (heuristic fallback) |

## Technical Notes

### Privacy Budget Scoring

- **0-20**: Clean — minimal fingerprinting
- **20-50**: Moderate — some tracking APIs used
- **50-80**: High — aggressive fingerprinting detected
- **80-100**: Extreme — multiple high-entropy APIs (Canvas + WebGL + Audio + WebRTC)

Scores decay exponentially (half-life = 1 hour) so old visits don't skew results.

### ML Classifier Safety

- **Content** is never blocked regardless of confidence
- Ads/trackers require confidence ≥0.85
- Annoyances (cookie banners) require ≥0.90
- Runs only on `IFRAME`, `IMG`, `DIV`, `SECTION`, `ASIDE` elements
- Limited to 20 candidates per MutationObserver batch to avoid jank

### Collaborative Rules (Serverless P2P)

- Uses `BroadcastChannel("veil-collab-v1")` — no external server
- Rules need 3 peer confirmations before auto-adding (configurable)
- HMAC-SHA256 signature verifies rule authenticity
- QR-code export fits ~150 rules per code (dictionary compression + base64)
- Safari fallback uses `chrome.storage.onChanged` for cross-tab sync

### Chrome DNR 30K Rule Limit

Chrome MV3 allows max 30,000 dynamic rules. With 300K filter rules loaded, we prioritize:
1. Allow rules (highest priority — prevent breakage)
2. Redirect rules ($redirect)
3. $removeparam rules
4. $csp rules
5. Block rules (fill remaining slots)

The JS engine still has all 300K rules for accurate badge counting, cosmetic filtering, and ML classification.

### Safari 150K Rule Limit

Safari Content Blocker allows 150,000 rules per extension. `splitIntoExtensions()` automatically chunks rules across multiple content blocker instances if needed.

### Auto-Learning Safety

- Requires **5 confirmations** with confidence ≥0.7
- Maximum 200 auto-learned rules
- Rejected rules are permanently blacklisted
- Manual blocks via element picker bypass threshold (instant confirm)
- Undo available for 60 seconds after manual block

## Browser Support

| Browser | Network Blocking | Cosmetic | ML | Privacy | Undo | P2P Sync |
|---------|------------------|----------|----|---------|------|----------|
| Chrome  | DNR + JS engine  | Yes      | Yes| Yes     | Yes  | Yes      |
| Firefox | webRequest       | Yes      | Yes| Yes     | Yes  | Yes      |
| Safari  | WebKit JSON      | Yes      | No | Partial | No   | Storage  |
| Edge    | DNR + JS engine  | Yes      | Yes| Yes     | Yes  | Yes      |
| Brave   | DNR + JS engine  | Yes      | Yes| Yes     | Yes  | Yes      |

## License

MIT
