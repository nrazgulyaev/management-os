import "server-only";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  payrollPeriods,
  teamCapacityTracking,
  projectCycleRecommendations,
} from "@/lib/db/schema/project-cycle";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  computeProjectCycleAdvisory,
  type ProjectCycleInput,
  type ProjectCycleOutput,
} from "./cycle-helpers";

const PERIOD_TYPES = ["weekly", "biweekly", "monthly", "quarterly"] as const;
const STATUSES = ["projected", "committed", "paid", "archived"] as const;

const createPayrollPeriodSchema = z.object({
  periodLabel: z.string().min(1),
  periodType: z.enum(PERIOD_TYPES),
  periodStart: z.string(),
  periodEnd: z.string(),
  totalPayrollAmountMinor: z.bigint().positive(),
  currency: z.string().default("IDR"),
  totalHeadcount: z.number().int().positive(),
  allocations: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        allocationPercentage: z.number().min(0).max(100),
        amountMinor: z.bigint().nonnegative(),
      }),
    )
    .optional(),
  status: z.enum(STATUSES).default("projected"),
  notes: z.string().nullable().optional(),
});

export async function createPayrollPeriod(
  input: z.input<typeof createPayrollPeriodSchema>,
) {
  await requireInternalUser();
  const parsed = createPayrollPeriodSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(payrollPeriods)
    .values({
      periodLabel: parsed.periodLabel,
      periodType: parsed.periodType,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      totalPayrollAmountMinor: parsed.totalPayrollAmountMinor,
      currency: parsed.currency,
      totalHeadcount: parsed.totalHeadcount,
      allocations: parsed.allocations ?? null,
      status: parsed.status,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const ROLE_TYPES = [
  "pm",
  "qs",
  "site_supervisor",
  "engineer",
  "architect",
  "designer",
  "admin",
  "sales",
  "finance",
  "other",
] as const;

const trackCapacitySchema = z.object({
  trackingPeriodStart: z.string(),
  trackingPeriodEnd: z.string(),
  roleType: z.enum(ROLE_TYPES),
  totalTeamMembers: z.number().int().nonnegative(),
  totalCapacityHours: z.number().nonnegative(),
  utilizedHours: z.number().nonnegative(),
  allocations: z.array(
    z.object({
      projectId: z.string().uuid(),
      hours: z.number().nonnegative(),
      percentage: z.number().min(0).max(100),
    }),
  ),
  notes: z.string().nullable().optional(),
});

export async function trackTeamCapacity(
  input: z.input<typeof trackCapacitySchema>,
) {
  await requireInternalUser();
  const parsed = trackCapacitySchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(teamCapacityTracking)
    .values({
      trackingPeriodStart: parsed.trackingPeriodStart,
      trackingPeriodEnd: parsed.trackingPeriodEnd,
      roleType: parsed.roleType,
      totalTeamMembers: parsed.totalTeamMembers,
      totalCapacityHours: String(parsed.totalCapacityHours),
      allocations: parsed.allocations,
      utilizedHours: String(parsed.utilizedHours),
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

/**
 * Generate a cycle recommendation based on the supplied context. The
 * underlying decision tree is fully deterministic — see cycle-helpers.
 * The AI agent (when configured) only generates the *narrative* on top.
 */
export async function generateCycleRecommendation(input: {
  context: ProjectCycleInput;
  generatedByAgent?: string;
}) {
  await requireInternalUser();
  const db = requireDb();

  const advisory: ProjectCycleOutput = computeProjectCycleAdvisory(input.context);

  // Code: PCR-YYYY-####
  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(projectCycleRecommendations);
  const year = new Date().getFullYear();
  const seq = String(Number(count ?? "0") + 1).padStart(3, "0");
  const recommendationCode = `PCR-${year}-${seq}`;

  const [row] = await db
    .insert(projectCycleRecommendations)
    .values({
      recommendationCode,
      generatedForDate: new Date().toISOString().slice(0, 10),
      generatedByAgent: input.generatedByAgent ?? "project_cycle_intelligence",
      contextSnapshot: serializeForJsonb(input.context),
      recommendedAction: advisory.recommendedAction,
      recommendedTiming: advisory.recommendedTiming,
      aiReasoning: advisory.reasoning,
      supportingMetrics: advisory.supportingMetrics,
      confidenceLevel: advisory.confidenceLevel,
      operatorStatus: "unreviewed",
    })
    .returning();
  return row;
}

const reviewSchema = z.object({
  recommendationId: z.string().uuid(),
  decision: z.enum([
    "reviewed",
    "accepted",
    "rejected",
    "partially_accepted",
  ]),
  operatorNotes: z.string().nullable().optional(),
});

export async function reviewCycleRecommendation(
  input: z.input<typeof reviewSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = reviewSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .update(projectCycleRecommendations)
    .set({
      operatorStatus: parsed.decision,
      operatorNotes: parsed.operatorNotes ?? null,
      reviewedBy: ctx.appUser?.id ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(projectCycleRecommendations.id, parsed.recommendationId))
    .returning();
  return row;
}

/**
 * Convert ProjectCycleInput (with Date objects) to JSONB-safe shape.
 * JSONB doesn't preserve Date — serialize to ISO strings.
 */
function serializeForJsonb(ctx: ProjectCycleInput): Record<string, unknown> {
  return {
    currentDate: ctx.currentDate.toISOString(),
    cashOnHand: ctx.cashOnHand,
    receivablesNext30Days: ctx.receivablesNext30Days,
    payablesNext30Days: ctx.payablesNext30Days,
    monthlyPayrollCommitment: ctx.monthlyPayrollCommitment,
    monthlyOtherFixedCosts: ctx.monthlyOtherFixedCosts,
    expectedInflowsByMonth: ctx.expectedInflowsByMonth,
    activeProjects: ctx.activeProjects.map((p) => ({
      ...p,
      expectedCompletionDate: p.expectedCompletionDate.toISOString(),
    })),
    teamRoles: ctx.teamRoles,
    unsoldUnits: ctx.unsoldUnits,
    cashFromExpectedSales: ctx.cashFromExpectedSales,
  };
}
