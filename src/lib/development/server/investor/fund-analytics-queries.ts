import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireInvestorSession } from "@/lib/investor-portal/session";
import {
  computeLpFundAnalytics,
  type DatedCashflowMinor,
  type LpFundAnalytics,
} from "@/features/investors/lp-fund-analytics";

/**
 * INVESTOR PORTAL — fund-level analytics loader.
 *
 * Read-only, scoped to the calling investor via requireInvestorSession()
 * + an explicit investor_id filter in every WHERE clause (defense-in-
 * depth alongside RLS 0039, mirroring src/lib/investor-portal/queries.ts
 * and gp-economics-queries.ts). NO cross-investor data is ever read.
 *
 * Builds the LP's EXACT dated cashflow series from the canonical
 * sources and hands it to the pure `computeLpFundAnalytics`:
 *
 *   - Capital calls OUT  → capital_drawdowns where status = 'received',
 *     dated by received_at (the value-date the LP actually paid in).
 *     Signed NEGATIVE (cash leaves the LP).
 *   - Distributions IN   → distribution_allocations on COMPLETED
 *     distributions, dated by distributions.effective_date.
 *     Signed POSITIVE (cash returns to the LP).
 *   - Residual NAV       → the LP's residual wallet balance
 *     (available + hold) — cash already attributed to the LP but not
 *     yet withdrawn — used as the unrealised terminal value for
 *     TVPI / MOIC and the XIRR terminal inflow.
 *
 * No migration: every field already exists. No writes — pure analytics.
 */

const toBig = (v: unknown): bigint => {
  if (v === null || v === undefined) return 0n;
  try {
    return BigInt(String(v).split(".")[0]);
  } catch {
    return 0n;
  }
};

/** ISO date (YYYY-MM-DD) from a timestamp/date column value. */
const toIsoDate = (v: unknown): string => {
  if (v === null || v === undefined) return new Date().toISOString().slice(0, 10);
  const s = String(v);
  // Already a YYYY-MM-DD date column.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

export interface LpFundAnalyticsResult {
  analytics: LpFundAnalytics;
  /** ISO timestamp the analytics were computed. */
  computedAt: string;
  /** Number of received capital calls in the series. */
  callCount: number;
  /** Number of completed distributions in the series. */
  distributionCount: number;
}

const EMPTY_RESULT: LpFundAnalyticsResult = {
  analytics: computeLpFundAnalytics({ cashflows: [] }),
  computedAt: new Date().toISOString(),
  callCount: 0,
  distributionCount: 0,
};

/**
 * Load + compute the calling investor's fund-level analytics.
 * Returns a zeroed/empty result (analytics.isEmpty === true) when the
 * DB is unavailable or the LP has no contributions yet.
 */
export async function loadLpFundAnalytics(input?: {
  targetIrr?: number;
}): Promise<LpFundAnalyticsResult> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return EMPTY_RESULT;

  const computedAt = new Date();

  // 1) Capital calls OUT — received drawdowns, dated by received_at.
  const callRows = await db.execute(sql`
    SELECT
      coalesce(d.received_at, d.requested_at) AS flow_date,
      d.amount_usd_minor AS amount_minor
    FROM capital_drawdowns d
    JOIN capital_commitments cc ON cc.id = d.commitment_id
    WHERE cc.investor_id = ${session.investorId}
      AND d.status = 'received'
    ORDER BY flow_date ASC
  `);

  // 2) Distributions IN — completed distributions, dated by effective_date,
  //    using THIS investor's actual per-allocation share (exact cents).
  const distRows = await db.execute(sql`
    SELECT
      dist.effective_date AS flow_date,
      a.total_amount_usd_minor AS amount_minor
    FROM distribution_allocations a
    JOIN distributions dist ON dist.id = a.distribution_id
    JOIN capital_commitments cc ON cc.id = a.commitment_id
    WHERE cc.investor_id = ${session.investorId}
      AND dist.status = 'completed'
    ORDER BY flow_date ASC
  `);

  // 3) Residual unrealised value — the LP's residual wallet balance.
  const [residualAgg] = await db.execute(sql`
    SELECT
      coalesce(
        sum(iw.available_balance_usd_minor + iw.hold_balance_usd_minor),
        0
      )::bigint AS residual
    FROM investor_wallets iw
    JOIN capital_commitments cc ON cc.id = iw.commitment_id
    WHERE cc.investor_id = ${session.investorId}
  `);

  const cashflows: DatedCashflowMinor[] = [];
  for (const r of callRows as Record<string, unknown>[]) {
    const cents = toBig(r.amount_minor);
    if (cents === 0n) continue;
    cashflows.push({
      date: toIsoDate(r.flow_date),
      amountMinor: -cents, // call paid in → negative for the LP
      kind: "call",
    });
  }
  for (const r of distRows as Record<string, unknown>[]) {
    const cents = toBig(r.amount_minor);
    if (cents === 0n) continue;
    cashflows.push({
      date: toIsoDate(r.flow_date),
      amountMinor: cents, // distribution received → positive
      kind: "distribution",
    });
  }

  const residualNavMinor = toBig(
    (residualAgg as Record<string, unknown> | undefined)?.residual,
  );

  const analytics = computeLpFundAnalytics({
    cashflows,
    residualNavMinor,
    navAt: computedAt.toISOString().slice(0, 10),
    targetIrr: input?.targetIrr,
  });

  return {
    analytics,
    computedAt: computedAt.toISOString(),
    callCount: (callRows as unknown[]).length,
    distributionCount: (distRows as unknown[]).length,
  };
}
