#!/bin/bash
#
# Veil — Automatic installation script for all platforms
# Usage: ./scripts/install.sh [chrome|firefox|safari|all]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PLATFORM="${1:-all}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[Veil]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── Prerequisites ─────────────────────────────────────────────────────────────

check_prerequisites() {
  log "Checking prerequisites..."

  if ! command -v node &>/dev/null; then
    error "Node.js not found. Install: https://nodejs.org"
  fi

  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 20 ]; then
    error "Node.js 20+ required (found v$(node -v))"
  fi

  if ! command -v pnpm &>/dev/null; then
    log "Installing pnpm..."
    corepack enable
    corepack prepare pnpm@9.15.4 --activate
  fi

  success "Prerequisites OK (Node $(node -v), pnpm $(pnpm -v))"
}

# ─── Build ─────────────────────────────────────────────────────────────────────

build_project() {
  log "Installing dependencies..."
  cd "$ROOT_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install

  log "Building all packages..."
  pnpm run build

  success "Build complete"
}

# ─── Chrome ────────────────────────────────────────────────────────────────────

install_chrome() {
  log "Installing Chrome extension..."

  # Check if Chrome is installed
  if [ -d "/Applications/Google Chrome.app" ]; then
    CHROME_PATH="/Applications/Google Chrome.app"
  elif [ -d "/Applications/Chromium.app" ]; then
    CHROME_PATH="/Applications/Chromium.app"
  else
    warn "Chrome not found in /Applications"
    warn "Manual install: chrome://extensions → Load unpacked → $(ROOT_DIR)/packages/chrome"
    return
  fi

  # Open Chrome extensions page and provide instructions
  open "$CHROME_PATH" --args --new-window "chrome://extensions"

  echo ""
  success "Chrome opened at extensions page"
  echo ""
  echo "  To complete installation:"
  echo "  1. Enable 'Developer mode' (toggle top-right)"
  echo "  2. Click 'Load unpacked'"
  echo "  3. Select: ${ROOT_DIR}/packages/chrome"
  echo ""

  # Also create a packaged zip for convenience
  log "Creating Chrome package..."
  cd "$ROOT_DIR"
  rm -f dist-extensions/veil-chrome-latest.zip
  zip -r dist-extensions/veil-chrome-latest.zip \
    packages/chrome/dist/ \
    packages/chrome/manifest.json \
    packages/chrome/icons/ \
    packages/chrome/popup.html \
    packages/chrome/options.html \
    packages/chrome/rules/ \
    packages/chrome/filter-lists/ \
    -x "*.DS_Store" 2>/dev/null

  success "Chrome extension ready at: ${ROOT_DIR}/packages/chrome"
}

# ─── Firefox ───────────────────────────────────────────────────────────────────

install_firefox() {
  log "Installing Firefox extension..."

  # Check if Firefox is installed
  if [ -d "/Applications/Firefox.app" ]; then
    FIREFOX_PATH="/Applications/Firefox.app"
  else
    warn "Firefox not found in /Applications"
    warn "Manual install: about:debugging → Load Temporary Add-on → manifest.json"
    return
  fi

  # Open Firefox debugging page
  open "$FIREFOX_PATH" --args --new-tab "about:debugging#/runtime/this-firefox"

  echo ""
  success "Firefox opened at debugging page"
  echo ""
  echo "  To complete installation:"
  echo "  1. Click 'Load Temporary Add-on...'"
  echo "  2. Select: ${ROOT_DIR}/packages/firefox/manifest.json"
  echo ""

  # Create xpi package
  log "Creating Firefox package..."
  cd "$ROOT_DIR"
  rm -f dist-extensions/veil-firefox-latest.xpi
  zip -r dist-extensions/veil-firefox-latest.xpi \
    packages/firefox/dist/ \
    packages/firefox/manifest.json \
    packages/firefox/icons/ \
    packages/firefox/popup.html \
    packages/firefox/options.html \
    -x "*.DS_Store" 2>/dev/null

  success "Firefox extension ready at: ${ROOT_DIR}/packages/firefox"
}

# ─── Safari (macOS) ────────────────────────────────────────────────────────────

install_safari() {
  log "Installing Safari extension..."

  # Check for Xcode
  if ! command -v xcodebuild &>/dev/null; then
    warn "Xcode not installed. Required for Safari extensions."
    warn "Install from: App Store → Xcode"
    echo ""
    echo "  After installing Xcode, run this script again."
    return
  fi

  # Check if Safari extension project exists
  SAFARI_PROJECT="${ROOT_DIR}/apps/ios/ContentBlocker.xcodeproj"
  if [ ! -d "$SAFARI_PROJECT" ] && [ ! -d "${ROOT_DIR}/apps/ios/ContentBlocker" ]; then
    log "Creating Safari extension Xcode project..."
    create_safari_project
  fi

  # Enable Safari developer mode
  defaults write com.apple.Safari IncludeDevelopMenu -bool true 2>/dev/null || true
  defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true 2>/dev/null || true

  echo ""
  success "Safari extension prepared"
  echo ""
  echo "  To complete installation:"
  echo "  1. Open Xcode project: ${ROOT_DIR}/apps/ios/"
  echo "  2. Select your Team in Signing & Capabilities"
  echo "  3. Product → Run (⌘R)"
  echo "  4. Safari → Settings → Extensions → Enable Veil"
  echo ""
  echo "  For development without Xcode project:"
  echo "  1. Safari → Develop → Allow Unsigned Extensions"
  echo "  2. Safari → Settings → Extensions → Enable Veil"
  echo ""
}

create_safari_project() {
  # Copy compiled Safari adapter to the iOS app resources
  RESOURCES_DIR="${ROOT_DIR}/apps/ios/ContentBlocker/Shared"
  mkdir -p "$RESOURCES_DIR"

  # Copy the compiled rules compiler
  cp -r "${ROOT_DIR}/packages/safari/dist/"* "$RESOURCES_DIR/" 2>/dev/null || true

  success "Safari resources copied to apps/ios/"
}

# ─── All Platforms ─────────────────────────────────────────────────────────────

install_all() {
  install_chrome
  echo ""
  install_firefox
  echo ""
  install_safari
}

# ─── Main ──────────────────────────────────────────────────────────────────────

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Veil Content Blocker v1.1.0      ║"
echo "  ║     Installation Script              ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

check_prerequisites
build_project

echo ""

case "$PLATFORM" in
  chrome)  install_chrome ;;
  firefox) install_firefox ;;
  safari)  install_safari ;;
  all)     install_all ;;
  *)       error "Unknown platform: $PLATFORM. Use: chrome, firefox, safari, or all" ;;
esac

echo ""
success "Installation complete!"
echo ""
echo "  Documentation: ${ROOT_DIR}/README.md"
echo "  Run tests:     pnpm test"
echo "  Report issues: https://github.com/mmovsesyan/Veil/issues"
echo ""
