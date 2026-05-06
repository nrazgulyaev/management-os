"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { aiConstructionAnalyses } from "@/lib/db/schema/ai-development";
import { siteReports } from "@/lib/db/schema/site-operations";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  analyzeSiteReport,
  type SupervisorOutcome,
} from "@/lib/development/ai/construction-supervisor";

/**
 * HITL actions for `ai_construction_analyses`. Every action gates on
 * internal staff and runs in a single transaction so half-applied
 * approvals can never happen.
 */

const idSchema = z.object({ analysisId: z.string().uuid() });
const reportIdSchema = z.object({ reportId: z.string().uuid() });

/**
 * Manual trigger from the site-report detail page.
 *
 * - If there's already an active analysis, returns it untouched
 *   (idempotent — UI can call freely).
 * - Otherwise opens a new analysis. The actual analyzer runs inline
 *   for fast feedback on the operator's click.
 */
export async function generateAnalysisForReport(
  input: z.input<typeof reportIdSchema>,
): Promise<SupervisorOutcome> {
  const parsed = reportIdSchema.parse(input);
  await requireInternalUser();
  const out = await analyzeSiteReport(parsed.reportId);
  revalidatePath(`/development-os/site-reports/${parsed.reportId}`);
  return out;
}

/**
 * Discard the current draft (mark superseded) and run the analyzer
 * again. Audit chain is preserved — superseded rows stay in DB.
 */
export async function regenerateAnalysisForReport(
  input: z.input<typeof reportIdSchema>,
): Promise<SupervisorOutcome> {
  const parsed = reportIdSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();

  await db
    .update(aiConstructionAnalyses)
    .set({
      status: "superseded",
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiConstructionAnalyses.siteReportId, parsed.reportId),
        eq(aiConstructionAnalyses.status, "draft"),
      ),
    );

  const out = await analyzeSiteReport(parsed.reportId);
  revalidatePath(`/development-os/site-reports/${parsed.reportId}`);
  return out;
}

/**
 * Approve as-is. Updates the report's `summary_translations` with
 * any AI-supplied translations not already present (operator
 * translations always win).
 */
export async function approveAnalysis(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true }> {
  const parsed = idSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();

  await db.transaction(async (tx) => {
    const [a] = await tx
      .select({
        id: aiConstructionAnalyses.id,
        siteReportId: aiConstructionAnalyses.siteReportId,
        translations: aiConstructionAnalyses.draftSummaryTranslations,
        status: aiConstructionAnalyses.status,
      })
      .from(aiConstructionAnalyses)
      .where(eq(aiConstructionAnalyses.id, parsed.analysisId))
      .limit(1);
    if (!a) throw new Error("Analysis not found");
    if (a.status !== "draft") {
      throw new Error(`Cannot approve analysis in '${a.status}' state`);
    }

    await tx
      .update(aiConstructionAnalyses)
      .set({
        status: "approved",
        reviewedBy: meId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiConstructionAnalyses.id, a.id));

    // Merge AI translations into the report (operator wins).
    const aiTranslations =
      (a.translations as Record<string, string> | null) ?? {};
    const [report] = await tx
      .select({ existing: siteReports.summaryTranslations })
      .from(siteReports)
      .where(eq(siteReports.id, a.siteReportId))
      .limit(1);
    const existing =
      (report?.existing as Record<string, string> | null) ?? {};
    const merged: Record<string, string> = { ...aiTranslations, ...existing };
    if (Object.keys(merged).length !== Object.keys(existing).length) {
      await tx
        .update(siteReports)
        .set({
          summaryTranslations:
            merged as typeof siteReports.$inferInsert["summaryTranslations"],
          updatedAt: new Date(),
        })
        .where(eq(siteReports.id, a.siteReportId));
    }
  });

  revalidatePath(
    `/development-os/site-reports/${(await getReportIdForAnalysis(parsed.analysisId)) ?? ""}`,
  );
  return { ok: true };
}

