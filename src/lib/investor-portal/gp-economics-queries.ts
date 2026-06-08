import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireInvestorSession } from "./session";

/**
 * feat/w1de-lp-dashboard-gp-waterfall-copilot — investor GP-economics
 * position loader.
 *
 * Read-only, scoped to the calling investor via requireInvestorSession()
 * + an explicit investor_id filter (defense-in-depth alongside RLS 0039,
 * mirroring src/lib/investor-portal/queries.ts).
 *
 * Returns the inputs the canonical waterfall needs to show THIS investor
 * the LP/GP economics of their position:
 *   - contributed  = total drawn capital (USD MINOR / cents)
 *   - distributed  = total returned capital + profit distributed (cents)
 *   - profitShare  = commitment-weighted blended profit_share_percent
 *
 * Self-contained NEW file (slight query duplication vs queries.ts is
 * acceptable for v1) so this unit owns no shared module.
 */

export interface InvestorGpPosition {
  contributedUsdMinor: bigint;
  distributedUsdMinor: bigint;
  /** Commitment-weighted blended profit slice, 0..100. */
  profitSharePercent: number;
  hasPosition: boolean;
}

const toBig = (v: unknown): bigint => {
  if (v === null || v === undefined) return 0n;
  try {
    return BigInt(String(v).split(".")[0]);
  } catch {
    return 0n;
  }
};

export async function loadInvestorGpPosition(): Promise<InvestorGpPosition | null> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return null;

  const [agg] = await db.execute(sql`
    SELECT
      coalesce(sum(iw.total_drawn_usd_minor), 0)::bigint AS contributed,
      coalesce(
        sum(
          iw.total_returned_capital_usd_minor
            + iw.total_profit_distributed_usd_minor
        ),
        0
      )::bigint AS distributed,
      -- commitment-weighted blended profit share
      CASE
        WHEN coalesce(sum(cc.committed_amount_usd_minor), 0) > 0
        THEN sum(cc.profit_share_percent * cc.committed_amount_usd_minor)
               / sum(cc.committed_amount_usd_minor)
        ELSE 0
      END AS blended_profit_share,
      count(*)::int AS commitment_count
    FROM capital_commitments cc
    LEFT JOIN investor_wallets iw ON iw.commitment_id = cc.id
    WHERE cc.investor_id = ${session.investorId}
  `);

  const r = (agg ?? {}) as Record<string, unknown>;
  const count = Number(r.commitment_count ?? 0);

  return {
    contributedUsdMinor: toBig(r.contributed),
    distributedUsdMinor: toBig(r.distributed),
    profitSharePercent: Number(r.blended_profit_share ?? 0),
    hasPosition: count > 0,
  };
}
