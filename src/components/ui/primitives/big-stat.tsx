/**
 * Arconique OS redesign — BigStat primitive.
 *
 * Large display number with a coloured currency prefix and a small
 * grey unit suffix:
 *
 *   $ 8.42B
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §5.
 *
 * Server-safe. Use this whenever a value is the headline of its card
 * (the big revenue number on the overview, the AUM number on the
 * investor cabinet, etc.). For cards with sentiment + delta, this
 * pairs naturally with `<ScoreChip>` underneath.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BigStatProps {
  /** Currency / leading symbol (e.g. "$", "Rp", "€"). Rendered in terra. */
  currency?: string;
  /** Main numeric value as a string — caller formats it (e.g. "8.42"). */
  value: React.ReactNode;
  /** Unit suffix in muted ink-3 (e.g. "B", "M", "K", "villas"). */
  unit?: string;
  /** Size tier — `default` matches the handoff; `lg` is the hero size. */
  size?: "default" | "lg";
  className?: string;
}

const SIZE_CLS: Record<NonNullable<BigStatProps["size"]>, string> = {
  default: "text-[clamp(28px,3.2vw,44px)]",
  lg: "text-[clamp(44px,5vw,76px)]",
};

export function BigStat({
  currency,
  value,
  unit,
  size = "default",
  className,
}: BigStatProps) {
  return (
    <div
      className={cn(
        "font-display font-normal leading-none tracking-[-0.02em] text-ink",
        SIZE_CLS[size],
        className,
      )}
      data-primitive="big-stat"
    >
      {currency && (
        <span className="text-terra mr-1.5" aria-hidden>
          {currency}
        </span>
      )}
      <span className="tabular-nums">{value}</span>
      {unit && (
        <span className="text-ink-3 ml-1.5 text-[0.55em] font-normal align-baseline">
          {unit}
        </span>
      )}
    </div>
  );
}
