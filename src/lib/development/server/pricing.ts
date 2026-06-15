import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  pricingRules,
  unitPriceSnapshots,
  type NewUnitPriceSnapshot,
  type PricingRule,
} from "@/lib/db/schema/sales";
import { projects, villas } from "@/lib/db/schema/projects";
import { unitDevelopmentMeta } from "@/lib/db/schema/development";
import type {
  PriceSnapshotRow,
  PricingRuleSummary,
} from "@/lib/development/types/pricing";
import {
  calculatePrice,
  type CalculatePriceResult,
} from "./pricing-helpers";

export type {
  PriceSnapshotRow,
  PricingRuleSummary,
} from "@/lib/development/types/pricing";

function toRuleSummary(r: PricingRule): PricingRuleSummary {
  return {
    id: r.id,
    projectId: r.projectId,
    ruleType: r.ruleType as PricingRuleSummary["ruleType"],
    basePriceUsdMinor: r.basePriceUsdMinor,
    escalationPercent: Number(r.escalationPercent),
    escalationFrequency: (r.escalationFrequency ?? null) as
      | PricingRuleSummary["escalationFrequency"],
    escalationStartTrigger:
      r.escalationStartTrigger as PricingRuleSummary["escalationStartTrigger"],
    escalationStartValue: r.escalationStartValue ?? null,
    ceilingPriceUsdMinor: r.ceilingPriceUsdMinor ?? null,
    isActive: r.isActive,
    notes: r.notes ?? null,
  };
}

export async function getPricingRule(
  projectId: string,
): Promise<PricingRuleSummary | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.projectId, projectId))
    .limit(1);
  return row ? toRuleSummary(row) : null;
}

export async function getPriceHistory(
  villaId: string,
): Promise<PriceSnapshotRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(unitPriceSnapshots)
    .where(eq(unitPriceSnapshots.villaId, villaId))
    .orderBy(desc(unitPriceSnapshots.snapshotDate));
  return rows.map((r) => ({
    id: r.id,
    villaId: r.villaId,
    snapshotDate:
      r.snapshotDate instanceof Date
        ? r.snapshotDate.toISOString()
        : String(r.snapshotDate),
    priceUsdMinor: r.priceUsdMinor,
    priceIdrMinor: r.priceIdrMinor,
    fxRateUsdToIdr: Number(r.fxRateUsdToIdr),
    priceBasis: r.priceBasis as PriceSnapshotRow["priceBasis"],
    triggeredBy: r.triggeredBy as PriceSnapshotRow["triggeredBy"],
    triggeredById: r.triggeredById,
    changeAmountUsdMinor: r.changeAmountUsdMinor,
    changePercent: r.changePercent !== null ? Number(r.changePercent) : null,
    notes: r.notes,
  }));
}

export interface CalculateCurrentPriceArgs {
  villaId: string;
  fxRateUsdToIdr: number;
  asOf?: Date;
}

export interface CalculateCurrentPriceResult extends CalculatePriceResult {
  villaId: string;
  ruleId: string | null;
  priceIdrMinor: bigint;
  appliedFxRate: number;
}

/**
 * Computes the current market price for a villa by combining the project's
 * pricing rule, the villa's construction progress, and its location
 * coefficient. Used by reservation creation to lock the price and by the
 * background pricing-snapshot cron.
 */
export async function calculateCurrentPrice(
  args: CalculateCurrentPriceArgs,
): Promise<CalculateCurrentPriceResult | null> {
  const db = getDb();
  if (!db) return null;
  const now = args.asOf ?? new Date();
  const organizationId = await requireOrgId();

  const [villaRow] = await db
    .select({
      id: villas.id,
      projectId: villas.projectId,
      coef: unitDevelopmentMeta.locationCoefficient,
      progress: unitDevelopmentMeta.constructionProgressPercent,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .leftJoin(
      unitDevelopmentMeta,
      eq(unitDevelopmentMeta.villaId, villas.id),
    )
    .where(
      and(
        eq(villas.id, args.villaId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!villaRow) return null;

  const rule = await getPricingRule(villaRow.projectId);
  if (!rule) return null;

  const ruleStartedAt = rule.escalationStartValue
    ? new Date(rule.escalationStartValue)
    : new Date(now.getTime() - 1);
  const calc = calculatePrice({
    rule,
    constructionProgressPct: Number(villaRow.progress ?? 0),
    ruleStartedAt,
    now,
    locationCoefficient: Number(villaRow.coef ?? 1),
  });

  return {
    ...calc,
    villaId: args.villaId,
    ruleId: rule.id,
    priceIdrMinor: BigInt(
      Math.round(Number(calc.finalPriceUsdMinor) * args.fxRateUsdToIdr),
    ),
    appliedFxRate: args.fxRateUsdToIdr,
  };
}

export interface CreatePriceSnapshotInput {
  villaId: string;
  priceUsdMinor: bigint;
  priceIdrMinor: bigint;
  fxRateUsdToIdr: number;
  priceBasis: PriceSnapshotRow["priceBasis"];
  triggeredBy: PriceSnapshotRow["triggeredBy"];
  triggeredById?: string | null;
  changeAmountUsdMinor?: bigint | null;
  changePercent?: number | null;
  notes?: string | null;
}

export async function createPriceSnapshot(
  input: CreatePriceSnapshotInput,
): Promise<PriceSnapshotRow> {
  const db = getDb();
  if (!db) {
    throw new Error("Database is not configured.");
  }
  // Tenancy guard: the snapshot is keyed to a villa, which anchors its org
  // via projects. Reject writing a price/money record against a villa that
  // belongs to another tenant.
  const organizationId = await requireOrgId();
  const [villaRow] = await db
    .select({ id: villas.id })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(villas.id, input.villaId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!villaRow) {
    throw new Error("Villa not found in your organization.");
  }
  const insertVal: NewUnitPriceSnapshot = {
    villaId: input.villaId,
    priceUsdMinor: input.priceUsdMinor,
    priceIdrMinor: input.priceIdrMinor,
    fxRateUsdToIdr: String(input.fxRateUsdToIdr),
    priceBasis: input.priceBasis,
    triggeredBy: input.triggeredBy,
    triggeredById: input.triggeredById ?? null,
    changeAmountUsdMinor: input.changeAmountUsdMinor ?? null,
    changePercent:
      input.changePercent !== undefined && input.changePercent !== null
        ? String(input.changePercent)
        : null,
    notes: input.notes ?? null,
  };
  const [row] = await db.insert(unitPriceSnapshots).values(insertVal).returning();
  return {
    id: row.id,
    villaId: row.villaId,
    snapshotDate:
      row.snapshotDate instanceof Date
        ? row.snapshotDate.toISOString()
        : String(row.snapshotDate),
    priceUsdMinor: row.priceUsdMinor,
    priceIdrMinor: row.priceIdrMinor,
    fxRateUsdToIdr: Number(row.fxRateUsdToIdr),
    priceBasis: row.priceBasis as PriceSnapshotRow["priceBasis"],
    triggeredBy: row.triggeredBy as PriceSnapshotRow["triggeredBy"],
    triggeredById: row.triggeredById,
    changeAmountUsdMinor: row.changeAmountUsdMinor,
    changePercent: row.changePercent !== null ? Number(row.changePercent) : null,
    notes: row.notes,
  };
}
