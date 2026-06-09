"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
  devNotificationDeliveryLog,
} from "@/lib/db/schema/sales";
import { contractGroupRemindPrefs } from "@/lib/db/schema/contract-remind-prefs";
import { requireInternalUser, AuthorizationError } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import {
  OUTSTANDING_STATUSES,
  getInstallmentPlanDetail,
  type InstallmentPlanDetail,
} from "@/lib/development/server/installments";

/**
 * Operator buyers + installments desk actions.
 *
 * These are the OPERATOR-side milestone controls (distinct from the buyer
 * self-service portal): mark a milestone paid, send a payment reminder
 * (single / whole-plan / bulk), and toggle a plan's auto-remind preference.
 * Every money/state write is permission-gated (internal user) and
 * audit-logged. Money is USD MINOR units (bigint cents). Mark-paid is
 * MANUAL — there is no PSP capture (Indonesia rails deferred).
 */

const RESULT_OK = { ok: true } as const;

type ActionResult = { ok: boolean; error?: string };

// ---------------------------------------------------------------------------
// Plan detail (drawer) — wraps the server-only query for client consumption
// ---------------------------------------------------------------------------

export interface PlanDetailDTO {
  contractGroupId: string;
  buyerName: string;
  buyerEmail: string | null;
  villaCode: string;
  projectName: string;
  groupStatus: string;
  autoRemindEnabled: boolean;
  lastRemindedAt: string | null;
  milestones: {
    id: string;
    sequence: number;
    name: string;
    expectedDueDate: string | null;
    status: string;
    expectedAmountUsdMinor: string;
    paidAmountUsdMinor: string;
  }[];
}

function toDetailDto(d: InstallmentPlanDetail): PlanDetailDTO {
  return {
    contractGroupId: d.contractGroupId,
    buyerName: d.buyerName,
    buyerEmail: d.buyerEmail,
    villaCode: d.villaCode,
    projectName: d.projectName,
    groupStatus: d.groupStatus,
    autoRemindEnabled: d.autoRemindEnabled,
    lastRemindedAt: d.lastRemindedAt,
    milestones: d.milestones.map((m) => ({
      id: m.id,
      sequence: m.sequence,
      name: m.name,
      expectedDueDate: m.expectedDueDate,
      status: m.status,
      expectedAmountUsdMinor: m.expectedAmountUsdMinor.toString(),
      paidAmountUsdMinor: m.paidAmountUsdMinor.toString(),
    })),
  };
}

/** Loads one plan's full schedule for the drawer. Internal users only. */
export async function getPlanDetailAction(
  contractGroupId: string,
): Promise<PlanDetailDTO | null> {
  try {
    await requireInternalUser();
  } catch {
    return null;
  }
  if (!z.string().uuid().safeParse(contractGroupId).success) return null;
  const detail = await getInstallmentPlanDetail(contractGroupId);
  return detail ? toDetailDto(detail) : null;
}

function failed(error: string): ActionResult {
  return { ok: false, error };
}

/** Maps an AuthorizationError to a friendly result; rethrows the rest. */
function authResult(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) {
    return failed("You do not have permission to perform this action.");
  }
  throw err;
}

function revalidateDesk() {
  revalidatePath(`${DEVELOPMENT_APP_PATH}/installments`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
}

// ---------------------------------------------------------------------------
// Mark paid (operator-side)
// ---------------------------------------------------------------------------

const markPaidSchema = z.object({
  milestoneId: z.string().uuid(),
  /** USD MINOR units (cents). Omit to settle the full remaining balance. */
  amountUsdMinor: z.coerce.bigint().positive().optional(),
  reference: z.string().max(200).optional(),
});

/**
 * Records a manual payment against one milestone. Cumulative: when the
 * running paid total reaches the expected amount the milestone flips to
 * `paid`; otherwise `partially_paid`. With no amount supplied, settles the
 * full remaining balance in one go.
 */
export async function markMilestonePaidByOperator(
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireInternalUser();
  } catch (err) {
    return authResult(err);
  }

  const parsed = markPaidSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
    amountUsdMinor: formData.get("amountUsdMinor") || undefined,
    reference: formData.get("reference") || undefined,
  });
  if (!parsed.success) return failed("Invalid input.");

  const db = getDb();
  if (!db) return failed("Database is not configured.");

  const [milestone] = await db
    .select()
    .from(contractMilestones)
    .where(eq(contractMilestones.id, parsed.data.milestoneId))
    .limit(1);
  if (!milestone) return failed("Milestone not found.");
  if (milestone.status === "waived" || milestone.status === "cancelled") {
    return failed("This milestone is no longer collectible.");
  }

  const remaining = milestone.expectedAmountUsdMinor - milestone.paidAmountUsdMinor;
  if (remaining <= 0n) return failed("This milestone is already fully paid.");

  const applied =
    parsed.data.amountUsdMinor && parsed.data.amountUsdMinor < remaining
      ? parsed.data.amountUsdMinor
      : remaining;

  const newPaid = milestone.paidAmountUsdMinor + applied;
  const fullyPaid = newPaid >= milestone.expectedAmountUsdMinor;
  const now = new Date();

  await db
    .update(contractMilestones)
    .set({
      paidAmountUsdMinor: newPaid,
      status: fullyPaid ? "paid" : "partially_paid",
      paidAt: fullyPaid ? now : milestone.paidAt,
      notes: parsed.data.reference
        ? `${milestone.notes ?? ""}\nOperator payment ref: ${parsed.data.reference}`.trim()
        : milestone.notes,
      updatedAt: now,
    })
    .where(eq(contractMilestones.id, milestone.id));

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "installment.mark_paid",
    entityType: "contract_milestone",
    entityId: milestone.id,
    before: {
      status: milestone.status,
      paidAmountUsdMinor: milestone.paidAmountUsdMinor.toString(),
    },
    after: {
      status: fullyPaid ? "paid" : "partially_paid",
      paidAmountUsdMinor: newPaid.toString(),
      appliedUsdMinor: applied.toString(),
    },
    metadata: {
      contractGroupId: milestone.contractGroupId,
      reference: parsed.data.reference ?? null,
      channel: "operator_desk",
    },
  });

  revalidateDesk();
  return RESULT_OK;
}

