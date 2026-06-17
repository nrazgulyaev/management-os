"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contractMilestones } from "@/lib/db/schema/sales";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import { requireOrgId } from "@/features/auth/require-org";
import { advanceGroupToInPayment } from "./contract-payment-state";

const triggerSchema = z.object({ milestoneId: z.string().uuid() });

export async function triggerMilestonePreInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = triggerSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const now = new Date();
  await db
    .update(contractMilestones)
    .set({ status: "pre_invoiced", preInvoicedAt: now, updatedAt: now })
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    );
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
  return { ok: true };
}

export async function triggerMilestoneInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = triggerSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const now = new Date();
  await db
    .update(contractMilestones)
    .set({ status: "invoiced", invoicedAt: now, updatedAt: now })
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    );
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
  return { ok: true };
}

const recordPaymentSchema = z.object({
  milestoneId: z.string().uuid(),
  amountUsdMinor: z.coerce.bigint().positive(),
  fxRateUsdToIdr: z.coerce.number().positive(),
  reference: z.string().max(200).optional(),
});

/**
 * Records a payment against a milestone. Updates `paid_amount_usd_minor`
 * cumulatively. If cumulative >= expected, marks `paid` and sets `paid_at`.
 * Otherwise marks `partially_paid`.
 */
export async function recordMilestonePayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; nowPaid?: boolean }> {
  const parsed = recordPaymentSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
    amountUsdMinor: formData.get("amountUsdMinor"),
    fxRateUsdToIdr: formData.get("fxRateUsdToIdr"),
    reference: formData.get("reference") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();

  const [milestone] = await db
    .select()
    .from(contractMilestones)
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!milestone) return { ok: false, error: "Milestone not found." };

  const newPaid = milestone.paidAmountUsdMinor + parsed.data.amountUsdMinor;
  const fullyPaid = newPaid >= milestone.expectedAmountUsdMinor;
  const now = new Date();
  await db
    .update(contractMilestones)
    .set({
      paidAmountUsdMinor: newPaid,
      status: fullyPaid ? "paid" : "partially_paid",
      paidAt: fullyPaid ? now : milestone.paidAt,
      notes: parsed.data.reference
        ? `${milestone.notes ?? ""}\nPayment ref: ${parsed.data.reference}`.trim()
        : milestone.notes,
      updatedAt: now,
    })
    .where(
      and(
        eq(contractMilestones.id, milestone.id),
        eq(contractMilestones.organizationId, organizationId),
      ),
    );

  // Cash is now flowing — move the group into the `in_payment` collection
  // phase (no-op if already past fully_signed). This makes the AJB / complete
  // control reachable once every milestone is settled.
  await advanceGroupToInPayment(db, milestone.contractGroupId, organizationId);

  // Suppress unused-var warning for fxRate (kept for future ledger integration).
  void parsed.data.fxRateUsdToIdr;

  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
  return { ok: true, nowPaid: fullyPaid };
}

export async function markMilestoneOverdue(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = triggerSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const now = new Date();
  await db
    .update(contractMilestones)
    .set({ status: "overdue", overdueAt: now, updatedAt: now })
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    );
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  return { ok: true };
}

const waiveSchema = z.object({
  milestoneId: z.string().uuid(),
  reason: z.string().min(2).max(500),
});

export async function waiveMilestone(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = waiveSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const now = new Date();
  await db
    .update(contractMilestones)
    .set({
      status: "waived",
      notes: `Waived: ${parsed.data.reason}`,
      updatedAt: now,
    })
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    );
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  return { ok: true };
}
