"use server";

/**
 * Wire-up — "use server" adapters for the server-only buyer lifecycle +
 * progress-report actions, so the client island (_controls.tsx) can call them.
 * Each adapter normalizes to {ok} | {ok:false,error} and revalidates the buyer
 * detail path. The underlying actions already enforce permissions + tenant
 * org-scoping + audit logging (buyer-actions.ts / buyer-progress-actions.ts);
 * these wrappers add NO authority — they only adapt the call shape for the UI.
 */

import { revalidatePath } from "next/cache";
import {
  assignUnitToBuyer,
  updateBuyerKycStatus,
  activateBuyerPortalAccess,
} from "@/lib/development/server/buyers/buyer-actions";
import {
  createBuyerProgressReport,
  transitionBuyerProgressReport,
} from "@/lib/development/server/buyers/buyer-progress-actions";

const BUYERS_PATH = "/development-os/buyers";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

// ---------------------------------------------------------------------------
// Lifecycle: assign unit / KYC / portal access
// ---------------------------------------------------------------------------

export async function assignUnitToBuyerAction(input: {
  buyerId: string;
  unitId: string;
  status: string;
  notes: string | null;
}): Promise<ActionResult> {
  try {
    await assignUnitToBuyer({
      buyerId: input.buyerId,
      unitId: input.unitId,
      status: input.status as never,
      notes: input.notes,
    });
    revalidatePath(BUYERS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to assign unit.");
  }
}

export async function updateBuyerKycStatusAction(input: {
  buyerId: string;
  kycStatus: string;
}): Promise<ActionResult> {
  try {
    await updateBuyerKycStatus({
      buyerId: input.buyerId,
      kycStatus: input.kycStatus as never,
    });
    revalidatePath(BUYERS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to update KYC status.");
  }
}

export async function activateBuyerPortalAccessAction(input: {
  buyerId: string;
  supabaseUserId: string;
}): Promise<ActionResult> {
  try {
    await activateBuyerPortalAccess({
      buyerId: input.buyerId,
      supabaseUserId: input.supabaseUserId,
    });
    revalidatePath(BUYERS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to enable portal access.");
  }
}

// ---------------------------------------------------------------------------
// Progress reports: create / transition
// ---------------------------------------------------------------------------

export interface CreateBuyerProgressReportFormInput {
  projectId: string;
  unitId: string | null;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  currentProgressPercentage: number | null;
  budgetProgressConfidence: string | null;
  expectedHandoverDate: string | null;
  worksCompletedSummary: string | null;
  worksPlannedSummary: string | null;
  nextMilestone: string | null;
  highlightedRisks: string | null;
  managementCommentary: string | null;
  notes: string | null;
  internalNotes: string | null;
}

export async function createBuyerProgressReportAction(
  input: CreateBuyerProgressReportFormInput,
): Promise<ActionResult> {
  try {
    await createBuyerProgressReport({
      projectId: input.projectId,
      unitId: input.unitId,
      reportingPeriodStart: input.reportingPeriodStart,
      reportingPeriodEnd: input.reportingPeriodEnd,
      currentProgressPercentage: input.currentProgressPercentage,
      budgetProgressConfidence: (input.budgetProgressConfidence || null) as never,
      expectedHandoverDate: input.expectedHandoverDate,
      worksCompletedSummary: input.worksCompletedSummary,
      worksPlannedSummary: input.worksPlannedSummary,
      nextMilestone: input.nextMilestone,
      highlightedRisks: input.highlightedRisks,
      managementCommentary: input.managementCommentary,
      notes: input.notes,
      internalNotes: input.internalNotes,
    } as never);
    revalidatePath(BUYERS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to create progress report.");
  }
}

export async function transitionBuyerProgressReportAction(input: {
  reportId: string;
  to: string;
}): Promise<ActionResult> {
  try {
    await transitionBuyerProgressReport({
      reportId: input.reportId,
      to: input.to as never,
    });
    revalidatePath(BUYERS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to transition report.");
  }
}
