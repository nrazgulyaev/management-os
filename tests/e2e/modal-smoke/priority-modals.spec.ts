/**
 * STAB-2 — Priority modal smoke tests.
 *
 * For each operator-facing "Add X" / "Create X" modal trigger,
 * verify the page loads, the trigger renders, clicking it opens
 * the modal, and no RSC render error / page-level error fires.
 *
 * Failure modes this catches that STAB-1's curl audit missed:
 *  - Modal mount triggers a lazy server-component import that
 *    crashes (e.g. bad SQL in a child server query).
 *  - Modal trigger button doesn't render at all (e.g. server
 *    error during parent render that the parent swallowed).
 *  - Modal opens but immediately throws on first paint (hydration
 *    mismatch, function-prop RSC error in nested child).
 *
 * Each case is independent; one failure does not block the others.
 */

import { test, expect, type Page } from "@playwright/test";

interface ModalCase {
  name: string;
  route: string;
  triggerTestId: string;
  /**
   * Modals don't all use [role="dialog"] — some use the
   * `data-testid="entity-modal"` attribute on a native <dialog>.
   * Default to that.
   */
  modalSelector?: string;
}

const MODALS: ModalCase[] = [
  {
    name: "Add bank account",
    route: "/development-os/finance/bank-accounts",
    triggerTestId: "bank-account-add-trigger",
  },
  {
    name: "Add cost category",
    route: "/development-os/finance/categories",
    triggerTestId: "cost-category-add-trigger",
  },
  {
    name: "Add vendor",
    route: "/development-os/vendors",
    triggerTestId: "vendor-add-trigger",
  },
  {
    name: "Add lead",
    route: "/development-os/sales",
    triggerTestId: "lead-add-trigger",
  },
  {
    name: "Add lead source",
    route: "/development-os/marketing/lead-sources",
    triggerTestId: "lead-source-add-trigger",
  },
  {
    name: "Add buyer",
    route: "/development-os/buyers",
    triggerTestId: "buyer-add-trigger",
  },
  {
    name: "Create reservation",
    route: "/development-os/reservations",
    triggerTestId: "reservation-create-trigger",
  },
  {
    name: "Add investor",
    route: "/development-os/investors",
    triggerTestId: "investor-add-trigger",
  },
  {
    name: "Create material PO",
    route: "/development-os/materials",
    triggerTestId: "material-po-create-trigger",
  },
];

function attachErrorCapture(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const text = m.text();
      // Filter out 3rd-party noise that's irrelevant to RSC bugs:
      //  - "Failed to load resource" for missing favicons etc.
      //  - Recharts container-size warnings (not actionable, not crashes)
      if (text.includes("Failed to load resource")) return;
      if (text.includes("width(") && text.includes("chart")) return;
      errors.push(`console.error: ${text}`);
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 500) {
      errors.push(`HTTP ${r.status()} on ${r.url()}`);
    }
  });
  return { errors };
}

for (const m of MODALS) {
  test(`${m.name} — opens cleanly on ${m.route}`, async ({ page }) => {
    const { errors } = attachErrorCapture(page);

    await page.goto(m.route, { waitUntil: "domcontentloaded" });
    // Page-level render error visible in the DOM
    await expect(
      page.locator("text=Application error: a server-side exception"),
    ).toHaveCount(0);

    // Some pages render the same trigger in two slots (header
    // actions + section addAction) — that's a pre-existing UX
    // duplication on /development-os/marketing/lead-sources and
    // is out of STAB-2's "only fix the crash" scope. Click the
    // first match; we just need to verify the modal opens, not
    // adjudicate which trigger is canonical.
    const trigger = page.getByTestId(m.triggerTestId).first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    const modal = page
      .getByTestId("entity-modal")
      .or(page.locator('[role="dialog"]'))
      .first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // After mount, give React a tick to settle and surface any
    // mount-time error.
    await page.waitForTimeout(300);

    expect(
      errors,
      `Errors fired while opening "${m.name}" on ${m.route}:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
}
