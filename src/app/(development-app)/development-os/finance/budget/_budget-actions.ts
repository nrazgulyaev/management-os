"use server";

/**
 * Budget-line form surface — `"use server"` adapter for the client
 * `_budget-line-form.tsx` island. The underlying `createBudgetLine`
 * lives in the `server-only` `budget-actions.ts` (which org-gates via the
 * project, supersedes the prior line, and increments budget_version). A
 * `"use client"` component cannot import a `server-only` module directly,
 * so this thin RPC boundary parses the FormData, calls through, and
 * revalidates the budget surfaces.
 *
 * Money is entered in MAJOR USD on the form and converted to BIGINT minor
 * units (cents) here before hitting the action. Tenancy is enforced inside
 * createBudgetLine (requireOrgId + project-ownership check) — we never pass
 * a client-supplied organizationId.
 */

import { revalidatePath } from "next/cache";
import { requireInternalUser } from "@/features/auth/permissions";
import { createBudgetLine } from "@/lib/development/server/budget-actions";

export type BudgetLineFormResult = { ok: true } | { ok: false; error: string };

function fail(error: string): BudgetLineFormResult {
  return { ok: false, error };
}

export async function saveBudgetLineAction(
  formData: FormData,
): Promise<BudgetLineFormResult> {
  try {
    await requireInternalUser();

    const projectId = String(formData.get("projectId") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const amountMajorRaw = String(formData.get("amountMajor") ?? "").trim();
    const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!projectId) return fail("Pick a project.");
    if (!categoryId) return fail("Pick a cost category.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return fail("Effective-from must be a valid date.");
    }
    const amountMajor = Number(amountMajorRaw);
    if (!Number.isFinite(amountMajor) || amountMajor < 0) {
      return fail("Budgeted amount must be a non-negative number.");
    }
    // USD majors → minor (cents). Round to avoid float drift.
    const budgetedAmountUsdMinor = BigInt(Math.round(amountMajor * 100));

    await createBudgetLine({
      projectId,
      categoryId,
      budgetedAmountUsdMinor,
      budgetedAtCurrency: "USD",
      effectiveFrom,
      notes: notes.length > 0 ? notes : null,
    });

    revalidatePath("/development-os/finance/budget");
    revalidatePath(`/development-os/finance/budget/${projectId}`);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not save budget line.");
  }
}