// ---------------------------------------------------------------------------
// Reminders (single milestone / whole plan / bulk)
// ---------------------------------------------------------------------------

/**
 * Queues an in-app installment reminder against a plan's buyer and stamps
 * `last_reminded_at`. Returns the number of outstanding milestones the
 * reminder covered. Reminders never throw on a plan with nothing due — they
 * simply send nothing. Caller is assumed already authenticated + org-scoped.
 */
async function queuePlanReminder(opts: {
  db: NonNullable<ReturnType<typeof getDb>>;
  organizationId: string;
  contractGroupId: string;
  actorUserId: string | null;
  milestoneIds?: string[];
}): Promise<number> {
  const { db, organizationId, contractGroupId, actorUserId, milestoneIds } = opts;

  const [groupRow] = await db
    .select({ contactId: contractGroups.contactId })
    .from(contractGroups)
    .where(eq(contractGroups.id, contractGroupId))
    .limit(1);
  if (!groupRow) return 0;

  const conds = [
    eq(contractMilestones.contractGroupId, contractGroupId),
    inArray(contractMilestones.status, OUTSTANDING_STATUSES),
  ];
  if (milestoneIds && milestoneIds.length > 0) {
    conds.push(inArray(contractMilestones.id, milestoneIds));
  }
  const due = await db
    .select()
    .from(contractMilestones)
    .where(and(...conds));

  if (due.length === 0) return 0;

  const now = new Date();
  const outstandingTotal = due.reduce(
    (sum, m) => sum + (m.expectedAmountUsdMinor - m.paidAmountUsdMinor),
    0n,
  );
  const body =
    `Reminder: ${due.length} installment${due.length === 1 ? "" : "s"} ` +
    `totalling US$${(Number(outstandingTotal) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} are due on your purchase. Please arrange payment at your earliest convenience.`;

  await db.insert(devNotificationDeliveryLog).values({
    organizationId,
    triggerEntityType: "contract_group",
    triggerEntityId: contractGroupId,
    recipientContactId: groupRow.contactId,
    channel: "in_app",
    templateName: "installment_reminder",
    subject: "Installment payment reminder",
    body,
    status: "queued",
  });

  await db
    .insert(contractGroupRemindPrefs)
    .values({
      organizationId,
      contractGroupId,
      autoRemindEnabled: false,
      lastRemindedAt: now,
      updatedBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: contractGroupRemindPrefs.contractGroupId,
      set: { lastRemindedAt: now, updatedAt: now, updatedBy: actorUserId },
    });

  await recordAuditEvent({
    actorUserId,
    action: "installment.remind",
    entityType: "contract_group",
    entityId: contractGroupId,
    after: {
      milestoneCount: due.length,
      outstandingUsdMinor: outstandingTotal.toString(),
    },
    metadata: {
      scope: milestoneIds && milestoneIds.length > 0 ? "milestones" : "plan",
      channel: "in_app",
    },
  });

  return due.length;
}

const remindMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
});

