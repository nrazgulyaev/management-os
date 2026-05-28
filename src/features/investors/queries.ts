/**
 * Phase 2.4 dev-03 — Investors cabinet data fns.
 *
 * Surfaces:
 *   getFund / getLpsWithPositions / getLastDistribution
 *   runWaterfall (thin wrapper that loads params + LPs and calls
 *                 the canonical calculator)
 *   getCapitalCall / getDistribution
 *
 * Today stubbed.
 */

import "server-only";
import type { LpTableRow } from "@/components/investors/lp-table";
import { runWaterfall as runWaterfallPure, type WaterfallResult } from "./waterfall-calculator";

export interface FundSummary {
  id: string;
  code: string;
  name: string;
  vintage: number;
  holdYears: number;
}

export async function getFund(_id: string): Promise<FundSummary | null> {
  return null;
}

export async function getLpsWithPositions(_fundId: string): Promise<LpTableRow[]> {
  return [];
}

export interface LastDistribution {
  id: string;
  totalProceedsIdr: number;
  period: string;
}

export async function getLastDistribution(_fundId: string): Promise<LastDistribution | null> {
  return null;
}

export async function runWaterfall(_fundId: string, _proceedsIdr: number): Promise<WaterfallResult> {
  return runWaterfallPure({
    params: {
      fundId: _fundId,
      mgmtFeePct: 2,
      prefReturnPct: 8,
      catchUpPct: 100,
      carrySplitPct: 20,
    },
    proceedsIdr: _proceedsIdr,
    holdYears: 1,
    lps: [],
  });
}
