"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  utilityAccounts,
  utilityReadings,
  utilityPaymentReminders,
  maintenanceRiskEvents,
} from "@/lib/db/schema/maintenance-intelligence";
import { expenseLines } from "@/lib/db/schema/finance";
import { villas } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  classifyUtilityBalance,
  balanceLevelToRiskType,
  levelToSeverity,
  formatBalanceLabel,
} from "./risk-pure";
import {
  createPaymentReminderSchema,
  createUtilityAccountSchema,
  markPaymentPaidSchema,
  recordUtilityReadingSchema,
} from "./schema";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------

function parseAccountForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    villaId: raw.villaId || null,
    projectId: raw.projectId || null,
    utilityType: raw.utilityType,
    providerName: raw.providerName || null,
    accountNumber: raw.accountNumber || null,
    tokenMeter: raw.tokenMeter === "on" || raw.tokenMeter === "true",
    billingCycleDay: raw.billingCycleDay ? Number(raw.billingCycleDay) : null,
    currency: raw.currency || "IDR",
    averageMonthlyCostMinor: raw.averageMonthlyCostMinor
      ? Number(raw.averageMonthlyCostMinor)
      : null,
    lowBalanceThresholdMinor: raw.lowBalanceThresholdMinor
      ? Number(raw.lowBalanceThresholdMinor)
      : null,
    criticalBalanceThresholdMinor: raw.criticalBalanceThresholdMinor
      ? Number(raw.criticalBalanceThresholdMinor)
      : null,
    notes: raw.notes || null,
  };
}

export async function createUtilityAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { accountId?: string }> {
  await requirePermission("utilities.write");
  const parsed = createUtilityAccountSchema.safeParse(parseAccountForm(formData));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // If villa supplied, infer project_id.
  let projectId = parsed.data.projectId ?? null;
  if (!projectId && parsed.data.villaId) {
    const [v] = await db
      .select({ projectId: villas.projectId })
      .from(villas)
      .where(eq(villas.id, parsed.data.villaId))
      .limit(1);
    projectId = v?.projectId ?? null;
  }

  const [row] = await db
    .insert(utilityAccounts)
    .values({
      organizationId,
      villaId: parsed.data.villaId ?? null,
      projectId,
      utilityType: parsed.data.utilityType,
      providerName: parsed.data.providerName ?? null,
      accountNumber: parsed.data.accountNumber ?? null,
      tokenMeter: parsed.data.tokenMeter ?? false,
      billingCycleDay: parsed.data.billingCycleDay ?? null,
      currency: parsed.data.currency,
      averageMonthlyCostMinor: parsed.data.averageMonthlyCostMinor ?? null,
      lowBalanceThresholdMinor: parsed.data.lowBalanceThresholdMinor ?? null,
      criticalBalanceThresholdMinor:
        parsed.data.criticalBalanceThresholdMinor ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: utilityAccounts.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "utilities.account.create",
    entityType: "utility_account",
    entityId: row!.id,
    after: {
      utilityType: parsed.data.utilityType,
      villaId: parsed.data.villaId ?? null,
    },
  });

  revalidatePath("/dashboard/utilities/accounts");
  return { ok: true, accountId: row!.id };
}

// -----------------------------------------------------------------------------
// Readings
// -----------------------------------------------------------------------------

function parseReadingForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    utilityAccountId: raw.utilityAccountId,
    readingType: raw.readingType || "manual_check",
    readingValue: raw.readingValue ? Number(raw.readingValue) : null,
    balanceMinor: raw.balanceMinor ? Number(raw.balanceMinor) : null,
    currency: raw.currency || null,
    readingAt: raw.readingAt || null,
    source: raw.source || "manual",
    notes: raw.notes || null,
  };
}

export async function recordUtilityReadingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { readingId?: string; riskLevel?: string }> {
  await requirePermission("utilities.write");
  const parsed = recordUtilityReadingSchema.safeParse(parseReadingForm(formData));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [account] = await db
    .select()
    .from(utilityAccounts)
    .where(eq(utilityAccounts.id, parsed.data.utilityAccountId))
    .limit(1);
  if (!account) return { ok: false, error: "Account not found." };

  const [reading] = await db
    .insert(utilityReadings)
    .values({
      organizationId: account.organizationId,
      utilityAccountId: parsed.data.utilityAccountId,
      villaId: account.villaId,
      readingType: parsed.data.readingType,
      readingValue:
        parsed.data.readingValue != null
          ? String(parsed.data.readingValue)
          : null,
      balanceMinor: parsed.data.balanceMinor ?? null,
      currency: parsed.data.currency ?? account.currency,
      readingAt: parsed.data.readingAt
        ? new Date(parsed.data.readingAt)
        : new Date(),
      source: parsed.data.source,
      recordedBy: me?.id ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: utilityReadings.id });

  // Threshold check — open a risk event when balance drops low/critical.
  const level = classifyUtilityBalance(parsed.data.balanceMinor ?? null, {
    lowBalanceThresholdMinor: account.lowBalanceThresholdMinor,
    criticalBalanceThresholdMinor: account.criticalBalanceThresholdMinor,
  });
  const riskType = balanceLevelToRiskType(level);
  if (riskType) {
    const severity = levelToSeverity(level);
    const balanceLabel = formatBalanceLabel(
      parsed.data.balanceMinor ?? null,
      account.currency,
    );
    await db
      .insert(maintenanceRiskEvents)
      .values({
        organizationId: account.organizationId,
        villaId: account.villaId,
        projectId: account.projectId,
        riskType,
        severity,
        title:
          level === "critical"
            ? `Critical utility balance: ${account.utilityType}`
            : `Low utility balance: ${account.utilityType}`,
        description: `${account.utilityType} account is at ${balanceLabel}.`,
        sourceType: "utility_account",
        sourceId: account.id,
        status: "open",
      })
      // Idempotent — partial unique index keeps one OPEN row per source.
      .onConflictDoNothing();
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "utilities.reading.record",
    entityType: "utility_reading",
    entityId: reading!.id,
    after: {
      utilityAccountId: parsed.data.utilityAccountId,
      readingType: parsed.data.readingType,
      riskLevel: level,
    },
  });

  revalidatePath("/dashboard/utilities/readings");
  revalidatePath(`/dashboard/utilities/accounts/${parsed.data.utilityAccountId}`);
  revalidatePath("/dashboard/utilities/risks");
  return { ok: true, readingId: reading!.id, riskLevel: level };
}

