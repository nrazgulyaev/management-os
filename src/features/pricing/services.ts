import "server-only";

import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  ratePlans,
  ratePlanSeasons,
  ratePlanOverrides,
} from "@/lib/db/schema/pricing";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { quoteForRangePure, type QuoteResult } from "./quote";

export interface RatePlanRow {
  id: string;
  projectId: string | null;
  projectName: string | null;
  villaId: string | null;
  villaCode: string | null;
  name: string;
  baseCurrency: string;
  baseNightlyRateMinor: number;
  managementFeePercent: string | null;
  status: string;
  createdAt: string;
}

export async function listRatePlans(opts?: {
  villaId?: string;
  projectId?: string;
  status?: string;
}): Promise<RatePlanRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.villaId) filters.push(eq(ratePlans.villaId, opts.villaId));
  if (opts?.projectId) filters.push(eq(ratePlans.projectId, opts.projectId));
  if (opts?.status) filters.push(eq(ratePlans.status, opts.status));
  const rows = await db
    .select({
      r: ratePlans,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(ratePlans)
    .leftJoin(villas, eq(villas.id, ratePlans.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, ratePlans.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(ratePlans.name));
  return rows.map((r) => mapPlan(r.r, r.villaCode ?? null, r.projectName ?? null));
}

export async function getRatePlanById(id: string): Promise<RatePlanRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      r: ratePlans,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(ratePlans)
    .leftJoin(villas, eq(villas.id, ratePlans.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, ratePlans.projectId))
    .where(eq(ratePlans.id, id))
    .limit(1);
  return row
    ? mapPlan(row.r, row.villaCode ?? null, row.projectName ?? null)
    : null;
}

function mapPlan(
  r: typeof ratePlans.$inferSelect,
  villaCode: string | null,
  projectName: string | null,
): RatePlanRow {
  return {
    id: r.id,
    projectId: r.projectId,
    projectName,
    villaId: r.villaId,
    villaCode,
    name: r.name,
    baseCurrency: r.baseCurrency,
    baseNightlyRateMinor: Number(r.baseNightlyRateMinor),
    managementFeePercent:
      r.managementFeePercent != null ? String(r.managementFeePercent) : null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Find the most-specific active rate plan for a villa. Villa-level wins;
 * else fall back to the villa's project-level plan; else null.
 */
export async function getRatePlanForVilla(
  villaId: string,
): Promise<RatePlanRow | null> {
  const db = getDb();
  if (!db) return null;
  const [v] = await db
    .select({ projectId: villas.projectId })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);
  const projectId = v?.projectId ?? null;

  const candidates = await db
    .select({
      r: ratePlans,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(ratePlans)
    .leftJoin(villas, eq(villas.id, ratePlans.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, ratePlans.projectId))
    .where(
      and(
        eq(ratePlans.status, "active"),
        or(
          eq(ratePlans.villaId, villaId),
          and(
            isNull(ratePlans.villaId),
            projectId ? eq(ratePlans.projectId, projectId) : isNull(ratePlans.projectId),
          ),
        ),
      ),
    )
    .orderBy(desc(ratePlans.villaId)); // villa-specific (non-null) sorts first
  if (candidates.length === 0) return null;
  // Pick the row with the most-specific scope: villa first, then project.
  const villaSpecific = candidates.find((c) => c.r.villaId === villaId);
  const pick = villaSpecific ?? candidates[0];
  return mapPlan(pick.r, pick.villaCode ?? null, pick.projectName ?? null);
}

export async function listSeasonsForPlan(
  ratePlanId: string,
): Promise<(typeof ratePlanSeasons.$inferSelect)[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(ratePlanSeasons)
    .where(eq(ratePlanSeasons.ratePlanId, ratePlanId))
    .orderBy(asc(ratePlanSeasons.startsOn));
}

export async function listOverridesForPlanInRange(
  ratePlanId: string,
  startDate: string,
  endDate: string,
): Promise<(typeof ratePlanOverrides.$inferSelect)[]> {
  const db = getDb();
  if (!db) return [];
  // Pull a wider window than [start, end) for safety and filter in JS.
  const all = await db
    .select()
    .from(ratePlanOverrides)
    .where(eq(ratePlanOverrides.ratePlanId, ratePlanId))
    .orderBy(asc(ratePlanOverrides.stayDate));
  return all.filter((o) => {
    const d = o.stayDate as unknown as string;
    return d >= startDate && d < endDate;
  });
}

/**
 * Quote a stay for a villa over `[checkIn, checkOut)`. Returns
 * `available=false, reason='no_plan'` when no rate plan applies — the
 * caller renders a friendly message.
 *
 * Deterministic: same inputs → same output (no Date.now).
 */
export type QuoteServiceReason = QuoteResult["reason"] | "no_plan";

export async function quoteForRange(input: {
  villaId: string;
  checkIn: string;
  checkOut: string;
}): Promise<
  Omit<QuoteResult, "reason"> & {
    ratePlanId: string | null;
    reason: QuoteServiceReason;
  }
> {
  const plan = await getRatePlanForVilla(input.villaId);
  if (!plan) {
    return {
      available: false,
      reason: "no_plan",
      currency: "USD",
      nights: 0,
      grossAmountMinor: 0,
      breakdown: [],
      minLosWarning: null,
      ratePlanId: null,
    };
  }
  const seasons = await listSeasonsForPlan(plan.id);
  const overrides = await listOverridesForPlanInRange(
    plan.id,
    input.checkIn,
    input.checkOut,
  );
  const result = quoteForRangePure({
    ratePlan: {
      id: plan.id,
      baseCurrency: plan.baseCurrency,
      baseNightlyRateMinor: plan.baseNightlyRateMinor,
      managementFeePercent: plan.managementFeePercent,
    },
    seasons: seasons.map((s) => ({
      id: s.id,
      startsOn: s.startsOn as unknown as string,
      endsOn: s.endsOn as unknown as string,
      multiplier: s.multiplier as unknown as string,
      nightlyRateMinor: s.nightlyRateMinor != null ? Number(s.nightlyRateMinor) : null,
      minLos: s.minLos,
      maxLos: s.maxLos,
      stopSell: s.stopSell,
      status: s.status,
    })),
    overrides: overrides.map((o) => ({
      stayDate: o.stayDate as unknown as string,
      nightlyRateMinor: o.nightlyRateMinor != null ? Number(o.nightlyRateMinor) : null,
      minLos: o.minLos,
      stopSell: o.stopSell,
    })),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
  });
  return { ...result, ratePlanId: plan.id };
}

export async function calculateExpectedGrossRevenue(
  villaId: string,
  startDate: string,
  endDate: string,
): Promise<{ grossAmountMinor: number; currency: string; ratePlanId: string | null }> {
  const q = await quoteForRange({
    villaId,
    checkIn: startDate,
    checkOut: endDate,
  });
  return {
    grossAmountMinor: q.grossAmountMinor,
    currency: q.currency,
    ratePlanId: q.ratePlanId,
  };
}
