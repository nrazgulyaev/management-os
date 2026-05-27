import * as React from "react";

/**
 * Phase 2.2 mgmt-03 — TierRing.
 *
 * Single-glyph tier indicator. Compact for table rows; the `verbose`
 * variant adds the tier word to the right.
 */

export type OwnerTier = "platinum" | "gold" | "silver";

export interface TierRingProps {
  tier: OwnerTier;
  verbose?: boolean;
  className?: string;
}

const LABEL: Record<OwnerTier, string> = {
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
};

export function TierRing({ tier, verbose, className }: TierRingProps) {
  return (
    <span className={`tier-ring ${tier}${className ? ` ${className}` : ""}`} title={LABEL[tier]}>
      <span className="ring" aria-hidden />
      {verbose && <span className="lbl">{LABEL[tier]}</span>}
    </span>
  );
}
