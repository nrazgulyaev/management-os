import { test, expect } from "@playwright/test";

/**
 * Task 10 — public landing visual regression.
 *
 * One full-page screenshot per landing per viewport project
 * (desktop / tablet / mobile, configured in playwright.visual.config.ts).
 * Baselines live in `public-landings.spec.ts-snapshots/` and are generated
 * with `npm run test:visual:update` against a running prod server.
 */

const LANDINGS: { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "products-management-os", path: "/products/management-os" },
  { name: "products-development-os", path: "/products/development-os" },
  { name: "features-management-os", path: "/features/management-os" },
  { name: "features-development-os", path: "/features/development-os" },
  { name: "pricing", path: "/pricing" },
  { name: "operations", path: "/operations" },
  { name: "guest-experience", path: "/guest-experience" },
  { name: "investor-reporting", path: "/investor-reporting" },
  { name: "portfolio", path: "/portfolio" },
  { name: "case-studies", path: "/case-studies" },
  { name: "contact", path: "/contact" },
];

for (const { name, path } of LANDINGS) {
  test(`landing: ${name}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    // Let the Task-9 motion layer settle (reveal / parallax / count-up) so the
    // snapshot is of the resting state, not mid-animation.
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}
