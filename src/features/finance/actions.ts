"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  expenseLines,
  feeLines,
  managementFeeRules,
  ownerStatements,
  payoutBatches,
  payoutLines,
  reserveMovements,
  revenueLines,
  statementPeriods,
  taxLines,
} from "@/lib/db/schema/finance";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity, requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { assertPeriodOpen } from "./validation";
import {
  feeLineSchema,
  expenseLineSchema,
  taxLineSchema,
  reserveMovementSchema,
  managementFeeRuleSchema,
  payoutBatchSchema,
  payoutLineSchema,
  revenueLineSchema,
  statementPeriodSchema,
  generateStatementSchema,
} from "./schema";
import { generateOwnerStatement } from "./statement-generator";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();
const nullable = (v: string | undefined) => (v && v !== "" ? v : null);

async function ensureFinanceWrite() {
  await requirePermission("finance.write");
}

// -----------------------------------------------------------------------------
// State-machine guards (WRITE-FLOW-AUDIT). Keep illegal transitions out of
// the money-moving lifecycles. `null`-valued targets are terminal.
// -----------------------------------------------------------------------------
const STATEMENT_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["issued", "voided"],
  issued: ["approved", "voided"],
  approved: ["paid", "voided"],
  paid: ["voided"],
  voided: [],
};

const PAYOUT_LINE_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["approved", "cancelled"],
  approved: ["paid", "failed", "cancelled"],
  failed: ["approved", "cancelled"],
  paid: [],
  cancelled: [],
};

function isAllowedTransition(
  table: Record<string, readonly string[]>,
  from: string,
  to: string,
): boolean {
  if (from === to) return true; // idempotent re-apply is a no-op, not an attack
  return (table[from] ?? []).includes(to);
}

// -----------------------------------------------------------------------------
// Revenue
// -----------------------------------------------------------------------------
export async function createRevenueLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = revenueLineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  await assertPeriodOpen(db, d.serviceDate);
  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(revenueLines)
    .values({
      bookingId: nullable(d.bookingId),
      villaId: nullable(d.villaId),
      projectId: nullable(d.projectId),
      ownerId: nullable(d.ownerId),
      revenueType: d.revenueType,
      description: d.description,
      amountMinor: d.amountMinor,
      currency: d.currency,
      serviceDate: d.serviceDate,
      source: d.source,
      visibility: d.visibility,
      status: d.status,
      createdBy: me?.id ?? null,
    })
    .returning({ id: revenueLines.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.revenue.create",
    entityType: "revenue_line",
    entityId: row.id,
    after: { ...d, amountMinor: d.amountMinor.toString() },
  });
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/revenue");
  redirect("/dashboard/finance/revenue");
}

// -----------------------------------------------------------------------------
// Fees
// -----------------------------------------------------------------------------
export async function createFeeLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = feeLineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  await assertPeriodOpen(db, d.feeDate);
  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(feeLines)
    .values({
      bookingId: nullable(d.bookingId),
      villaId: nullable(d.villaId),
      projectId: nullable(d.projectId),
      feeType: d.feeType,
      description: d.description,
      amountMinor: d.amountMinor,
      currency: d.currency,
      feeDate: d.feeDate,
      source: d.source,
      status: d.status,
      createdBy: me?.id ?? null,
    })
    .returning({ id: feeLines.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.fee.create",
    entityType: "fee_line",
    entityId: row.id,
    after: { ...d, amountMinor: d.amountMinor.toString() },
  });
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/fees");
  redirect("/dashboard/finance/fees");
}

// -----------------------------------------------------------------------------
// Expenses
// -----------------------------------------------------------------------------
export async function createExpenseLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = expenseLineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  await assertPeriodOpen(db, d.expenseDate);
  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(expenseLines)
    .values({
      villaId: nullable(d.villaId),
      projectId: nullable(d.projectId),
      bookingId: nullable(d.bookingId),
      expenseType: d.expenseType,
      description: d.description,
      amountMinor: d.amountMinor,
      currency: d.currency,
      expenseDate: d.expenseDate,
      allocationScope: d.allocationScope,
      capitalized: d.capitalized,
      ownerChargeable: d.ownerChargeable,
      status: d.status,
      createdBy: me?.id ?? null,
    })
    .returning({ id: expenseLines.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.expense.create",
    entityType: "expense_line",
    entityId: row.id,
    after: { ...d, amountMinor: d.amountMinor.toString() },
  });
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/expenses");
  redirect("/dashboard/finance/expenses");
}

