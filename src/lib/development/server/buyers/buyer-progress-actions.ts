import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { buyerProgressReports } from "@/lib/db/schema/buyers";
import { requireInternalUser } from "@/features/auth/permissions";

const STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "published",
  "archived",
] as const;

const createReportSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid(),
  reportingPeriodStart: z.string(),
  reportingPeriodEnd: z.string(),
  currentProgressPercentage: z.number().min(0).max(100).nullable().optional(),
  worksCompletedSummary: z.string().nullable().optional(),
  worksPlannedSummary: z.string().nullable().optional(),
  nextMilestone: z.string().nullable().optional(),
  expectedHandoverDate: z.string().nullable().optional(),
  budgetProgressConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  highlightedRisks: z.string().nullable().optional(),
  managementCommentary: z.string().nullable().optional(),
  curatedPhotoIds: z.array(z.string().uuid()).default([]),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
});

export async function createBuyerProgressReport(
  input: z.input<typeof createReportSchema>,
) {
  await requireInternalUser();
  const parsed = createReportSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(buyerProgressReports)
    .values({
      unitId: parsed.unitId ?? null,
      projectId: parsed.projectId,
      reportingPeriodStart: parsed.reportingPeriodStart,
      reportingPeriodEnd: parsed.reportingPeriodEnd,
      currentProgressPercentage:
        parsed.currentProgressPercentage != null
          ? String(parsed.currentProgressPercentage)
          : null,
      worksCompletedSummary: parsed.worksCompletedSummary ?? null,
      worksPlannedSummary: parsed.worksPlannedSummary ?? null,
      nextMilestone: parsed.nextMilestone ?? null,
      expectedHandoverDate: parsed.expectedHandoverDate ?? null,
      budgetProgressConfidence: parsed.budgetProgressConfidence ?? null,
      highlightedRisks: parsed.highlightedRisks ?? null,
      managementCommentary: parsed.managementCommentary ?? null,
      curatedPhotoIds: parsed.curatedPhotoIds,
      notes: parsed.notes ?? null,
      internalNotes: parsed.internalNotes ?? null,
      status: "draft",
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  reportId: z.string().uuid(),
  to: z.enum(STATUSES),
});

/**
 * State machine for buyer reports:
 *   draft → pending_approval → approved → published → archived
 *
 * Approving stamps `approved_by` + `approved_at`. Publishing stamps
 * `published_at` and is the only state buyers can see via RLS.
 */
export async function transitionBuyerProgressReport(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();

  const [current] = await db
    .select()
    .from(buyerProgressReports)
    .where(eq(buyerProgressReports.id, parsed.reportId))
    .limit(1);
  if (!current) throw new Error(`report ${parsed.reportId} not found`);

  const validNext: Record<string, string[]> = {
    draft: ["pending_approval", "archived"],
    pending_approval: ["approved", "draft", "archived"],
    approved: ["published", "draft", "archived"],
    published: ["archived"],
    archived: [],
  };
  if (!validNext[current.status].includes(parsed.to)) {
    throw new Error(
      `cannot transition report from '${current.status}' to '${parsed.to}'`,
    );
  }

  const updates: Record<string, unknown> = { status: parsed.to };
  if (parsed.to === "approved") {
    updates.approvedBy = ctx.appUser?.id ?? null;
    updates.approvedAt = new Date();
  } else if (parsed.to === "published") {
    updates.publishedAt = new Date();
  }

  const [row] = await db
    .update(buyerProgressReports)
    .set(updates)
    .where(eq(buyerProgressReports.id, parsed.reportId))
    .returning();
  return row;
}
