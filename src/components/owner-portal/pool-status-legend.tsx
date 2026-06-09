import * as React from "react";

/**
 * P1 owner-rental-pool — PoolStatusLegend.
 *
 * The three-state legend for the rental-pool surface (in pool / cooling /
 * out), used on both the calendar pool manager and the stays page. Pure
 * presentational: the dot colours map to the owner-portal Layer-B tokens
 * (forest = bookable, gold = cooling-off transition, terra = personal use).
 *
 * Optional `counts` renders the live tally per state so the owner reads
 * "3 in pool · 1 cooling · 0 out" at a glance.
 */

export interface PoolStatusCounts {
  inPool: number;
  cooling: number;
  outOfPool: number;
}

const ITEMS: ReadonlyArray<{
  key: keyof PoolStatusCounts;
  label: string;
  dot: string;
  hint: string;
}> = [
  {
    key: "inPool",
    label: "In rental pool",
    dot: "var(--forest)",
    hint: "Bookable by guests",
  },
  {
    key: "cooling",
    label: "Cooling-off",
    dot: "var(--gold)",
    hint: "Transition pending (14-day window)",
  },
  {
    key: "outOfPool",
    label: "Out of pool",
    dot: "var(--terra)",
    hint: "Reserved for your personal use",
  },
];

export interface PoolStatusLegendProps {
  counts?: PoolStatusCounts;
  className?: string;
}

export function PoolStatusLegend({ counts, className }: PoolStatusLegendProps) {
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-5 gap-y-2${className ? ` ${className}` : ""}`}
      aria-label="Rental-pool status legend"
    >
      {ITEMS.map((it) => {
        const n = counts ? counts[it.key] : null;
        return (
          <li key={it.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: it.dot }}
            />
            <span className="text-[12px] text-ink-secondary">
              {it.label}
              {n !== null && (
                <span className="ml-1.5 tabular-nums text-ink-tertiary">
                  · {n}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
