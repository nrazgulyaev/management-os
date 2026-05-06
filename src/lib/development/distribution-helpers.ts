/**
 * Pure distribution allocation algorithms. Extracted from
 * `src/lib/development/server/distributions.ts` so they're importable
 * from tests (which can't pull in `server-only`).
 *
 * No DB access — pure math over pre-loaded snapshots. See architecture
 * doc §"Stage 2.3 — Distribution computation algorithm" for the
 * specification this implements.
 */

export interface CommitmentSnapshot {
  commitmentId: string;
  commitmentCode: string;
  investorLegalName: string;
  priority: number;
  profitSharePercent: string;
  drawnUsdMinor: bigint;
  returnedCapitalUsdMinor: bigint;
  outstandingCapitalUsdMinor: bigint;
}

/**
 * Capital return: priority-ordered, ties pro-rata by outstanding amount.
 * Rounding residue absorbed by the largest allocation in the tier.
 */
export function computeCapitalReturn(
  snapshots: CommitmentSnapshot[],
  totalAmount: bigint,
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (totalAmount <= 0n) return out;

  // Group by priority.
  const tiers = new Map<number, CommitmentSnapshot[]>();
  for (const s of snapshots) {
    if (s.outstandingCapitalUsdMinor <= 0n) continue;
    const arr = tiers.get(s.priority) ?? [];
    arr.push(s);
    tiers.set(s.priority, arr);
  }

  let remaining = totalAmount;
  for (const priority of [...tiers.keys()].sort((a, b) => a - b)) {
    if (remaining <= 0n) break;
    const tier = tiers.get(priority)!;
    const tierTotalOutstanding = tier.reduce(
      (acc, s) => acc + s.outstandingCapitalUsdMinor,
      0n,
    );
    const tierAllocation =
      remaining < tierTotalOutstanding ? remaining : tierTotalOutstanding;

    let allocatedThisTier = 0n;
    let largestIdx = 0;
    let largestVal = 0n;
    for (let i = 0; i < tier.length; i++) {
      const s = tier[i];
      const share =
        (s.outstandingCapitalUsdMinor * tierAllocation) / tierTotalOutstanding;
      out.set(s.commitmentId, share);
      allocatedThisTier += share;
      if (share > largestVal) {
        largestVal = share;
        largestIdx = i;
      }
    }
    const residue = tierAllocation - allocatedThisTier;
    if (residue !== 0n) {
      const id = tier[largestIdx].commitmentId;
      out.set(id, (out.get(id) ?? 0n) + residue);
    }
    remaining -= tierAllocation;
  }

  return out;
}

/**
 * Profit distribution: weight = profit_share_percent × drawn_usd_minor.
 * Commitments with drawn=0 or profit_share=0 receive nothing.
 * Rounding residue absorbed by the largest allocation.
 */
export function computeProfitDistribution(
  snapshots: CommitmentSnapshot[],
  totalAmount: bigint,
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (totalAmount <= 0n) return out;

  type Weighted = { id: string; weight: bigint };
  const weighted: Weighted[] = [];
  let totalWeight = 0n;
  for (const s of snapshots) {
    if (s.drawnUsdMinor <= 0n) continue;
    const pctScaled = BigInt(
      Math.round(Number(s.profitSharePercent) * 10000),
    );
    if (pctScaled <= 0n) continue;
    const w = pctScaled * s.drawnUsdMinor;
    weighted.push({ id: s.commitmentId, weight: w });
    totalWeight += w;
  }
  if (totalWeight === 0n) return out;

  let allocated = 0n;
  let largestIdx = 0;
  let largestShare = 0n;
  for (let i = 0; i < weighted.length; i++) {
    const w = weighted[i];
    const share = (totalAmount * w.weight) / totalWeight;
    out.set(w.id, share);
    allocated += share;
    if (share > largestShare) {
      largestShare = share;
      largestIdx = i;
    }
  }
  const residue = totalAmount - allocated;
  if (residue !== 0n) {
    const id = weighted[largestIdx].id;
    out.set(id, (out.get(id) ?? 0n) + residue);
  }

  return out;
}

export function sumMap(m: Map<string, bigint>): bigint {
  let acc = 0n;
  for (const v of m.values()) acc += v;
  return acc;
}
