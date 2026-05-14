/**
 * Sprint LD-1 — DotGridStreak primitive.
 *
 * Reference 1 "13 Days · 109 hours" streak pattern: a square grid of
 * dots, filled vs unfilled in a known ratio. Renders as pure CSS
 * grid — no SVG, no client state. Used for trust signals ("trusted
 * by 200+ villas"), progress streaks, and adoption counters on the
 * landing pages.
 *
 * The tone choice tints the filled dots; unfilled dots use the
 * design-system line-soft so the grid silhouette stays legible on
 * both light and dark surfaces.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type DotGridTone = "emerald" | "gold" | "coral" | "sage" | "ink";

const FILLED_CLS: Record<DotGridTone, string> = {
  emerald: "bg-success",
  gold: "bg-gold",
  coral: "bg-warning",
  sage: "bg-info",
  ink: "bg-ink",
};

export interface DotGridStreakProps {
  /** Total cells in the grid. */
  totalDots: number;
  /** Number of cells rendered as "filled". */
  filledDots: number;
  /** Headline shown above the grid (e.g. "Bali villas"). */
  label: string;
  /** Sub-line shown below the headline (e.g. "across 14 owners"). */
  sublabel?: string;
  /** Tone for filled dots. */
  tone?: DotGridTone;
  /**
   * Optional column count. When omitted, the grid auto-fits dots
   * across ~20 columns regardless of total.
   */
  columns?: number;
  className?: string;
}

export function DotGridStreak({
  totalDots,
  filledDots,
  label,
  sublabel,
  tone = "emerald",
  columns,
  className,
}: DotGridStreakProps) {
  const safeTotal = Math.max(0, totalDots);
  const safeFilled = Math.max(0, Math.min(filledDots, safeTotal));
  const cols = columns ?? Math.min(20, Math.max(8, Math.ceil(Math.sqrt(safeTotal * 1.6))));

  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 md:p-8 flex flex-col gap-4",
        className,
      )}
      data-stage10="dot-grid-streak"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-display text-[32px] md:text-[40px] leading-none font-medium font-mono tabular-nums text-ink">
            {safeFilled}
          </p>
          <p className="text-sm font-medium text-ink">{label}</p>
          {sublabel && (
            <p className="text-xs text-ink-tertiary leading-relaxed">
              {sublabel}
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary shrink-0">
          {safeFilled} / {safeTotal}
        </span>
      </header>
      <div
        role="img"
        aria-label={`${safeFilled} of ${safeTotal} ${label}`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: safeTotal }).map((_, i) => {
          const isFilled = i < safeFilled;
          return (
            <span
              key={i}
              className={cn(
                "block aspect-square rounded-sm",
                isFilled ? FILLED_CLS[tone] : "bg-line-soft",
              )}
              aria-hidden
            />
          );
        })}
      </div>
    </section>
  );
}
