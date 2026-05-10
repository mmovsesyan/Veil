#!/bin/bash
# Build WASM module from Rust source.
# Requires: rustup, wasm-pack
#
# Install:
#   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
#   cargo install wasm-pack
#
# Usage:
#   cd packages/core/wasm && bash build.sh

set -e

echo "Building WASM module..."
wasm-pack build --target web --out-dir pkg --release

echo ""
echo "✓ WASM module built: pkg/content_blocker_wasm_bg.wasm"
echo "  Size: $(du -h pkg/content_blocker_wasm_bg.wasm | cut -f1)"
echo ""
echo "To use in the extension, copy pkg/ to the extension's dist/ directory."
