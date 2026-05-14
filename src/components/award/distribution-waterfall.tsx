/**
 * Mega-Sprint Phase 12 — DistributionWaterfall primitive.
 *
 * Investor-grade waterfall chart: a stacked horizontal bar showing
 * how committed capital flows through called → distributed → wallet
 * → returned-to-investor stages. Each stage carries a label, an
 * absolute amount, and a tone token. Pure SVG, server component.
 *
 * Used by Investor Portal Dashboard. The "Reference 1" gradient-
 * hero visual treatment is mirrored on the top-most container so
 * the chart sits on the same ink-deep gradient as the headline
 * commitment KPI.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type WaterfallStageTone =
  | "ink"
  | "emerald"
  | "gold"
  | "terracotta"
  | "sage";

const STAGE_FILL: Record<WaterfallStageTone, string> = {
  ink: "var(--ink)",
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  terracotta: "var(--data-terracotta)",
  sage: "var(--data-sage)",
};

export interface WaterfallStage {
  /** Stage label (e.g. "Committed", "Drawn", "Distributed"). */
  label: string;
  /** Absolute amount in the same currency as the others. */
  amount: number;
  /** Optional pre-formatted display value (overrides amount default). */
  display?: string;
  /** Optional tone override; defaults to a deterministic palette. */
  tone?: WaterfallStageTone;
  /** Optional sub-label rendered under the value. */
  hint?: string;
}

export interface DistributionWaterfallProps {
  /**
   * Stages in funnel order — left to right.
   *
   * The first stage is rendered as 100% of the bar; subsequent
   * stages are scaled relative to the first. Stages with amount > 0
   * always render with at least a 4px slice for legibility.
   */
  stages: WaterfallStage[];
  /** Optional heading rendered above the chart. */
  heading?: React.ReactNode;
  /** Optional accessory rendered top-right of the header. */
  accessory?: React.ReactNode;
  /** Pre-formatted currency for the default display. */
  currency?: string;
  /** Pixel height for the chart area. Defaults to 220. */
  height?: number;
  /** When set, renders the chart on the ink-deep gradient background. */
  variant?: "surface" | "ink-deep";
  className?: string;
}

const DEFAULT_PALETTE: WaterfallStageTone[] = [
  "ink",
  "emerald",
  "gold",
  "terracotta",
  "sage",
];

function formatMoney(amount: number, currency = "USD"): string {
  if (amount === 0) return `${currency} 0`;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000)
    return `${currency} ${(amount / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${currency} ${(amount / 1_000).toFixed(1)}k`;
  return `${currency} ${amount.toFixed(0)}`;
}

export function DistributionWaterfall({
  stages,
  heading,
  accessory,
  currency = "USD",
  height = 220,
  variant = "surface",
  className,
}: DistributionWaterfallProps) {
  const base = stages[0]?.amount ?? 0;
  const isInk = variant === "ink-deep";

  return (
    <section
      className={cn(
        "rounded-3xl border shadow-soft-card overflow-hidden",
        isInk
          ? "border-transparent bg-gradient-ink-deep text-ink-inverse"
          : "border-line-soft bg-surface",
        className,
      )}
      data-stage10="distribution-waterfall"
    >
      {(heading || accessory) && (
        <header
          className={cn(
            "flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b",
            isInk ? "border-white/15" : "border-line-soft",
          )}
        >
          {heading ? (
            typeof heading === "string" ? (
              <h3
                className={cn(
                  "text-display text-[18px] md:text-[20px] leading-tight font-medium",
                  isInk ? "text-ink-inverse" : "text-ink",
                )}
              >
                {heading}
              </h3>
            ) : (
              heading
            )
          ) : (
            <span />
          )}
          {accessory && <div className="shrink-0">{accessory}</div>}
        </header>
      )}
      {stages.length === 0 ? (
        <p
          className={cn(
            "px-6 py-10 text-sm text-center",
            isInk ? "opacity-80" : "text-ink-tertiary",
          )}
        >
          No distribution data yet.
        </p>
      ) : (
        <div className="px-5 md:px-6 py-5 md:py-6 flex flex-col gap-4">
          <div
            className="flex items-stretch gap-1.5 rounded-2xl overflow-hidden"
            style={{ minHeight: Math.max(64, height - 100) }}
            role="img"
            aria-label="Distribution waterfall"
          >
            {stages.map((s, i) => {
              const tone = s.tone ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
              const widthPct =
                base > 0 ? Math.max(2, (s.amount / base) * 100) : 0;
              return (
                <div
                  key={`${s.label}-${i}`}
                  className="flex flex-col justify-end px-3 py-2.5 text-[11px] font-medium"
                  style={{
                    width: `${widthPct}%`,
                    background: STAGE_FILL[tone],
                    color: "var(--ink-inverse)",
                    minWidth: 80,
                  }}
                >
                  <span className="text-[10px] uppercase tracking-[0.16em] opacity-80 leading-none">
                    {s.label}
                  </span>
                  <span className="mt-1 text-sm font-mono tabular-nums">
                    {s.display ?? formatMoney(s.amount, currency)}
                  </span>
                  {s.hint && (
                    <span className="mt-0.5 text-[10px] opacity-80 truncate">
                      {s.hint}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <ol
            className={cn(
              "grid gap-2",
              `grid-cols-${Math.min(5, stages.length)}`,
              "text-[11px]",
            )}
          >
            {stages.map((s, i) => {
              const tone = s.tone ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
              const pct =
                base > 0 ? Math.round((s.amount / base) * 1000) / 10 : 0;
              return (
                <li
                  key={`legend-${s.label}-${i}`}
                  className="flex items-center gap-1.5"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: STAGE_FILL[tone] }}
                  />
                  <span
                    className={cn(
                      "truncate",
                      isInk ? "opacity-80" : "text-ink-tertiary",
                    )}
                  >
                    {s.label} · {pct}%
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
