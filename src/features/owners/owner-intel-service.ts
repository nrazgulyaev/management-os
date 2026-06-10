import "server-only";

/**
 * Owner-intelligence rollups — read side for the mgmt-owner-intelligence
 * cabinet (mock: cc-functional-handoff/cabinets/new/mgmt-owner-intelligence.html).
 *
 * Composes the existing CRM enrichment (`listOwnersForCrm`: tier, YTD net,
 * retention risk) with owner tenure derived from the earliest ownership
 * share, plus a monthly run-rate so the segmentation views (tier matrix,
 * churn cohort with LTV projection) can be computed without new tables.
 */

import { deriveTier } from "./derive-tier";
import { listOwnersForCrm, listOwnershipShares, type OwnerCrmRow } from "./services";
import type { WithSource } from "@/features/types";

export interface OwnerIntelRow extends OwnerCrmRow {
  /** Years since the owner's earliest ownership share started; null when unknown. */
  tenureYears: number | null;
  /** YTD net payout averaged over elapsed months — the cohort's MRR proxy. */
  monthlyRunRateMinor: bigint;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function tenureFromStarts(starts: string[]): number | null {
  if (starts.length === 0) return null;
  const earliest = starts.reduce((a, b) => (a < b ? a : b));
  const ms = Date.now() - new Date(earliest).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / MS_PER_YEAR;
}

export async function listOwnerIntel(): Promise<WithSource<OwnerIntelRow>[]> {
  const [crm, shares] = await Promise.all([listOwnersForCrm(), listOwnershipShares()]);

  const startsByOwner = new Map<string, string[]>();
  for (const s of shares) {
    if (!s.startsOn) continue;
    const list = startsByOwner.get(s.ownerId) ?? [];
    list.push(s.startsOn);
    startsByOwner.set(s.ownerId, list);
  }

  const monthsElapsed = Math.max(1, new Date().getUTCMonth() + 1);

  return crm.map((o) => ({
    ...o,
    tenureYears: tenureFromStarts(startsByOwner.get(o.id) ?? []),
    monthlyRunRateMinor: o.ytdNetMinor / BigInt(monthsElapsed),
  }));
}

/* ------------------------------------------------------------------ *
 * Segmentation — pure transforms over OwnerIntelRow.
 * ------------------------------------------------------------------ */

export type TenureBucket = "longTerm" | "fresh";
export type TierKey = ReturnType<typeof deriveTier>;

export interface TierMatrixCell {
  owners: { id: string; displayName: string }[];
  ytdNetMinor: bigint;
  /** Share of the portfolio's total YTD net, 0–100. */
  sharePct: number;
}

export type TierMatrix = Record<TierKey, Record<TenureBucket, TierMatrixCell>>;

export const LONG_TERM_YEARS = 3;

export function buildTierMatrix(rows: OwnerIntelRow[]): TierMatrix {
  const empty = (): TierMatrixCell => ({ owners: [], ytdNetMinor: 0n, sharePct: 0 });
  const matrix: TierMatrix = {
    platinum: { longTerm: empty(), fresh: empty() },
    gold: { longTerm: empty(), fresh: empty() },
    silver: { longTerm: empty(), fresh: empty() },
  };

  let total = 0n;
  for (const o of rows) {
    const bucket: TenureBucket =
      (o.tenureYears ?? 0) >= LONG_TERM_YEARS ? "longTerm" : "fresh";
    const cell = matrix[o.tier][bucket];
    cell.owners.push({ id: o.id, displayName: o.displayName });
    cell.ytdNetMinor += o.ytdNetMinor;
    total += o.ytdNetMinor;
  }

  if (total > 0n) {
    for (const tier of Object.values(matrix)) {
      for (const cell of Object.values(tier)) {
        cell.sharePct = Number((cell.ytdNetMinor * 1000n) / total) / 10;
      }
    }
  }
  return matrix;
}

export interface CohortRow {
  id: string;
  displayName: string;
  nationality: string | null;
  villaCount: number;
  riskLevel: OwnerIntelRow["riskLevel"];
  riskSignalCount: number;
  monthlyRunRateMinor: bigint;
  /** Projection horizon in days — shorter when the risk is harder. */
  horizonDays: number;
  /** Run-rate × horizon: the payout volume at risk if the owner leaves. */
  atRiskLtvMinor: bigint;
}

/** flag → 90d window (intervene now), watch → 180d (proactive touch). */
const HORIZON_DAYS: Record<"flag" | "watch", number> = { flag: 90, watch: 180 };

export function buildChurnCohort(rows: OwnerIntelRow[]): {
  cohort: CohortRow[];
  totalAtRiskLtvMinor: bigint;
  totalRunRateMinor: bigint;
} {
  const atRisk = rows.filter(
    (o): o is OwnerIntelRow & { riskLevel: "flag" | "watch" } =>
      o.riskLevel === "flag" || o.riskLevel === "watch",
  );

  const cohort = atRisk
    .map((o) => {
      const horizonDays = HORIZON_DAYS[o.riskLevel];
      const atRiskLtvMinor =
        (o.monthlyRunRateMinor * BigInt(horizonDays) * 12n) / 365n;
      return {
        id: o.id,
        displayName: o.displayName,
        nationality: o.nationality,
        villaCount: o.villaCount,
        riskLevel: o.riskLevel,
        riskSignalCount: o.riskSignalCount,
        monthlyRunRateMinor: o.monthlyRunRateMinor,
        horizonDays,
        atRiskLtvMinor,
      };
    })
    .sort((a, b) => (a.riskLevel === b.riskLevel ? 0 : a.riskLevel === "flag" ? -1 : 1));

  return {
    cohort,
    totalAtRiskLtvMinor: cohort.reduce((acc, c) => acc + c.atRiskLtvMinor, 0n),
    totalRunRateMinor: cohort.reduce((acc, c) => acc + c.monthlyRunRateMinor, 0n),
  };
}