// -----------------------------------------------------------------------------
// Taxes
// -----------------------------------------------------------------------------
export async function createTaxLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = taxLineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  await assertPeriodOpen(db, d.taxDate);
  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(taxLines)
    .values({
      villaId: nullable(d.villaId),
      projectId: nullable(d.projectId),
      bookingId: nullable(d.bookingId),
      taxType: d.taxType,
      description: d.description,
      amountMinor: d.amountMinor,
      currency: d.currency,
      taxDate: d.taxDate,
      ownerVisible: d.ownerVisible,
      status: d.status,
      createdBy: me?.id ?? null,
    })
    .returning({ id: taxLines.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.tax.create",
    entityType: "tax_line",
    entityId: row.id,
    after: { ...d, amountMinor: d.amountMinor.toString() },
  });
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/taxes");
  redirect("/dashboard/finance/taxes");
}

// -----------------------------------------------------------------------------
// Reserves
// -----------------------------------------------------------------------------
export async function createReserveMovementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = reserveMovementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  await assertPeriodOpen(db, d.movementDate);
  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(reserveMovements)
    .values({
      villaId: nullable(d.villaId),
      projectId: nullable(d.projectId),
      ownerId: nullable(d.ownerId),
      reserveType: d.reserveType,
      movementType: d.movementType,
      description: d.description,
      amountMinor: d.amountMinor,
      currency: d.currency,
      movementDate: d.movementDate,
      status: d.status,
      createdBy: me?.id ?? null,
    })
    .returning({ id: reserveMovements.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.reserve.create",
    entityType: "reserve_movement",
    entityId: row.id,
    after: { ...d, amountMinor: d.amountMinor.toString() },
  });
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/reserves");
  redirect("/dashboard/finance/reserves");
}

// -----------------------------------------------------------------------------
// Management fee rule
// -----------------------------------------------------------------------------
export async function createManagementFeeRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = managementFeeRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  await db.insert(managementFeeRules).values({
    projectId: nullable(d.projectId),
    villaId: nullable(d.villaId),
    ruleName: d.ruleName,
    feeModel: d.feeModel,
    feePercent: d.feePercent !== undefined ? String(d.feePercent) : null,
    fixedAmountMinor: d.fixedAmountMinor ?? null,
    currency: d.currency ?? null,
    startsOn: d.startsOn,
    endsOn: nullable(d.endsOn),
    status: d.status,
  });
  revalidatePath("/dashboard/finance");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Statement periods
// -----------------------------------------------------------------------------
export async function createStatementPeriodAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensureFinanceWrite();
  const parsed = statementPeriodSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  try {
    const [row] = await db
      .insert(statementPeriods)
      .values({
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        label: parsed.data.label,
        status: "open",
      })
      .returning({ id: statementPeriods.id });
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "finance.period.create",
      entityType: "statement_period",
      entityId: row.id,
      after: parsed.data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return { ok: false, error: msg.includes("unique") ? "A period with these dates already exists." : msg };
  }
  revalidatePath("/dashboard/finance/periods");
  redirect("/dashboard/finance/periods");
}

const statusUpdateSchema = z.object({
  id: z.string().uuid(),
  next: z.enum(["open", "closing", "closed", "locked"]),
});

