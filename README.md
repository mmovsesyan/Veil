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

- **Network blocking** — 3.6M req/s, sub-microsecond matching
- **Cosmetic filtering** — CSS element hiding, extended CSS selectors
- **Anti-adblock bypass** — 116 scriptlets (CSP-safe injection via world:MAIN)
- **Auto-learning** — discovers new ad patterns automatically
- **Element picker** — click any element to block it permanently
- **$redirect / $removeparam / $csp** — advanced filtering
- **CNAME uncloaking** — detect hidden trackers
- **Cross-device sync** — via browser.storage.sync

## Installation

### Chrome (Desktop)

```bash
git clone https://github.com/mmovsesyan/Veil.git
cd Veil
pnpm install
pnpm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `packages/chrome/`
4. Done — Veil icon appears in toolbar

### Firefox (Desktop)

```bash
pnpm run build
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `packages/firefox/manifest.json`

### Safari (macOS)

```bash
pnpm run build
open apps/xcode/Veil/Veil.xcodeproj
```

1. In Xcode: select your Team in Signing
2. Press **⌘R** (Run)
3. Safari → Develop → **Allow Unsigned Extensions**
4. Safari → Settings → Extensions → enable **Veil**

### iPhone (Safari)

```bash
pnpm run build
open apps/xcode-ios/Veil/Veil.xcodeproj
```

1. Connect iPhone via cable
2. In Xcode: select your iPhone device
3. Select your Team in Signing for both targets
4. Press **⌘R** — app installs on iPhone
5. iPhone: Settings → General → VPN & Device Management → trust developer
6. iPhone: Settings → Safari → Extensions → enable **Veil**

**For Content Blocker (blocks ads natively):**
1. In Xcode: File → New → Target → **Content Blocker Extension**
2. Name: `VeilBlocker`
3. Replace `blockerList.json` with ours:
```bash
cp "apps/xcode-ios/Veil/Veil Content Blocker/blockerList.json" \
   "apps/xcode-ios/Veil/VeilBlocker/blockerList.json"
```
4. Build and run
5. iPhone: Settings → Safari → Content Blockers → **VeilBlocker** → ON

### iPhone & Android (DNS — all apps)

**iPhone:**
- AirDrop file `apps/ios/Veil-AdBlock-DNS.mobileconfig` to iPhone
- Settings → Profile Downloaded → Install
- Blocks ads in all apps via encrypted DNS

**Android:**
- Settings → Network & Internet → Private DNS
- Enter: `dns.adguard-dns.com`
- Blocks ads in all apps

### Auto-install script (Chrome + Firefox + Safari)

```bash
./scripts/install.sh all      # All browsers
./scripts/install.sh chrome   # Chrome only
./scripts/install.sh firefox  # Firefox only
./scripts/install.sh safari   # Safari only
```

## How It Works

```
User browses → Request intercepted → Engine checks rules → Block/Allow
                                          ↓
                              Auto-learning observes
                              unblocked ad patterns
                                          ↓
                              After 3 confirmations →
                              New rule added automatically
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│   Popup │ Options │ Statistics │ Element Picker              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Core Engine                             │
│  Rule Parser │ Blocking Engine │ 116 Scriptlets              │
│  Auto-Learning │ Serializer │ CNAME Uncloaking              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Platform Adapters                          │
│  Chrome (DNR) │ Firefox (webRequest) │ Safari (WebKit JSON) │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
pnpm test              # 229 tests
pnpm run build         # Build all packages
pnpm run lint          # ESLint
pnpm run typecheck     # TypeScript
./scripts/build-ios-rules.sh  # Generate Safari Content Blocker JSON
```

## Performance

| Metric | Value |
|--------|-------|
| Throughput | 3.6M req/s |
| Latency | 0.3μs/request |
| Init (300K rules) | 250ms |
| Memory | ~48MB |
| Scriptlets | 116 |
| Filter modifiers | 30+ |

## License

MIT
