/**
 * TENANT-1 — Multi-tenant isolation suite.
 *
 * Skipped unless both PLAYWRIGHT_TENANT_A_EMAIL/PASSWORD and
 * PLAYWRIGHT_TENANT_B_EMAIL/PASSWORD are set. See ./README.md for
 * the seed-data setup.
 *
 * Pattern per entity: tenant A creates a tagged row → tenant B's
 * list page must not show it. If it does, the corresponding server
 * action or list query still has a tenancy hole.
 */

import { test, expect, type Page } from "@playwright/test";

const TENANT_A_EMAIL = process.env.PLAYWRIGHT_TENANT_A_EMAIL ?? "";
const TENANT_A_PASSWORD = process.env.PLAYWRIGHT_TENANT_A_PASSWORD ?? "";
const TENANT_B_EMAIL = process.env.PLAYWRIGHT_TENANT_B_EMAIL ?? "";
const TENANT_B_PASSWORD = process.env.PLAYWRIGHT_TENANT_B_PASSWORD ?? "";

const FIXTURE_READY =
  Boolean(TENANT_A_EMAIL && TENANT_A_PASSWORD) &&
  Boolean(TENANT_B_EMAIL && TENANT_B_PASSWORD);

test.skip(
  !FIXTURE_READY,
  "Skipping multi-tenant isolation suite — set PLAYWRIGHT_TENANT_A_* and PLAYWRIGHT_TENANT_B_* env vars and seed two tenants. See tests/e2e/multi-tenant/README.md.",
);

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 10_000,
  });
}

async function signOut(page: Page): Promise<void> {
  // The signout endpoint clears the session cookie. Hit it directly so
  // we don't depend on a UI selector that may shift between cabinets.
  await page.goto("/api/auth/signout", { waitUntil: "domcontentloaded" });
}

interface IsolationCase {
  name: string;
  /** Where tenant A creates the row. */
  createRoute: string;
  /** Test-id of the modal trigger on the create route. */
  triggerTestId: string;
  /** Fill the form fields with the given unique marker. */
  fillForm: (page: Page, marker: string) => Promise<void>;
  /** Submit-button text (case-insensitive substring match). */
  submitLabel: string;
  /** Where tenant B lists the entity. */
  listRoute: string;
}

const CASES: IsolationCase[] = [
  {
    name: "Bank account",
    createRoute: "/development-os/finance/bank-accounts",
    triggerTestId: "bank-account-add-trigger",
    submitLabel: "Add bank account",
    listRoute: "/development-os/finance/bank-accounts",
    fillForm: async (page, marker) => {
      await page.locator('input[name="accountCode"]').fill(marker);
      await page.locator('input[name="accountName"]').fill(`${marker} Account`);
      await page.locator('select[name="accountType"]').selectOption("bank");
      await page.locator('select[name="currency"]').selectOption("USD");
    },
  },
  {
    name: "Cost category",
    createRoute: "/development-os/finance/categories",
    triggerTestId: "cost-category-add-trigger",
    submitLabel: "Add cost category",
    listRoute: "/development-os/finance/categories",
    fillForm: async (page, marker) => {
      await page.locator('input[name="categoryCode"]').fill(marker);
      await page.locator('input[name="displayName"]').fill(`${marker} Cat`);
      await page.locator('select[name="categoryType"]').selectOption("opex");
    },
  },
  // Add more cases here as TENANT-1 closes them out. Pattern is the
  // same: tenant A creates, tenant B asserts non-visibility.
];

for (const c of CASES) {
  test(`${c.name}: tenant B cannot see tenant A's row`, async ({ page }) => {
    const marker = `T1_${Date.now()}_${Math.floor(Math.random() * 9999)}`.toUpperCase();

    // --- As tenant A: create the row
    await signIn(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    await page.goto(c.createRoute, { waitUntil: "domcontentloaded" });
    await page.getByTestId(c.triggerTestId).first().click();
    await expect(
      page.getByTestId("entity-modal").first(),
    ).toBeVisible({ timeout: 5_000 });
    await c.fillForm(page, marker);
    await page
      .locator(`button:has-text("${c.submitLabel}")`)
      .last()
      .click();
    // Give the server action ~2s to complete.
    await page.waitForTimeout(2_000);
    await signOut(page);

    // --- As tenant B: list and assert non-visibility
    await signIn(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
    await page.goto(c.listRoute, { waitUntil: "domcontentloaded" });
    // Page text must not contain the unique marker from tenant A.
    const body = await page.locator("body").innerText();
    expect(
      body.includes(marker),
      `Tenant B sees Tenant A's ${c.name} marker (${marker}) on ${c.listRoute} — cross-tenant leak.`,
    ).toBe(false);
    await signOut(page);
  });
}
