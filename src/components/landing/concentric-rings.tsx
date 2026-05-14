/**
 * Sprint LD-1 — ConcentricRings primitive.
 *
 * Reference 1 "Annual profits" pattern: nested circles, largest →
 * smallest, each labelled with its value (e.g. "$14K" on the outer
 * ring, "$4K" in the center). Pure SVG; no client state.
 *
 * Used to visualise tiered breakdowns — ROI tiers, occupancy levels,
 * portfolio composition, project cost composition.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type RingFillToken =
  | "ink-deep"
  | "ink"
  | "emerald"
  | "gold"
  | "coral"
  | "sage";

const FILL_VAR: Record<RingFillToken, string> = {
  "ink-deep": "var(--ink-deep, var(--ink))",
  ink: "var(--ink)",
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  coral: "var(--data-terracotta)",
  sage: "var(--data-sage)",
};

export interface ConcentricRing {
  /** Pre-formatted label rendered next to the ring (e.g. "$14K"). */
  label: string;
  /** Tone for the ring fill. */
  fill?: RingFillToken;
  /** Optional sub-line for the ring caption. */
  value?: string;
}

export interface ConcentricRingsProps {
  /** Rings from outer (largest) to inner (smallest). 2–5 rings. */
  rings: ConcentricRing[];
  /** Optional caption rendered in the dead-center. */
  centerLabel?: string;
  /** Pixel size (square). Defaults to 320. */
  size?: number;
  /** Optional heading shown above the chart. */
  heading?: React.ReactNode;
  /** Optional sub-line shown below the chart. */
  subline?: React.ReactNode;
  className?: string;
}

export function ConcentricRings({
  rings,
  centerLabel,
  size = 320,
  heading,
  subline,
  className,
}: ConcentricRingsProps) {
  const count = Math.min(5, Math.max(1, rings.length));
  // Outer ring radius is 48% of viewport; each subsequent ring shrinks
  // by a constant step so labels can sit between rings on the diagonal.
  const radii = Array.from({ length: count }).map(
    (_, i) => 48 - i * (38 / Math.max(1, count - 1)),
  );

  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 md:p-8 flex flex-col gap-4",
        className,
      )}
      data-stage10="concentric-rings"
    >
      {heading && (
        <header className="flex flex-col gap-1">
          {typeof heading === "string" ? (
            <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
              {heading}
            </h3>
          ) : (
            heading
          )}
        </header>
      )}
      <div
        className="relative mx-auto"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label="Concentric rings chart"
        >
          {rings.slice(0, count).map((r, i) => {
            const tone = r.fill ?? "ink";
            const radius = radii[i];
            const opacity = 0.35 + (i / Math.max(1, count - 1)) * 0.55;
            return (
              <g key={`${r.label}-${i}`}>
                <circle
                  cx={50}
                  cy={50}
                  r={radius}
                  fill={FILL_VAR[tone]}
                  opacity={opacity}
                />
                <text
                  x={50 + radius - 4}
                  y={50}
                  textAnchor="end"
                  fontSize={5}
                  fontFamily="var(--font-mono)"
                  fill="var(--ink-inverse)"
                  dominantBaseline="middle"
                >
                  {r.label}
                </text>
              </g>
            );
          })}
          {centerLabel && (
            <text
              x={50}
              y={50}
              textAnchor="middle"
              fontSize={6}
              fontFamily="var(--font-mono)"
              fill="var(--ink-inverse)"
              dominantBaseline="middle"
            >
              {centerLabel}
            </text>
          )}
        </svg>
      </div>
      <ol className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
        {rings.slice(0, count).map((r, i) => {
          const tone = r.fill ?? "ink";
          return (
            <li
              key={`legend-${r.label}-${i}`}
              className="inline-flex items-center gap-1.5 text-ink-tertiary"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: FILL_VAR[tone] }}
              />
              {r.label}
              {r.value && (
                <span className="text-ink-secondary">· {r.value}</span>
              )}
            </li>
          );
        })}
      </ol>
      {subline && (
        <p className="text-xs text-ink-tertiary text-center leading-relaxed">
          {subline}
        </p>
      )}
    </section>
  );
}
