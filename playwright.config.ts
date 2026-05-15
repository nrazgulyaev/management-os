import { defineConfig, devices } from "@playwright/test";

/**
 * STAB-2 — Playwright config for the modal smoke suite.
 *
 * Target: a prod-mode server running on :3101. The suite is
 * intentionally small (priority modals only); failure surface is
 * RSC render crash, not full UI coverage.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3101",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
