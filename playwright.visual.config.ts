import { defineConfig } from "@playwright/test";

/**
 * Visual regression — two suites, one config.
 *
 * 1. Public landings (Task 10) — `tests/visual/public-landings.spec.ts`
 *    at desktop / tablet / mobile widths (1280 / 768 / 390). Projects:
 *    `desktop`, `tablet`, `mobile`.
 *
 * 2. Cabinets — `tests/visual/cabinets.spec.ts`, the key redesigned
 *    authenticated screens (Mgmt OS, Dev OS, owner + investor portals,
 *    Platform OS) at desktop 1366 and mobile 390. Projects:
 *    `cabinet-desktop`, `cabinet-mobile`, both depending on
 *    `cabinet-auth` (tests/visual/cabinets.setup.ts) which signs the
 *    personas in via the real /login form and saves storage states
 *    under tests/visual/.auth/ (gitignored). Personas without
 *    PLAYWRIGHT_VISUAL_* credentials skip — sessions are never faked.
 *
 * Baselines are environment-specific (font rendering), so they are NOT
 * generated in the agent sandbox (the prod build needs network for
 * `next/font`). Generate / refresh them against a running prod server:
 *
 *   PORT=3101 npm run build && PORT=3101 npm start &     # or `npm run dev`
 *   PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:update
 *   # cabinets only (needs PLAYWRIGHT_VISUAL_* creds + seeded data):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:cabinets:update
 *
 * Then run the comparison in CI / locally with:
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual
 *
 * Full runbook: tests/visual/README.md.
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
    // ---- Suite 1: public landings (unauthenticated) ----
    {
      name: "desktop",
      testMatch: /public-landings\.spec\.ts$/,
      use: { viewport: { width: 1280, height: 900 } },
    },
    {
      name: "tablet",
      testMatch: /public-landings\.spec\.ts$/,
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      testMatch: /public-landings\.spec\.ts$/,
      use: { viewport: { width: 390, height: 844 } },
    },

    // ---- Suite 2: cabinets (authenticated) ----
    {
      name: "cabinet-auth",
      testMatch: /cabinets\.setup\.ts$/,
    },
    {
      name: "cabinet-desktop",
      testMatch: /cabinets\.spec\.ts$/,
      dependencies: ["cabinet-auth"],
      use: { viewport: { width: 1366, height: 900 } },
    },
    {
      name: "cabinet-mobile",
      testMatch: /cabinets\.spec\.ts$/,
      dependencies: ["cabinet-auth"],
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
});
