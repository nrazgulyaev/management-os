import { splitByWeights } from "@/lib/money";

export interface ShareAllocation {
  ownerId: string;
  ownershipShareId: string;
  sharePercent: number;
  amountMinor: bigint;
}

export interface ShareInput {
  ownerId: string;
  ownershipShareId: string;
  sharePercent: number;
}

/**
 * Distribute `amountMinor` across owners weighted by their share %.
 * Remainder goes to the largest share. Idempotent for the same input.
 *
 * Use for both pooled (project-level) and individual/hybrid (villa-level)
 * cases — caller picks the share set that applies.
 */
export function allocateBySharePercent(
  amountMinor: bigint,
  shares: ShareInput[],
): ShareAllocation[] {
  if (shares.length === 0) return [];
  const weights = shares.map((s) => s.sharePercent);
  const { allocations } = splitByWeights(amountMinor, weights);
  return shares.map((s, i) => ({
    ownerId: s.ownerId,
    ownershipShareId: s.ownershipShareId,
    sharePercent: s.sharePercent,
    amountMinor: allocations[i],
  }));
}

/** Pooled distribution by ownership share — alias for clarity. */
export const allocateProjectPoolByOwnershipShares = allocateBySharePercent;

/**
 * Individual / hybrid villa allocation: a villa with one owner's share goes
 * 100% to that share, but multiple co-owners are still possible.
 */
export function allocateVillaIndividualByOwnershipShare(
  amountMinor: bigint,
  villaShares: ShareInput[],
): ShareAllocation[] {
  return allocateBySharePercent(amountMinor, villaShares);
}

/**
 * Hybrid model: villa-specific revenue/expenses go by villa shares; shared
 * costs go by project pool shares. Caller invokes both halves and merges.
 */
export interface HybridSplit {
  villaSpecific: ShareAllocation[];
  poolShared: ShareAllocation[];
}

export function calculateHybridAllocation(
  villaAmountMinor: bigint,
  poolAmountMinor: bigint,
  villaShares: ShareInput[],
  poolShares: ShareInput[],
): HybridSplit {
  return {
    villaSpecific: allocateBySharePercent(villaAmountMinor, villaShares),
    poolShared: allocateBySharePercent(poolAmountMinor, poolShares),
  };
}

/**
 * Validate that the allocation sums to the original amount. Used as a guard
 * before persisting an allocation to the DB.
 */
export function validateAllocationTotals(
  expectedMinor: bigint,
  allocations: ShareAllocation[],
): { ok: true } | { ok: false; reason: string } {
  const sum = allocations.reduce<bigint>((acc, a) => acc + a.amountMinor, 0n);
  if (sum !== expectedMinor) {
    return {
      ok: false,
      reason: `Allocation sum ${sum} does not equal expected ${expectedMinor}`,
    };
  }
  return { ok: true };
}

/** Sum of share percents (for sanity-check warnings). */
export function totalSharePercent(shares: ShareInput[]): number {
  return shares.reduce((acc, s) => acc + s.sharePercent, 0);
}
