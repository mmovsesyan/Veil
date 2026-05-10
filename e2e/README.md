# E2E Tests

End-to-end tests using Playwright to verify the extension works on real websites.

## Setup

```bash
# Install Playwright (from project root)
pnpm add -D @playwright/test
npx playwright install chromium
```

## Running

```bash
npx playwright test
```

## Test Scenarios

1. **Ad blocking** — Load a page with known ads, verify they're blocked
2. **Cosmetic filtering** — Verify ad elements are hidden via CSS
3. **Whitelist** — Verify whitelisted domains are not blocked
4. **Anti-adblock bypass** — Verify scriptlets neutralize detection
5. **Social widget placeholders** — Verify widgets are replaced with placeholders
6. **Performance** — Verify page load time is not degraded

## Notes

- Tests require a built extension (`pnpm run build` first)
- Chrome tests use `--load-extension` flag
- Firefox tests use `web-ext` temporary addon loading
- Tests run against local test pages (no external network dependency)
