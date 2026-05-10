/**
 * Playwright E2E configuration for browser extension testing.
 */

import { defineConfig } from "@playwright/test";
import { resolve } from "path";

const EXTENSION_PATH = resolve(__dirname, "../packages/chrome");

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 1,
  use: {
    headless: false, // Extensions require headed mode
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chrome-extension",
      use: {
        browserName: "chromium",
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            "--no-first-run",
            "--disable-default-apps",
          ],
        },
      },
    },
  ],
});