const editSchema = z.object({
  analysisId: z.string().uuid(),
  edits: z.object({
    draftSummary: z.string().min(1).max(4000).optional(),
    safetyStatus: z
      .enum(["normal", "minor_concerns", "serious_concerns"])
      .optional(),
    safetyConcerns: z.array(z.string().max(300)).max(20).optional(),
    immediateActionsRecommended: z
      .array(z.string().max(300))
      .max(20)
      .optional(),
    recommendedReviewerActions: z
      .array(z.string().max(300))
      .max(20)
      .optional(),
  }),
});

export async function editAndApproveAnalysis(
  input: z.input<typeof editSchema>,
): Promise<{ ok: true }> {
  const parsed = editSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();

  await db.transaction(async (tx) => {
    const [a] = await tx
      .select({
        id: aiConstructionAnalyses.id,
        status: aiConstructionAnalyses.status,
        currentDraft: aiConstructionAnalyses.draftSummary,
        currentSafety: aiConstructionAnalyses.safetyStatus,
      })
      .from(aiConstructionAnalyses)
      .where(eq(aiConstructionAnalyses.id, parsed.analysisId))
      .limit(1);
    if (!a) throw new Error("Analysis not found");
    if (a.status !== "draft") {
      throw new Error(`Cannot edit analysis in '${a.status}' state`);
    }

    await tx
      .update(aiConstructionAnalyses)
      .set({
        draftSummary: parsed.edits.draftSummary ?? a.currentDraft,
        safetyStatus: parsed.edits.safetyStatus ?? a.currentSafety,
        ...(parsed.edits.safetyConcerns != null && {
          safetyConcerns: parsed.edits.safetyConcerns,
        }),
        ...(parsed.edits.immediateActionsRecommended != null && {
          immediateActionsRecommended: parsed.edits.immediateActionsRecommended,
        }),
        ...(parsed.edits.recommendedReviewerActions != null && {
          recommendedReviewerActions: parsed.edits.recommendedReviewerActions,
        }),
        reviewerEdits:
          parsed.edits as typeof aiConstructionAnalyses.$inferInsert["reviewerEdits"],
        status: "edited_approved",
        reviewedBy: meId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiConstructionAnalyses.id, a.id));
  });

  revalidatePath(
    `/development-os/site-reports/${(await getReportIdForAnalysis(parsed.analysisId)) ?? ""}`,
  );
  return { ok: true };
}

const rejectSchema = z.object({
  analysisId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function rejectAnalysis(
  input: z.input<typeof rejectSchema>,
): Promise<{ ok: true }> {
  const parsed = rejectSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();

  await db
    .update(aiConstructionAnalyses)
    .set({
      status: "rejected",
      rejectionReason: parsed.reason,
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiConstructionAnalyses.id, parsed.analysisId),
        eq(aiConstructionAnalyses.status, "draft"),
      ),
    );

  revalidatePath(
    `/development-os/site-reports/${(await getReportIdForAnalysis(parsed.analysisId)) ?? ""}`,
  );
  return { ok: true };
}

async function getReportIdForAnalysis(
  analysisId: string,
): Promise<string | null> {
  const db = requireDb();
  const [row] = await db
    .select({ id: aiConstructionAnalyses.siteReportId })
    .from(aiConstructionAnalyses)
    .where(eq(aiConstructionAnalyses.id, analysisId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Read-side query for the site-report detail page. Returns the
 * currently active analysis (draft / approved / edited_approved) or
 * null. Superseded + rejected analyses live in DB but do not surface
 * in the UI by default.
 */
export async function getActiveAnalysisForReport(reportId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(aiConstructionAnalyses)
    .where(
      and(
        eq(aiConstructionAnalyses.siteReportId, reportId),
        sql`${aiConstructionAnalyses.status} IN ('draft','approved','edited_approved')`,
      ),
    )
    .limit(1);
  return row ?? null;
}
