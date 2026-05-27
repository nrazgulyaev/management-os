/**
 * Phase 2.2 mgmt-03 — Owner tier derivation.
 *
 * Composite of villa count + projected ARR. Pure function; the
 * daily cache lives alongside the data PR.
 *
 *   platinum  → ≥ 3 villas OR projected ARR ≥ $300k
 *   gold      → 2 villas OR projected ARR ≥ $120k
 *   silver    → fallback (1 villa, low ARR)
 */

import type { OwnerTier } from "@/components/owners/tier-ring";

export interface DeriveTierInput {
  villaCount: number;
  /** Projected ARR in USD major. Pass 0 when unknown. */
  projectedArrUsd: number;
}

export function deriveTier({ villaCount, projectedArrUsd }: DeriveTierInput): OwnerTier {
  if (villaCount >= 3 || projectedArrUsd >= 300_000) return "platinum";
  if (villaCount >= 2 || projectedArrUsd >= 120_000) return "gold";
  return "silver";
}
