/**
 * Arconique OS redesign — ScoreChip primitive.
 *
 * Tiny delta pill, typically `▲ 9.3%` or `▼ 1.2pp`. Lives anywhere a
 * change-vs-previous-period gets surfaced (KPI cards, table rows,
 * trend captions).
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §4.
 * Tones map to the new brand axis. The default `terra` is for neutral
 * "+X%" callouts that aren't semantically success/danger.
 *
 * The arrow glyph is a Unicode triangle so the chip stays single-line
 * + serif-friendly without bringing a lucide icon along.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type ScoreChipTone =
  | "terra"
  | "olive"
  | "sea"
  | "sand"
  | "success"
  | "warning"
  | "danger"
  | "ink";

export interface ScoreChipProps {
  /** Trend direction. `flat` shows a bullet, `up`/`down` show triangles. */
  trend?: "up" | "down" | "flat";
  /** The numeric / textual delta — caller formats it (e.g. "9.3%", "1.2pp"). */
  children: React.ReactNode;
  tone?: ScoreChipTone;
  className?: string;
}

const TONE_CLS: Record<ScoreChipTone, string> = {
  terra: "bg-terra-soft text-terra-deep",
  olive: "bg-olive-soft text-olive-deep",
  sea: "bg-sea-soft text-sea-deep",
  sand: "bg-sand-soft text-ink-2",
  success: "bg-olive-soft text-olive-deep",
  warning: "bg-[var(--color-warning-soft-2)] text-[oklch(0.5_0.13_80)]",
  danger: "bg-[var(--color-danger-soft-2)] text-danger",
  ink: "bg-ink-deep text-white",
};

const TREND_GLYPH: Record<NonNullable<ScoreChipProps["trend"]>, string> = {
  up: "▲",
  down: "▼",
  flat: "•",
};

export function ScoreChip({
  trend,
  children,
  tone = "terra",
  className,
}: ScoreChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[12.5px] font-medium leading-none tabular-nums",
        TONE_CLS[tone],
        className,
      )}
    >
      {trend && (
        <span aria-hidden className="text-[10px]">
          {TREND_GLYPH[trend]}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
