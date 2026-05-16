/**
 * Arconique OS redesign — ConcentricBubbles primitive.
 *
 * Nested-rings "Annual profit" chart: 3–5 circles stacked bottom-
 * centered, each sized as a percentage of the largest ring. The
 * largest ring is the outermost; each subsequent ring nests inside.
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §7.
 *
 * Server-safe — pure CSS positioning + a `color-mix` background ramp
 * per ring. No SVG, no recharts; works inside any flex/grid parent.
 *
 * Caller passes `rings` largest-first. The component computes each
 * ring's relative size against the max value in the list.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ConcentricBubblesRing {
  /** Display label (shown at the top of the ring). */
  label: string;
  /** Value used for the ring's relative size. */
  value: number;
}

export interface ConcentricBubblesProps {
  /** Largest-first list of rings. 3–5 recommended; up to 6 supported. */
  rings: ConcentricBubblesRing[];
  /** Max width of the chart container in px. */
  maxWidth?: number;
  /** Currency symbol shown next to each label in terra. Defaults to "$". */
  currency?: string;
  /** Override the base ring color (defaults to terra). */
  baseColor?: string;
  className?: string;
}

export function ConcentricBubbles({
  rings,
  maxWidth = 360,
  currency = "$",
  baseColor = "var(--color-terra)",
  className,
}: ConcentricBubblesProps) {
  if (rings.length === 0) return null;
  const max = Math.max(...rings.map((r) => Math.abs(r.value) || 0)) || 1;

  return (
    <div
      className={cn("relative w-full mx-auto", className)}
      style={{ maxWidth, aspectRatio: "1 / 1" }}
      data-primitive="concentric-bubbles"
    >
      {rings.map((ring, i) => {
        // Percent of the outer (largest) ring. Smallest ring lands
        // around 25–35% of max — operator can pre-shape data.
        const sizePct = (Math.abs(ring.value) / max) * 100;
        const leftPct = (100 - sizePct) / 2;
        // Smooth ramp 30% → 30% + (n-1)*14%; biggest = ~84% terra.
        const mixPct = 30 + i * 14;
        const isInnermost = i === rings.length - 1;
        return (
          <div
            key={i}
            className="absolute rounded-full font-display tracking-[-0.01em] grid items-start justify-items-center"
            style={{
              width: `${sizePct}%`,
              height: `${sizePct}%`,
              left: `${leftPct}%`,
              bottom: 0,
              paddingTop: 12,
              background: `color-mix(in oklch, ${baseColor} ${mixPct}%, white)`,
              color: isInnermost ? "white" : "var(--color-terra-deep)",
            }}
          >
            <span className="text-[clamp(13px,1.4vw,18px)] leading-none">
              <span
                className={cn(isInnermost ? "text-white/80" : "text-terra")}
                aria-hidden
              >
                {currency}
              </span>
              {ring.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
