/**
 * Arconique OS redesign — DomeDonut primitive.
 *
 * Dark feature donut — a 180×180 circular ink-deep surface with a
 * subtle dome gradient and a single terra arc showing a percentage.
 * Use exactly once per page (the "wow" radial moment).
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §6.
 *
 * Server-safe. The arc is rendered via SVG strokeDasharray so we don't
 * need recharts — keeps the file tiny and lets the dome sit inside
 * any flex/grid layout without ResponsiveContainer measurement quirks.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DomeDonutProps {
  /** 0–100, the arc fill. */
  percent: number;
  /** Centered headline (defaults to the percent itself, e.g. "36%"). */
  label?: React.ReactNode;
  /** Caption under the label. */
  caption?: React.ReactNode;
  /** Size in px (square). Default 180. */
  size?: number;
  /** Stroke thickness in px. Default 12. */
  thickness?: number;
  /** Override the arc color (defaults to terra). */
  arcColor?: string;
  /** Override the track color (defaults to a warm dim). */
  trackColor?: string;
  className?: string;
}

export function DomeDonut({
  percent,
  label,
  caption,
  size = 180,
  thickness = 12,
  arcColor = "var(--color-terra)",
  trackColor = "rgba(180, 150, 120, 0.18)",
  className,
}: DomeDonutProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className={cn(
        "relative grid place-items-center text-white shadow-redesign-soft",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background:
          "radial-gradient(140% 100% at 30% 20%, oklch(0.32 0.018 65), var(--color-ink-deep) 60%)",
      }}
      data-primitive="dome-donut"
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        <div className="font-display text-[clamp(28px,2.4vw,38px)] leading-none tracking-[-0.01em] tabular-nums">
          {label ?? `${Math.round(clamped)}%`}
        </div>
        {caption && (
          <div className="mt-1.5 text-[11px] text-white/70 leading-tight">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