export async function setPeriodStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.close_period");
  const parsed = statusUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [before] = await db
    .select()
    .from(statementPeriods)
    .where(eq(statementPeriods.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Period not found." };
  const updates: Record<string, unknown> = { status: parsed.data.next };
  if (parsed.data.next === "closed") {
    updates.closedAt = new Date();
    updates.closedBy = me?.id ?? null;
  }
  if (parsed.data.next === "locked") {
    updates.lockedAt = new Date();
  }
  await db.update(statementPeriods).set(updates).where(eq(statementPeriods.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `finance.period.${parsed.data.next}`,
    entityType: "statement_period",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.next },
  });
  revalidatePath("/dashboard/finance/periods");
  revalidatePath(`/dashboard/finance/periods/${parsed.data.id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Statement generation / lifecycle
// -----------------------------------------------------------------------------
export async function generateOwnerStatementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.issue_statement");
  const parsed = generateStatementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const me = await getCurrentAppUser();
  // TENANCY (write-flow audit): stamp the caller's org so the lifecycle
  // actions (which org-filter their lookup) can find the new statement.
  // Without this the statement is born org-less and Issue/Approve/Mark-paid
  // all return "Statement not found".
  const organizationId = await requireOrgId();
  const result = await generateOwnerStatement({
    ownerId: parsed.data.ownerId,
    periodId: parsed.data.periodId,
    villaId: parsed.data.villaId === "" ? undefined : parsed.data.villaId,
    projectId: parsed.data.projectId === "" ? undefined : parsed.data.projectId,
    currency: parsed.data.currency,
    actorUserId: me?.id ?? null,
    organizationId,
  });
  if (!result.ok) {
    const map: Record<string, string> = {
      db_missing: "Database is not configured.",
      period_not_found: "Statement period not found.",
      owner_not_found: "Owner not found.",
      no_active_shares: "Owner has no active shares in that period.",
      no_shares_in_scope: "No shares match the chosen villa/project scope.",
      statement_issued_already_exists: "An issued statement already exists. Void it before regenerating.",
      statement_approved_already_exists: "An approved statement already exists. Void it before regenerating.",
      statement_paid_already_exists: "A paid statement already exists. Void it before regenerating.",
    };
    return { ok: false, error: map[result.reason] ?? result.reason };
  }
  revalidatePath("/dashboard/finance/statements");
  revalidatePath(`/dashboard/finance/statements/${result.statementId}`);
  redirect(`/dashboard/finance/statements/${result.statementId}`);
}

const statementLifecycleSchema = z.object({
  id: z.string().uuid(),
  next: z.enum(["draft", "issued", "approved", "paid", "voided"]),
});

export async function setStatementStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.issue_statement");
  const parsed = statementLifecycleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // WRITE-FLOW-AUDIT: org-scoped load kills the cross-tenant IDOR — a
  // foreign statement id will not be found and cannot be mutated.
  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(ownerStatements)
    .where(
      and(
        eq(ownerStatements.id, parsed.data.id),
        eq(ownerStatements.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Statement not found." };
  // State-machine guard: refuse illegal lifecycle jumps (e.g. paid → draft).
  if (!isAllowedTransition(STATEMENT_TRANSITIONS, before.status, parsed.data.next)) {
    return {
      ok: false,
      error: `Cannot move statement from "${before.status}" to "${parsed.data.next}".`,
    };
  }
  const updates: Record<string, unknown> = { status: parsed.data.next };
  if (parsed.data.next === "issued") updates.issuedAt = new Date();
  if (parsed.data.next === "approved") updates.approvedAt = new Date();
  await db
    .update(ownerStatements)
    .set(updates)
    .where(
      and(
        eq(ownerStatements.id, parsed.data.id),
        eq(ownerStatements.organizationId, organizationId),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `owner_statement.${parsed.data.next}`,
    entityType: "owner_statement",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.next },
  });
  revalidatePath("/dashboard/finance/statements");
  revalidatePath(`/dashboard/finance/statements/${parsed.data.id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Payouts
// -----------------------------------------------------------------------------
export async function createPayoutBatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.approve_payout");
  const parsed = payoutBatchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // WRITE-FLOW-AUDIT: stamp the caller's org so the batch is tenant-scoped.
  const organizationId = await requireOrgId();
  try {
    const [row] = await db
      .insert(payoutBatches)
      .values({
        batchCode: parsed.data.batchCode,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        currency: parsed.data.currency,
        status: "draft",
        createdBy: me?.id ?? null,
        organizationId,
      })
      .returning({ id: payoutBatches.id });
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "finance.payout_batch.create",
      entityType: "payout_batch",
      entityId: row.id,
      after: parsed.data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return { ok: false, error: msg.includes("unique") ? "Batch code already in use." : msg };
  }
  revalidatePath("/dashboard/finance/payouts");
  redirect("/dashboard/finance/payouts");
}

export async function createPayoutLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.approve_payout");
  const parsed = payoutLineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;
  // WRITE-FLOW-AUDIT: tenant scope for the new line + parent-chain
  // ownership checks so a foreign batch/statement id cannot be attached.
  const organizationId = await requireOrgId();
  const batchId = nullable(d.payoutBatchId);
  if (batchId) {
    const [batch] = await db
      .select({ id: payoutBatches.id })
      .from(payoutBatches)
      .where(and(eq(payoutBatches.id, batchId), eq(payoutBatches.organizationId, organizationId)))
      .limit(1);
    if (!batch) return { ok: false, error: "Payout batch not found." };
  }
  // FC-OWNER-STATEMENTS §4.4 — payout is PAUSED while a statement is disputed.
  // A disputed statement can't have funds released until it is resolved/reissued.
  if (d.statementId) {
    const [linked] = await db
      .select({ ownerState: ownerStatements.ownerState })
      .from(ownerStatements)
      .where(
        and(
          eq(ownerStatements.id, d.statementId),
          eq(ownerStatements.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!linked) return { ok: false, error: "Statement not found." };
    if (linked.ownerState === "disputed") {
      return {
        ok: false,
        error: "Payout is paused: this statement is under dispute. Resolve the dispute first.",
      };
    }
  }
  const [row] = await db
    .insert(payoutLines)
    .values({
      payoutBatchId: batchId,
      ownerId: d.ownerId,
      payoutMethodId: nullable(d.payoutMethodId),
      statementId: nullable(d.statementId),
      amountMinor: d.amountMinor,
      currency: d.currency,
      scheduledFor: nullable(d.scheduledFor),
      reference: nullable(d.reference),
      organizationId,
    })
    .returning({ id: payoutLines.id });
  if (!row) return { ok: false, error: "Could not create the payout line." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.payout_line.create",
    entityType: "payout_line",
    entityId: row.id,
    after: { ...d, amountMinor: d.amountMinor.toString() },
  });
  revalidatePath("/dashboard/finance/payouts");
  return { ok: true };
}

const idSetStatusSchema = z.object({
  id: z.string().uuid(),
  next: z.enum(["pending", "approved", "paid", "failed", "cancelled"]),
});

export async function setPayoutLineStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.approve_payout");
  const parsed = idSetStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // WRITE-FLOW-AUDIT: org-scoped load closes the cross-tenant IDOR — a
  // foreign payout-line id cannot be marked paid by another org.
  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(payoutLines)
    .where(and(eq(payoutLines.id, parsed.data.id), eq(payoutLines.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Payout line not found." };
  // State-machine guard: only pending → approved → paid (plus failed/cancelled).
  if (!isAllowedTransition(PAYOUT_LINE_TRANSITIONS, before.status, parsed.data.next)) {
    return {
      ok: false,
      error: `Cannot move payout line from "${before.status}" to "${parsed.data.next}".`,
    };
  }
  const updates: Record<string, unknown> = { status: parsed.data.next };
  if (parsed.data.next === "paid") updates.paidAt = new Date();
  await db
    .update(payoutLines)
    .set(updates)
    .where(and(eq(payoutLines.id, parsed.data.id), eq(payoutLines.organizationId, organizationId)));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `finance.payout_line.${parsed.data.next}`,
    entityType: "payout_line",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.next },
  });
  revalidatePath("/dashboard/finance/payouts");
  return { ok: true };
}

void idSchema;
void canManageEntity;
