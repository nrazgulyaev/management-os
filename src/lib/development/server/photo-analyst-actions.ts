"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { siteReportPhotos } from "@/lib/db/schema/site-operations";
import { requireInternalUser } from "@/features/auth/permissions";
import { checkBudget } from "@/lib/ai/budget";
import {
  analyzePhoto,
  PHOTO_ANALYST_KEY,
  type PhotoAnalysisResult,
} from "@/lib/development/ai/photo-analyst";

/**
 * Operator-triggered re-analysis of a single photo. Clears
 * `ai_analyzed_at` first so the analyzer doesn't short-circuit, then
 * runs synchronously for fast UI feedback. Refreshes the report
 * detail page on success.
 *
 * Disabled at the UI layer when the budget is exhausted; this action
 * also defends in depth via `checkBudget`.
 */

const schema = z.object({
  photoId: z.string().uuid(),
  /**
   * The detail page slug — passed in so the action can revalidate the
   * right URL. Optional; missing slug just skips revalidation.
   */
  reportId: z.string().uuid().optional(),
});

export async function reanalyzePhoto(
  input: z.input<typeof schema>,
): Promise<PhotoAnalysisResult> {
  const parsed = schema.parse(input);
  await requireInternalUser();

  const budget = await checkBudget(PHOTO_ANALYST_KEY);
  if (budget.decision === "block") {
    return {
      photoId: parsed.photoId,
      status: "budget_exceeded",
      errorMessage: budget.reason,
      runId: null,
    };
  }

  // Clear analysis fields so the analyzer doesn't return 'skipped'.
  const db = requireDb();
  await db
    .update(siteReportPhotos)
    .set({
      aiAnalyzedAt: null,
      aiDetectedObjects: null,
      aiProgressInferred: null,
      aiSafetyConcerns: null,
      aiQualityConcerns: null,
    })
    .where(eq(siteReportPhotos.id, parsed.photoId));

  const result = await analyzePhoto(parsed.photoId);
  if (parsed.reportId) {
    revalidatePath(`/development-os/site-reports/${parsed.reportId}`);
  }
  return result;
}

/**
 * Lightweight read-side helper for the UI — returns whether the photo
 * analyst budget allows another call right now. UI uses this to
 * disable the button + show a tooltip.
 */
export async function canRunPhotoAnalyst(): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const decision = await checkBudget(PHOTO_ANALYST_KEY);
  if (decision.decision === "block") {
    return { allowed: false, reason: decision.reason };
  }
  return { allowed: true };
}
