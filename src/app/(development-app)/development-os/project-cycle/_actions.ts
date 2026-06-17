"use server";

/**
 * Wire-up sweep — "use server" adapters for the server-only project-cycle
 * actions (reviewCycleRecommendation / createPayrollPeriod /
 * trackTeamCapacity). All three already enforce requireInternalUser; these
 * wrappers only adapt the call shape to {ok}|{ok,error}, convert
 * user-entered *major* money amounts to *minor* BIGINT, and revalidate the
 * project-cycle path. NO authority added.
 */

import { revalidatePath } from "next/cache";
import {
  reviewCycleRecommendation,
  createPayrollPeriod,
  trackTeamCapacity,
  generateCycleRecommendation,
  buildCurrentCycleContext,
} from "@/lib/development/server/project-cycle/cycle-actions";

const PATH = "/development-os/project-cycle";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Convert a major-unit amount ("12500000.50") to minor BIGINT. IDR-class
 *  currencies carry 2 minor digits in this schema. */
function majorToMinor(major: string): bigint {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Amount must be a non-negative number.");
  }
  return BigInt(Math.round(n * 100));
}

/**
 * Generate a fresh cycle recommendation on demand. Builds the
 * ProjectCycleInput server-side from current org-scoped state
 * (buildCurrentCycleContext) — the client never supplies the context, so no
 * tampering. generateCycleRecommendation stamps the caller's org + writes the
 * deterministic advisory as `unreviewed`.
 */
export async function generateCycleRecommendationAction(): Promise<
  { ok: true; recommendationCode: string | null } | { ok: false; error: string }
> {
  try {
    const context = await buildCurrentCycleContext();
    const row = await generateCycleRecommendation({ context });
    revalidatePath(PATH);
    return { ok: true, recommendationCode: row?.recommendationCode ?? null };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to generate recommendation.",
    };
  }
}

export async function reviewCycleRecommendationAction(input: {
  recommendationId: string;
  decision: "reviewed" | "accepted" | "rejected" | "partially_accepted";
  operatorNotes?: string | null;
}): Promise<ActionResult> {
  try {
    await reviewCycleRecommendation(input);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Review failed." };
  }
}

// ---------------------------------------------------------------------------
// New payroll period
// ---------------------------------------------------------------------------

export interface CreatePayrollPeriodFormInput {
  periodLabel: string;
  periodType: "weekly" | "biweekly" | "monthly" | "quarterly";
  periodStart: string;
  periodEnd: string;
  totalPayrollAmountMajor: string;
  currency: string;
  totalHeadcount: number;
  allocations: {
    projectId: string;
    allocationPercentage: number;
    amountMajor: string;
  }[];
  notes?: string | null;
}

export async function createPayrollPeriodAction(
  input: CreatePayrollPeriodFormInput,
): Promise<ActionResult> {
  try {
    const allocations = (input.allocations ?? [])
      .filter((a) => a.projectId)
      .map((a) => ({
        projectId: a.projectId,
        allocationPercentage: a.allocationPercentage,
        amountMinor: majorToMinor(a.amountMajor || "0"),
      }));
    await createPayrollPeriod({
      periodLabel: input.periodLabel,
      periodType: input.periodType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalPayrollAmountMinor: majorToMinor(input.totalPayrollAmountMajor),
      currency: input.currency || "IDR",
      totalHeadcount: input.totalHeadcount,
      allocations: allocations.length > 0 ? allocations : undefined,
      notes: input.notes || null,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create payroll period.",
    };
  }
}

// ---------------------------------------------------------------------------
// Record team capacity
// ---------------------------------------------------------------------------

export interface TrackCapacityFormInput {
  trackingPeriodStart: string;
  trackingPeriodEnd: string;
  roleType:
    | "pm"
    | "qs"
    | "site_supervisor"
    | "engineer"
    | "architect"
    | "designer"
    | "admin"
    | "sales"
    | "finance"
    | "other";
  totalTeamMembers: number;
  totalCapacityHours: number;
  utilizedHours: number;
  allocations: {
    projectId: string;
    hours: number;
    percentage: number;
  }[];
  notes?: string | null;
}

export async function trackTeamCapacityAction(
  input: TrackCapacityFormInput,
): Promise<ActionResult> {
  try {
    const allocations = (input.allocations ?? [])
      .filter((a) => a.projectId)
      .map((a) => ({
        projectId: a.projectId,
        hours: a.hours,
        percentage: a.percentage,
      }));
    await trackTeamCapacity({
      trackingPeriodStart: input.trackingPeriodStart,
      trackingPeriodEnd: input.trackingPeriodEnd,
      roleType: input.roleType,
      totalTeamMembers: input.totalTeamMembers,
      totalCapacityHours: input.totalCapacityHours,
      utilizedHours: input.utilizedHours,
      allocations,
      notes: input.notes || null,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to record capacity.",
    };
  }
}