/** Reminds the buyer about a single outstanding milestone. */
export async function remindMilestone(formData: FormData): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireInternalUser();
  } catch (err) {
    return authResult(err);
  }
  const parsed = remindMilestoneSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });
  if (!parsed.success) return failed("Invalid input.");

  const db = getDb();
  if (!db) return failed("Database is not configured.");
  const organizationId = await requireOrgId();

  const [milestone] = await db
    .select({ contractGroupId: contractMilestones.contractGroupId })
    .from(contractMilestones)
    .where(eq(contractMilestones.id, parsed.data.milestoneId))
    .limit(1);
  if (!milestone) return failed("Milestone not found.");

  const sent = await queuePlanReminder({
    db,
    organizationId,
    contractGroupId: milestone.contractGroupId,
    actorUserId: ctx.appUser?.id ?? null,
    milestoneIds: [parsed.data.milestoneId],
  });
  if (sent === 0) return failed("Nothing outstanding to remind on.");

  revalidateDesk();
  return RESULT_OK;
}

const remindPlanSchema = z.object({
  contractGroupId: z.string().uuid(),
});

/** Reminds the buyer about every outstanding milestone on one plan. */
export async function remindPlan(formData: FormData): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireInternalUser();
  } catch (err) {
    return authResult(err);
  }
  const parsed = remindPlanSchema.safeParse({
    contractGroupId: formData.get("contractGroupId"),
  });
  if (!parsed.success) return failed("Invalid input.");

  const db = getDb();
  if (!db) return failed("Database is not configured.");
  const organizationId = await requireOrgId();

  const sent = await queuePlanReminder({
    db,
    organizationId,
    contractGroupId: parsed.data.contractGroupId,
    actorUserId: ctx.appUser?.id ?? null,
  });
  if (sent === 0) return failed("Nothing outstanding to remind on.");

  revalidateDesk();
  return RESULT_OK;
}

const bulkRemindSchema = z.object({
  contractGroupIds: z.array(z.string().uuid()).min(1).max(500),
});

export interface BulkRemindResult extends ActionResult {
  plansReminded?: number;
  plansSkipped?: number;
}

/**
 * Bulk "Send reminders" — fires a plan reminder for each selected plan that
 * still has something outstanding. Plans with nothing due are skipped (not an
 * error). Returns per-batch counts for the toast.
 */
export async function bulkRemindPlans(
  contractGroupIds: string[],
): Promise<BulkRemindResult> {
  let ctx;
  try {
    ctx = await requireInternalUser();
  } catch (err) {
    return authResult(err);
  }
  const parsed = bulkRemindSchema.safeParse({ contractGroupIds });
  if (!parsed.success) return failed("Select at least one plan to remind.");

  const db = getDb();
  if (!db) return failed("Database is not configured.");
  const organizationId = await requireOrgId();

  let reminded = 0;
  let skipped = 0;
  for (const contractGroupId of parsed.data.contractGroupIds) {
    const sent = await queuePlanReminder({
      db,
      organizationId,
      contractGroupId,
      actorUserId: ctx.appUser?.id ?? null,
    });
    if (sent > 0) reminded += 1;
    else skipped += 1;
  }

  revalidateDesk();
  return { ok: true, plansReminded: reminded, plansSkipped: skipped };
}

// ---------------------------------------------------------------------------
// Auto-remind preference toggle
// ---------------------------------------------------------------------------

const toggleSchema = z.object({
  contractGroupId: z.string().uuid(),
  enabled: z.union([z.literal("true"), z.literal("false")]),
});

/** Upserts the per-plan auto-remind preference. */
export async function toggleAutoRemind(formData: FormData): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireInternalUser();
  } catch (err) {
    return authResult(err);
  }
  const parsed = toggleSchema.safeParse({
    contractGroupId: formData.get("contractGroupId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return failed("Invalid input.");

  const db = getDb();
  if (!db) return failed("Database is not configured.");
  const organizationId = await requireOrgId();

  // Guard against a dangling FK — the plan must exist.
  const [group] = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(eq(contractGroups.id, parsed.data.contractGroupId))
    .limit(1);
  if (!group) return failed("Plan not found.");

  const enabled = parsed.data.enabled === "true";
  const now = new Date();
  await db
    .insert(contractGroupRemindPrefs)
    .values({
      organizationId,
      contractGroupId: parsed.data.contractGroupId,
      autoRemindEnabled: enabled,
      updatedBy: ctx.appUser?.id ?? null,
    })
    .onConflictDoUpdate({
      target: contractGroupRemindPrefs.contractGroupId,
      set: {
        autoRemindEnabled: enabled,
        updatedAt: now,
        updatedBy: ctx.appUser?.id ?? null,
      },
    });

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "installment.toggle_auto_remind",
    entityType: "contract_group",
    entityId: parsed.data.contractGroupId,
    after: { autoRemindEnabled: enabled },
  });

  revalidateDesk();
  return RESULT_OK;
}