// -----------------------------------------------------------------------------
// Payment reminders
// -----------------------------------------------------------------------------

export async function createUtilityPaymentReminderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { reminderId?: string }> {
  await requirePermission("utilities.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = createPaymentReminderSchema.safeParse({
    utilityAccountId: raw.utilityAccountId,
    dueDate: raw.dueDate,
    amountMinor: raw.amountMinor ? Number(raw.amountMinor) : null,
    currency: raw.currency || "IDR",
    notes: raw.notes || null,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [account] = await db
    .select({
      villaId: utilityAccounts.villaId,
      organizationId: utilityAccounts.organizationId,
    })
    .from(utilityAccounts)
    .where(eq(utilityAccounts.id, parsed.data.utilityAccountId))
    .limit(1);
  if (!account) return { ok: false, error: "Account not found." };

  const [row] = await db
    .insert(utilityPaymentReminders)
    .values({
      organizationId: account.organizationId,
      utilityAccountId: parsed.data.utilityAccountId,
      villaId: account.villaId,
      dueDate: parsed.data.dueDate,
      amountMinor: parsed.data.amountMinor ?? null,
      currency: parsed.data.currency,
      notes: parsed.data.notes ?? null,
      status: "open",
    })
    .returning({ id: utilityPaymentReminders.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "utilities.payment_reminder.create",
    entityType: "utility_payment_reminder",
    entityId: row!.id,
    after: {
      utilityAccountId: parsed.data.utilityAccountId,
      dueDate: parsed.data.dueDate,
    },
  });

  revalidatePath("/dashboard/utilities/payments");
  return { ok: true, reminderId: row!.id };
}

export async function markUtilityPaymentPaidAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { expenseLineId?: string | null; locked?: boolean }> {
  await requirePermission("utilities.pay");
  const parsed = markPaymentPaidSchema.safeParse({
    id: formData.get("id"),
    paymentDate: formData.get("paymentDate") || undefined,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [reminder] = await db
    .select()
    .from(utilityPaymentReminders)
    .where(eq(utilityPaymentReminders.id, parsed.data.id))
    .limit(1);
  if (!reminder) return { ok: false, error: "Reminder not found." };
  if (reminder.status === "paid")
    return { ok: false, error: "Already paid." };

  const expenseDate =
    parsed.data.paymentDate ?? (reminder.dueDate as unknown as string);

  // Pull the associated account for context.
  const [account] = await db
    .select()
    .from(utilityAccounts)
    .where(eq(utilityAccounts.id, reminder.utilityAccountId))
    .limit(1);

  let expenseLineId: string | null = null;
  let lockedNote: string | null = null;

  // Optionally materialise as an expense_line — only when amount + period open.
  if (
    reminder.amountMinor != null &&
    reminder.amountMinor > 0 &&
    account
  ) {
    try {
      const [exRow] = await db
        .insert(expenseLines)
        .values({
          villaId: account.villaId,
          projectId: account.projectId,
          bookingId: null,
          expenseType: "utility_payment",
          description: `${account.utilityType} payment · ${account.providerName ?? "provider"} · ${expenseDate}`,
          amountMinor: BigInt(reminder.amountMinor),
          currency: reminder.currency,
          expenseDate,
          allocationScope: "villa",
          ownerChargeable: true,
          status: "posted",
          createdBy: me?.id ?? null,
        })
        .returning({ id: expenseLines.id });
      expenseLineId = exRow!.id;
    } catch (e) {
      // The locked-period DB trigger raises on insert when the period is
      // locked. Mark paid anyway, but note the skipped expense.
      const message = e instanceof Error ? e.message : "expense create failed";
      if (/period locked/i.test(message)) {
        lockedNote =
          "Payment recorded; expense_line skipped because the statement period is locked.";
      } else {
        // Any other failure should surface to the operator.
        return { ok: false, error: message };
      }
    }
  }

  await db
    .update(utilityPaymentReminders)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidBy: me?.id ?? null,
      linkedExpenseLineId: expenseLineId,
      notes: parsed.data.notes ?? lockedNote ?? reminder.notes,
      updatedAt: new Date(),
    })
    .where(eq(utilityPaymentReminders.id, reminder.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "utilities.payment.paid",
    entityType: "utility_payment_reminder",
    entityId: reminder.id,
    after: { expenseLineId, locked: !!lockedNote },
  });

  revalidatePath("/dashboard/utilities/payments");
  return {
    ok: true,
    expenseLineId,
    locked: !!lockedNote,
  };
}
