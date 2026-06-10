import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, type VisualPersona } from "./cabinet-personas";

/**
 * Cabinet visual regression — the key redesigned authenticated screens
 * at desktop 1366 (`cabinet-desktop`) and mobile 390 (`cabinet-mobile`)
 * viewports, configured in playwright.visual.config.ts.
 *
 * Auth: real sessions minted by cabinets.setup.ts (a dependency
 * project) and consumed as storage states — one per persona. Personas
 * without credentials in the env SKIP; sessions are never faked.
 *
 * Baselines live in `cabinets.spec.ts-snapshots/` and are generated
 * LOCALLY against a seeded prod server (`npm run
 * test:visual:cabinets:update`) — never in CI or an agent sandbox.
 * See README.md for the runbook + the seed scripts each screen needs.
 *
 * Volatile regions (relative timestamps, live dates) are masked via
 * MASKED_SELECTORS; the bookings calendar window is pinned with
 * `?range=month&start=` so the grid doesn't churn when the real month
 * rolls over.
 */

/** Masked on every screen — volatile by definition. */
const MASKED_SELECTORS = [
  // Relative / live timestamps ("2 minutes ago", header clocks).
  "time",
  // Opt-in hatch: any component can mark itself volatile.
  "[data-visual-volatile]",
];

interface CabinetScreen {
  /** Baseline file stem → cabinets.spec.ts-snapshots/<name>-<project>.png */
  name: string;
  path: string;
  /**
   * Defaults to a full-page capture. Set false for screens whose
   * height legitimately varies with live data volume (we still pin
   * the above-the-fold layout).
   */
  fullPage?: boolean;
  /** Extra masked selectors for this screen only. */
  extraMasks?: string[];
}

interface CabinetSuite {
  title: string;
  persona: VisualPersona;
  screens: CabinetScreen[];
}

const SUITES: CabinetSuite[] = [
  {
    title: "Management OS",
    persona: PERSONAS.admin,
    screens: [
      { name: "mgmt-dashboard", path: "/dashboard" },
      { name: "mgmt-owners", path: "/dashboard/owners" },
      { name: "mgmt-owner-intelligence", path: "/dashboard/owner-intelligence" },
      {
        name: "mgmt-bookings-calendar",
        // Pinned window — BOOKINGS-CAL-PARITY-1 made the calendar
        // searchParams-driven, so a fixed anchor keeps the grid
        // deterministic across run dates.
        path: "/dashboard/bookings/calendar?range=month&start=2026-06-01",
        fullPage: false,
      },
      { name: "mgmt-finance-statements", path: "/dashboard/finance/statements" },
      { name: "mgmt-operations", path: "/dashboard/operations" },
    ],
  },
  {
    title: "Development OS",
    persona: PERSONAS.admin,
    screens: [
      { name: "dev-home", path: "/development-os" },
      { name: "dev-executive", path: "/development-os/executive" },
      { name: "dev-general-ledger", path: "/development-os/finance/general-ledger" },
      { name: "dev-coordination", path: "/development-os/coordination" },
      { name: "dev-projects", path: "/development-os/projects" },
    ],
  },
  {
    title: "Owner portal",
    persona: PERSONAS.owner,
    screens: [{ name: "owner-home", path: "/owner" }],
  },
  {
    title: "Investor portal",
    persona: PERSONAS.investor,
    screens: [{ name: "investor-dashboard", path: "/investor-portal/dashboard" }],
  },
  {
    title: "Platform OS",
    persona: PERSONAS.admin,
    screens: [
      { name: "platform-home", path: "/platform" },
      { name: "platform-agents", path: "/platform/agents" },
    ],
  },
];

/**
 * Flush the Task-9 motion layer: scroll to the bottom so every
 * IntersectionObserver reveal + count-up fires, let them settle, then
 * return to the top. Without this, full-page captures stitch frames
 * mid-reveal and the baseline is nondeterministic.
 */
async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
}

for (const suite of SUITES) {
  test.describe(suite.title, () => {
    // Annotation-level skip: fixtures (including storageState) are
    // never initialised for skipped tests, so the missing state file
    // is harmless.
    test.skip(
      !suite.persona.ready,
      `Set ${suite.persona.emailVar} + ${suite.persona.passwordVar} (${suite.persona.description}). See tests/visual/README.md.`,
    );

    // The setup project has already written the state file when the
    // persona is ready (project dependency). The inline empty state is
    // only the fallback for the skipped case above.
    test.use({
      storageState: fs.existsSync(suite.persona.stateFile)
        ? suite.persona.stateFile
        : { cookies: [], origins: [] },
    });

    for (const screen of suite.screens) {
      test(`cabinet: ${screen.name}`, async ({ page }) => {
        await page.goto(screen.path, { waitUntil: "domcontentloaded" });
        // Authenticated dashboards may keep polling — don't hard-fail
        // on networkidle, just give data fetches a window to land.
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        // Bounce guard: the layouts redirect under-privileged sessions
        // (e.g. /owner → /dashboard, /platform → /login). Screenshotting
        // the redirect target would silently poison the baseline.
        const expectedPath = screen.path.split("?")[0];
        const landedPath = new URL(page.url()).pathname;
        expect(
          landedPath === expectedPath || landedPath.startsWith(`${expectedPath}/`),
          `Expected to land on ${expectedPath} but got ${landedPath} — the ${suite.persona.key} account lacks access (check its role/grants, see README).`,
        ).toBe(true);

        await settleMotion(page);

        const masks = [...MASKED_SELECTORS, ...(screen.extraMasks ?? [])].map(
          (selector) => page.locator(selector),
        );

        await expect(page).toHaveScreenshot(`${screen.name}.png`, {
          fullPage: screen.fullPage ?? true,
          animations: "disabled",
          mask: masks,
        });
      });
    }
  });
}
