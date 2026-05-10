#!/bin/bash
# Package browser extensions for distribution
set -e

echo "Building all packages..."
pnpm run build

DIST_DIR="dist-extensions"
mkdir -p "$DIST_DIR"

# Chrome Extension (zip for Chrome Web Store)
echo ""
echo "📦 Packaging Chrome extension..."
cd packages/chrome
zip -r "../../$DIST_DIR/content-blocker-chrome.zip" \
  dist/ \
  rules/ \
  icons/ \
  manifest.json \
  popup.html \
  options.html \
  -x "*.test.*" "*.map"
cd ../..
echo "  ✓ $DIST_DIR/content-blocker-chrome.zip"

# Firefox Extension (xpi)
echo ""
echo "📦 Packaging Firefox extension..."
cd packages/firefox
zip -r "../../$DIST_DIR/content-blocker-firefox.xpi" \
  dist/ \
  icons/ \
  manifest.json \
  popup.html \
  options.html \
  -x "*.test.*" "*.map"
cd ../..
echo "  ✓ $DIST_DIR/content-blocker-firefox.xpi"

# Safari (just the compiled adapter — needs Xcode project)
echo ""
echo "📦 Packaging Safari adapter..."
cp -r packages/safari/dist "$DIST_DIR/safari-adapter"
echo "  ✓ $DIST_DIR/safari-adapter/"

echo ""
echo "✅ All extensions packaged in $DIST_DIR/"
ls -la "$DIST_DIR/"
