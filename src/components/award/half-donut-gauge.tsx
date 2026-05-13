/**
 * Sprint 4 — HalfDonutGauge primitive.
 *
 * The "36% Growth rate" / "Budget burn this month" dial pattern from
 * Reference 1. Pure SVG (no Recharts) so it renders as a server
 * component and stays light. Half-circle (semicircle), filled
 * proportionally to `value / max`, with an optional legend listing
 * the segments below.
 *
 * Variant maps to the existing Stage 10.6.C.1 data-tone tokens
 * (--data-emerald / gold / sage / terracotta). The track is always
 * --line-soft; the fill uses the variant.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type HalfDonutTone =
  | "emerald"
  | "gold"
  | "sage"
  | "terracotta"
  | "ink";

const TONE_VAR: Record<HalfDonutTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
  ink: "var(--ink)",
};

export interface HalfDonutLegendItem {
  label: string;
  /** Optional override colour (defaults to variant token). */
  color?: string;
}

export interface HalfDonutGaugeProps {
  value: number;
  max: number;
  /** Big centre label (e.g. "36% Growth rate"). Two-line by design. */
  label?: React.ReactNode;
  variant?: HalfDonutTone;
  legend?: HalfDonutLegendItem[];
  /** Optional accessible description. */
  ariaLabel?: string;
  className?: string;
}

export function HalfDonutGauge({
  value,
  max,
  label,
  variant = "emerald",
  legend,
  ariaLabel,
  className,
}: HalfDonutGaugeProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const stroke = TONE_VAR[variant];

  // Geometry — half-circle from (R, R) sweeping over the top half.
  // Centre is (cx, cy); radius R; stroke width sized for hero feel.
  const W = 220;
  const H = 130;
  const cx = W / 2;
  const cy = H - 10; // leave a touch of bottom padding
  const R = 90;
  const SW = 18;

  // Length of the half-circle path = π · R.
  const arcLength = Math.PI * R;
  const fillLength = arcLength * ratio;
  const remainder = arcLength - fillLength;

  // Pre-computed semicircle path from left → up → right.
  const path = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

  return (
    <div
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 md:p-7 flex flex-col items-center gap-4",
        className,
      )}
      data-stage10="half-donut-gauge"
      data-tone={variant}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        className="max-w-[240px]"
        role="img"
        aria-label={ariaLabel ?? `${Math.round(ratio * 100)} percent`}
      >
        {/* Track */}
        <path
          d={path}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={SW}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={SW}
          strokeLinecap="round"
          strokeDasharray={`${fillLength} ${remainder}`}
        />
      </svg>
      {label && (
        <div className="text-center -mt-6 md:-mt-8 mb-1">
          {typeof label === "string" ? (
            <p className="text-display text-[26px] md:text-[32px] leading-none font-medium text-ink tabular-nums">
              {label}
            </p>
          ) : (
            label
          )}
        </div>
      )}
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
          {legend.map((item, i) => (
            <li
              key={`${item.label}-${i}`}
              className="inline-flex items-center gap-1.5"
            >
              <span
                aria-hidden
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color ?? stroke }}
              />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
