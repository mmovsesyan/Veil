# Contributing to Veil

Thank you for your interest in contributing to Veil! This guide covers everything you need to get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [Building](#building)
- [Testing the Extension Locally](#testing-the-extension-locally)
- [Adding New Scriptlets](#adding-new-scriptlets)
- [Adding New Filter List Modifiers](#adding-new-filter-list-modifiers)
- [Code Style Guidelines](#code-style-guidelines)
- [Pull Request Process](#pull-request-process)

---

## Development Setup

### Prerequisites

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Git**
- (Optional) **Rust** + `wasm-pack` for WASM engine development

### Install

```bash
# Clone the repository
git clone https://github.com/user/veil.git
cd veil

# Install all dependencies (monorepo-wide)
pnpm install
```

### Build

```bash
# Build all packages (core → ui → chrome/firefox/safari)
pnpm run build

# Build a specific package
pnpm --filter @veil/core run build
pnpm --filter @veil/chrome run build

# Watch mode (rebuild on changes)
pnpm run dev
```

### Download Filter Lists

```bash
pnpm run download-filters
```

---

## Project Structure

```
veil/
├── packages/
│   ├── core/                  # Shared engine (TypeScript)
│   │   ├── src/
│   │   │   ├── engine/        # Blocking engine, token-bucket matcher
│   │   │   │   ├── blocking-engine.ts
│   │   │   │   ├── auto-rules.ts        # Auto-learning engine
│   │   │   │   ├── cname-uncloaking.ts   # CNAME uncloak
│   │   │   │   ├── csp-injection.ts      # CSP header modification
│   │   │   │   ├── html-filtering.ts     # HTML response filtering
│   │   │   │   ├── redirect-engine.ts    # $redirect resources
│   │   │   │   ├── removeparam.ts        # $removeparam handling
│   │   │   │   └── serializer.ts         # Engine state serialization
│   │   │   ├── rules/         # Parser, modifiers, rule manager
│   │   │   │   ├── parser.ts             # ABP/uBO/AdGuard syntax parser
│   │   │   │   ├── modifiers.ts          # 30+ modifier implementations
│   │   │   │   └── rule-manager.ts       # Filter list CRUD
│   │   │   ├── scriptlets/    # Anti-adblock bypass scripts (116)
│   │   │   ├── stats/         # Statistics tracker
│   │   │   ├── whitelist/     # Whitelist manager
│   │   │   └── sync/          # Cross-device sync
│   │   ├── wasm/              # Rust WASM engine (optional)
│   │   └── vite.config.ts
│   ├── chrome/                # Chrome Extension (Manifest V3)
│   │   ├── src/
│   │   │   ├── adapter/       # Chrome-specific API adapter
│   │   │   ├── background/    # Service worker
│   │   │   ├── content/       # Content script
│   │   │   ├── popup/         # Popup UI
│   │   │   └── options/       # Options page
│   │   └── manifest.json
│   ├── firefox/               # Firefox Extension (MV2)
│   │   ├── src/
│   │   │   ├── adapter/       # Firefox webRequest adapter
│   │   │   ├── background/    # Background script
│   │   │   ├── content/       # Content script
│   │   │   └── popup/         # Popup UI
│   │   └── manifest.json
│   ├── safari/                # Safari Content Blocker
│   │   └── src/
│   │       └── converter/     # Rule → WebKit JSON converter
│   └── ui/                    # Shared React UI components
│       └── src/
│           ├── components/    # Popup, Options, Statistics
│           └── styles/        # Tailwind CSS
├── filter-lists/              # Filter list registry
│   └── registry.json
├── apps/
│   ├── android/               # Android app (local VPN)
│   ├── ios/                   # iOS/macOS app (Safari extension)
│   └── store-listings/        # Store listing metadata
├── scripts/                   # Build & utility scripts
├── .github/workflows/         # CI/CD
└── vitest.config.ts           # Test configuration
```

---

## Running Tests

```bash
# Run all tests (229 tests, typically <2s)
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run tests for a specific package
pnpm --filter @veil/core run test
pnpm --filter @veil/chrome run test

# Run tests matching a pattern
npx vitest run --testPathPattern=parser
npx vitest run --testPathPattern=engine

# Run with coverage report
npx vitest run --coverage

# Run benchmarks
npx vitest run --testPathPattern=benchmark
```

### Property-Based Tests

We use [fast-check](https://github.com/dubzzz/fast-check) for property-based testing. Key properties verified:

1. **Round-trip parsing** — `parse(format(rule)) ≡ rule`
2. **Whitelist idempotency** — adding a domain twice results in one entry
3. **Exception priority** — allow rules override block rules for the same URL
4. **Safari limits** — output never exceeds 150,000 rules per extension
5. **Chrome limits** — dynamic rules never exceed 30,000

---

## Building

```bash
# Build all packages in dependency order
pnpm run build

# Type-check without emitting
pnpm run typecheck

# Lint all files
pnpm run lint

# Format all files
pnpm run format

# Package extensions into distributable archives (zip/xpi)
pnpm run package
```

Build output goes to `packages/<name>/dist/`.

---

## Testing the Extension Locally

### Chrome

1. Run `pnpm run build` (or `pnpm --filter @veil/chrome run build`)
2. Open `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `packages/chrome/` directory
6. The extension icon should appear in the toolbar

To reload after changes: click the refresh icon on the extension card, or use `Ctrl+R` on the extensions page.

### Firefox

1. Run `pnpm run build` (or `pnpm --filter @veil/firefox run build`)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on...**
4. Select `packages/firefox/manifest.json`
5. The extension icon should appear in the toolbar

To reload after changes: click **Reload** on the extension card in `about:debugging`.

### Safari

1. Run `pnpm run build` (or `pnpm --filter @veil/safari run build`)
2. Open the Xcode project in `apps/ios/`
3. Build and run the app target
4. Open Safari → Preferences → Extensions
5. Enable the Veil content blocker
6. For development, enable "Allow Unsigned Extensions" in Safari's Develop menu

---

## Adding New Scriptlets

Scriptlets are JavaScript snippets injected into pages to bypass anti-adblock mechanisms.

### Steps

1. Create a new file in `packages/core/src/scriptlets/`:
   ```
   packages/core/src/scriptlets/my-new-scriptlet.ts
   ```

2. Implement the scriptlet function:
   ```typescript
   /**
    * @scriptlet my-new-scriptlet
    * @description Brief description of what it does
    * @param arg1 Description of first argument
    * @param arg2 Description of second argument
    */
   export function myNewScriptlet(arg1: string, arg2?: string): string {
     return `(function() {
       // Scriptlet implementation
       // Must be a self-contained IIFE
     })();`;
   }
   ```

3. Register the scriptlet in `packages/core/src/scriptlets/index.ts`:
   ```typescript
   import { myNewScriptlet } from './my-new-scriptlet';

   export const SCRIPTLETS = {
     // ... existing scriptlets
     'my-new-scriptlet': myNewScriptlet,
   };
   ```

4. Add tests in `packages/core/src/scriptlets/my-new-scriptlet.test.ts`

5. Update the scriptlet count in documentation if applicable

### Guidelines

- Scriptlets must be self-contained (no external dependencies)
- Use IIFE pattern to avoid polluting the global scope
- Handle edge cases gracefully (missing properties, already-modified objects)
- Follow existing naming conventions (kebab-case for scriptlet names)
- Ensure compatibility with strict mode

---

## Adding New Filter List Modifiers

Modifiers control how filter rules are applied (e.g., `$third-party`, `$script`, `$redirect`).

### Steps

1. Define the modifier in `packages/core/src/rules/modifiers.ts`:
   ```typescript
   export const MODIFIERS = {
     // ... existing modifiers
     'my-modifier': {
       name: 'my-modifier',
       category: 'scope', // 'basic' | 'resource' | 'priority' | 'action' | 'scope' | 'page' | 'special'
       negatable: true,   // supports $~my-modifier
       assignable: false, // supports $my-modifier=value
     },
   };
   ```

2. Implement the matching logic in the parser (`packages/core/src/rules/parser.ts`):
   - Add parsing support in the modifier tokenizer
   - Add the modifier to the `ParsedRule` type if needed

3. Implement the evaluation logic in the engine (`packages/core/src/engine/blocking-engine.ts`):
   - Add the modifier check in the request matching pipeline

4. Add tests:
   - Parser test: verify the modifier is correctly parsed
   - Engine test: verify the modifier affects matching correctly
   - Property-based test: verify round-trip parsing

5. Update the modifier table in `README.md`

### Guidelines

- Follow the existing modifier pattern for consistency
- Ensure backward compatibility with ABP/uBO/AdGuard syntax
- Consider performance impact — modifiers are evaluated on every request
- Document any browser-specific behavior differences

---

## Code Style Guidelines

### General

- **TypeScript** strict mode (`strict: true` in tsconfig)
- **ESLint** + **Prettier** for formatting (run `pnpm run lint` and `pnpm run format`)
- Maximum line length: 100 characters (Prettier default)
- Use `const` by default, `let` only when reassignment is needed
- No `any` types — use `unknown` and narrow with type guards

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `blocking-engine.ts` |
| Classes | PascalCase | `BlockingEngine` |
| Functions | camelCase | `matchRequest()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RULES` |
| Interfaces | PascalCase (no I prefix) | `Rule`, `MatchResult` |
| Types | PascalCase | `RequestType` |
| Scriptlets | kebab-case | `abort-on-property-read` |

### File Organization

- One class/module per file
- Tests co-located with source: `parser.ts` → `parser.test.ts`
- Exports through `index.ts` barrel files
- Imports ordered: external → internal → relative

### Testing

- Minimum 80% coverage for `packages/core`
- Use descriptive test names: `it('should block third-party scripts when $third-party is set')`
- Use `fast-check` for property-based tests on parsers and engines
- Mock browser APIs in platform-specific tests

### Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation only
  - `test:` adding/updating tests
  - `refactor:` code change that neither fixes a bug nor adds a feature
  - `perf:` performance improvement
  - `chore:` build process or auxiliary tool changes

---

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following the code style guidelines above

3. **Ensure all checks pass**:
   ```bash
   pnpm test          # All 229+ tests pass
   pnpm run build     # Build succeeds
   pnpm run typecheck # No type errors
   pnpm run lint      # No lint errors
   ```

4. **Write/update tests** for any new or changed functionality

5. **Commit** with a conventional commit message:
   ```bash
   git commit -m "feat(core): add $permissions modifier support"
   ```

6. **Push** and open a Pull Request against `main`

7. **PR description** should include:
   - What the change does
   - Why it's needed
   - How to test it
   - Any breaking changes

8. **Review** — at least one approval is required before merging

9. **CI** must pass (tests, build, lint, typecheck)

### What We Look For in Reviews

- Correctness — does it work as intended?
- Performance — no regressions in hot paths (engine matching)
- Tests — adequate coverage for new code
- Compatibility — works across all supported browsers
- Documentation — updated if public API changes

---

## Questions?

Open an issue or start a discussion on GitHub. We're happy to help!
