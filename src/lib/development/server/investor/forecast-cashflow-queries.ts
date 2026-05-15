import "server-only";

import { eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
  capitalDrawdowns,
  distributions,
} from "@/lib/db/schema/investor-capital";

/**
 * Sprint MD-4 Phase 3.1 — Forecast cashflow loader for the
 * Investor Portal dashboard's AreaChartCard.
 *
 * Produces a per-quarter projection covering the next 4 quarters by:
 *   - Outflows (LP perspective = "calls owed") taken from
 *     `capital_drawdowns.dueDate` where status IS 'requested'.
 *     Calls owed by quarter become the projected outflow line.
 *   - Inflows (LP perspective = "distributions inbound") taken from
 *     `distributions.effectiveDate` where status IN 'declared' /
 *     'executing'. The cumulative balance is the running sum of
 *     (inflow - outflow) starting from zero, anchored at "today".
 *
 * Scope-cut documented in closure: there's no first-class
 * "forecasted balance" snapshot on either table, so the loader
 * surfaces the planned cashflow events and the consumer renders
 * them as the area-chart series. Historical-only fallback (no
 * forward-looking events) is supported — returns 4 quarters with
 * zero amounts when no future drawdowns + distributions exist.
 */

export interface ForecastQuarterRow {
  /** ISO label "Q1 2026" etc. */
  quarter: string;
  /** Start date for ordering. */
  quarterStart: string;
  projectedInflowUsdMinor: number;
  projectedOutflowUsdMinor: number;
  cumulativeBalanceUsdMinor: number;
}

function quarterLabel(date: Date): string {
  const month = date.getUTCMonth();
  const q = Math.floor(month / 3) + 1;
  return `Q${q} ${date.getUTCFullYear()}`;
}

function startOfQuarter(date: Date): Date {
  const d = new Date(date);
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
}

function addQuarters(date: Date, n: number): Date {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n * 3, 1),
  );
}

export async function loadForecastCashflow(
  investorId: string,
  quarterCount = 4,
): Promise<ForecastQuarterRow[]> {
  const db = getDb();
  const now = new Date();
  const buckets: ForecastQuarterRow[] = [];
  for (let i = 0; i < quarterCount; i++) {
    const qStart = addQuarters(startOfQuarter(now), i);
    buckets.push({
      quarter: quarterLabel(qStart),
      quarterStart: qStart.toISOString().slice(0, 10),
      projectedInflowUsdMinor: 0,
      projectedOutflowUsdMinor: 0,
      cumulativeBalanceUsdMinor: 0,
    });
  }

  if (!db) return buckets;

  // Find investor's commitments so we can scope drawdowns and
  // distributions to LP-relevant rows only. Distributions are
  // project-scoped — we map LP commitments → projects → distributions.
  const commitments = await db
    .select({
      id: capitalCommitments.id,
      projectId: capitalCommitments.projectId,
      committedAmountUsdMinor: capitalCommitments.committedAmountUsdMinor,
      totalCommittedAtProjectUsdMinor:
        capitalCommitments.committedAmountUsdMinor,
    })
    .from(capitalCommitments)
    .where(eq(capitalCommitments.investorId, investorId));

  if (commitments.length === 0) return buckets;

  const commitmentIds = commitments.map((c) => c.id);
  const projectIds = Array.from(
    new Set(
      commitments
        .map((c) => c.projectId)
        .filter((id): id is string => id !== null),
    ),
  );

  // Outflows: pending drawdowns (LP owes capital).
  const pendingDrawdowns = await db
    .select({
      dueDate: capitalDrawdowns.dueDate,
      amountUsdMinor: capitalDrawdowns.amountUsdMinor,
    })
    .from(capitalDrawdowns)
    .where(
      sql`${inArray(capitalDrawdowns.commitmentId, commitmentIds)} AND ${capitalDrawdowns.status} IN ('requested', 'overdue') AND ${gte(capitalDrawdowns.dueDate, buckets[0].quarterStart)}`,
    );

  for (const d of pendingDrawdowns) {
    const date = new Date(`${d.dueDate}T00:00:00Z`);
    const q = quarterLabel(date);
    const bucket = buckets.find((b) => b.quarter === q);
    if (bucket) {
      bucket.projectedOutflowUsdMinor += Number(d.amountUsdMinor);
    }
  }

  // Inflows: per-investor share of upcoming distributions. We pro-
  // rate the total distribution by the LP's commitment share within
  // the project (committedAmountUsdMinor / total committed in
  // project). This is approximate — the precise allocation lives in
  // `distribution_allocations` but that table may not have planned
  // rows for declared-but-not-executed distributions.
  if (projectIds.length > 0) {
    const upcomingDistributions = await db
      .select({
        projectId: distributions.projectId,
        effectiveDate: distributions.effectiveDate,
        totalAmountUsdMinor: distributions.totalAmountUsdMinor,
      })
      .from(distributions)
      .where(
        sql`${inArray(distributions.projectId, projectIds)} AND ${distributions.status} IN ('declared', 'executing') AND ${gte(distributions.effectiveDate, buckets[0].quarterStart)}`,
      );

    // Compute total committed per project across all investors so
    // we can pro-rate. We don't filter to current LP here — we need
    // the denominator.
    const totalsPerProject = await db
      .select({
        projectId: capitalCommitments.projectId,
        total: sql<string>`SUM(${capitalCommitments.committedAmountUsdMinor})::text`,
      })
      .from(capitalCommitments)
      .where(inArray(capitalCommitments.projectId, projectIds))
      .groupBy(capitalCommitments.projectId);
    const totalByProject = new Map<string, bigint>();
    for (const t of totalsPerProject) {
      if (t.projectId)
        totalByProject.set(t.projectId, BigInt(t.total ?? "0"));
    }

    const myCommitmentByProject = new Map<string, bigint>();
    for (const c of commitments) {
      if (c.projectId) {
        myCommitmentByProject.set(
          c.projectId,
          BigInt(c.committedAmountUsdMinor),
        );
      }
    }

    for (const d of upcomingDistributions) {
      if (!d.projectId) continue;
      const total = totalByProject.get(d.projectId) ?? 0n;
      const mine = myCommitmentByProject.get(d.projectId) ?? 0n;
      if (total === 0n) continue;
      const myShare =
        (BigInt(d.totalAmountUsdMinor) * mine) / total;
      const date = new Date(`${d.effectiveDate}T00:00:00Z`);
      const q = quarterLabel(date);
      const bucket = buckets.find((b) => b.quarter === q);
      if (bucket) {
        bucket.projectedInflowUsdMinor += Number(myShare);
      }
    }
  }

  // Cumulative balance running from "today".
  let running = 0;
  for (const b of buckets) {
    running += b.projectedInflowUsdMinor - b.projectedOutflowUsdMinor;
    b.cumulativeBalanceUsdMinor = running;
  }

  return buckets;
}
