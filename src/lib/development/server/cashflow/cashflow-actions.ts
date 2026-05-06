import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { cashflowForecasts } from "@/lib/db/schema/profitability-cashflow";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  computeMonthlyCashflowProjection,
  type MonthlyCashflowInput,
} from "./cashflow-helpers";

const dateSchema = z
  .string()
  .or(z.date())
  .transform((v) => (typeof v === "string" ? new Date(v) : v));

const lineSchema = z.object({
  month: dateSchema,
  amount: z.number().nonnegative(),
});

const salesLineSchema = lineSchema.extend({
  certainty: z.enum(["committed", "likely", "speculative"]).default("likely"),
});

const generateSchema = z
  .object({
    forecastLabel: z.string().min(1),
    scope: z.enum(["project", "company_wide"]),
    projectId: z.string().uuid().nullable().optional(),
    horizonMonths: z.number().int().min(1).max(60).default(12),
    startMonth: dateSchema,
    startingCash: z.number(),
    expectedSalesByMonth: z.array(salesLineSchema).default([]),
    expectedCapitalCallsByMonth: z.array(lineSchema).default([]),
    expectedRentalIncomeByMonth: z.array(lineSchema).default([]),
    monthlyPayrollCommitment: z.number().nonnegative(),
    monthlyFixedCosts: z.number().nonnegative(),
    expectedConstructionCostsByMonth: z.array(lineSchema).default([]),
    expectedTaxPaymentsByMonth: z.array(lineSchema).default([]),
    expectedDistributionsByMonth: z.array(lineSchema).default([]),
    expectedLandPaymentsByMonth: z.array(lineSchema).default([]),
    generatedByAgent: z.boolean().default(false),
    notes: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "project" && !value.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId required when scope='project'",
        path: ["projectId"],
      });
    }
    if (value.scope === "company_wide" && value.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId must be null when scope='company_wide'",
        path: ["projectId"],
      });
    }
  });

/**
 * Generate a cashflow forecast and persist it as a JSONB snapshot.
 * Always lands in `status='draft'` for operator review.
 */
export async function generateCashflowForecast(
  input: z.input<typeof generateSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = generateSchema.parse(input);
  const db = requireDb();

  const helperInput: MonthlyCashflowInput = {
    startMonth: parsed.startMonth,
    horizonMonths: parsed.horizonMonths,
    startingCash: parsed.startingCash,
    expectedSalesByMonth: parsed.expectedSalesByMonth,
    expectedCapitalCallsByMonth: parsed.expectedCapitalCallsByMonth,
    expectedRentalIncomeByMonth: parsed.expectedRentalIncomeByMonth,
    monthlyPayrollCommitment: parsed.monthlyPayrollCommitment,
    monthlyFixedCosts: parsed.monthlyFixedCosts,
    expectedConstructionCostsByMonth: parsed.expectedConstructionCostsByMonth,
    expectedTaxPaymentsByMonth: parsed.expectedTaxPaymentsByMonth,
    expectedDistributionsByMonth: parsed.expectedDistributionsByMonth,
    expectedLandPaymentsByMonth: parsed.expectedLandPaymentsByMonth,
  };
  const result = computeMonthlyCashflowProjection(helperInput);

  const [row] = await db
    .insert(cashflowForecasts)
    .values({
      forecastLabel: parsed.forecastLabel,
      scope: parsed.scope,
      projectId: parsed.projectId ?? null,
      forecastHorizonMonths: parsed.horizonMonths,
      forecastStartMonth: parsed.startMonth.toISOString().slice(0, 10),
      monthlyProjections: result.projections.map((p) => ({
        month: p.month.toISOString().slice(0, 10),
        inflow: p.inflow,
        outflow: p.outflow,
        net: p.net,
        cumulativeCash: p.cumulativeCash,
      })),
      peakCapitalRequiredMinor: BigInt(result.peakCapitalRequired),
      peakRequiredAtMonth: result.peakAt.toISOString().slice(0, 10),
      totalInflowMinor: BigInt(result.totalInflow),
      totalOutflowMinor: BigInt(result.totalOutflow),
      endingCashMinor: BigInt(result.endingCash),
      identifiedCashGaps: result.identifiedGaps.map((g) => ({
        month: g.month.toISOString().slice(0, 10),
        gapAmount: g.gapAmount,
        severity: g.severity,
      })),
      status: "draft",
      generatedByAgent: parsed.generatedByAgent,
      notes: parsed.notes ?? null,
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  forecastId: z.string().uuid(),
  to: z.enum(["draft", "active", "archived", "superseded"]),
});

export async function transitionCashflowForecast(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  const updates: Record<string, unknown> = { status: parsed.to };
  if (parsed.to === "active") {
    updates.approvedBy = ctx.appUser?.id ?? null;
    updates.approvedAt = new Date();
  }
  const [row] = await db
    .update(cashflowForecasts)
    .set(updates)
    .where(eq(cashflowForecasts.id, parsed.forecastId))
    .returning();
  return row;
}
