import * as React from "react";
import type { VendorScoreBand } from "@/features/vendors/scoring";

/**
 * Phase 2.2 dev-04 — VendorScore.
 *
 * Compact numeric badge. Tone driven by the spec bands:
 *   high ≥ 85 (ok-green) · mid 65–84 (warn-amber) · low <65 (danger-red)
 */

function bandFor(score: number): VendorScoreBand {
  if (score >= 85) return "high";
  if (score >= 65) return "mid";
  return "low";
}

export interface VendorScoreProps {
  score: number;
  className?: string;
  /** Default false. Pass true to render the score + numeric only (no dot). */
  compact?: boolean;
}

export function VendorScore({ score, className, compact }: VendorScoreProps) {
  const band = bandFor(score);
  return (
    <span className={`vendor-score ${band}${className ? ` ${className}` : ""}`}>
      {!compact && <span className="dot" aria-hidden />}
      <span className="num mono">{score}</span>
    </span>
  );
}
