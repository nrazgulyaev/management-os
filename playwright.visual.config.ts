import { defineConfig } from "@playwright/test";

/**
 * Task 10 — visual regression for public landing pages.
 *
 * Screenshots each public landing at desktop / tablet / mobile widths
 * (1280 / 768 / 390) and compares to committed baselines under
 * `tests/visual/public-landings.spec.ts-snapshots/`.
 *
 * Baselines are environment-specific (font rendering), so they are NOT
 * generated in the agent sandbox (the prod build needs network for
 * `next/font`). Generate / refresh them against a running prod server:
 *
 *   PORT=3101 npm run build && PORT=3101 npm start &     # or `npm run dev`
 *   PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:update
 *
 * Then run the comparison in CI / locally with:
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual
 */
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Allow a tiny amount of antialiasing noise; fail on real layout drift.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3101",
    headless: true,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
