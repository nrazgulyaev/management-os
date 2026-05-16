/**
 * Stage 10.B — DashboardKPI primitive.
 *
 * Drill-aware KPI card with traffic-light variance + delta + on-target
 * indicator. Extends MetricCard's mass + delta semantics with:
 *   - traffic-light status (green / amber / red) tied to a threshold
 *   - optional drill-down click handler that opens a side panel
 *   - optional sparkline slot (uses existing Sparkline component upstream)
 *   - footer slot for context ("vs. budget" / "as of {date}")
 *
 * Used by: 10.G CFO Drill-Down, 10.J Owner Confidence, 10.K Front Office
 * cockpit, ops-manager portfolio cockpit.
 *
 * Reference patterns (research-summary.md theme 3 + ref-apps Mosaic /
 * Cube / Fathom): every aggregate must be clickable to source.
 *
 * Server component — interactivity comes from the parent passing in
 * onDrill (which can be a server action) or a Link.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus, ChevronRight } from "lucide-react";

export type KpiStatus = "good" | "warn" | "bad" | "neutral";

/**
 * Stage 10.6.C.1 — `variant` controls visual mass.
 *  - "default" (28px value, p-5, rounded-md) — existing 10.B behavior
 *  - "hero"    (56-72px value, p-8, rounded-3xl) — the primary KPI in
 *               a cabinet, optionally with a gradient background
 */
export type KpiVariant = "default" | "hero";
export type KpiTone =
  // Legacy 10.6.C.1 tones — kept for backwards compatibility with the
  // existing 28 consumer files. Render via the legacy emerald/gold/
  // coral/ink-deep gradients.
  | "surface"
  | "emerald-soft"
  | "gold-soft"
  | "coral-soft"
  | "ink-deep"
  // Arconique OS redesign tones (additive). Source: COMPONENTS.md §3.
  // These map to the new brand axes — terra / olive / sea / sand /
  // ink-warm. Use these on freshly-built pages; legacy pages migrate
  // over time.
  | "terra"
  | "olive"
  | "sea"
  | "sand"
  | "warm"
  | "ink-warm";

export interface DashboardKpiProps {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: number; label?: string };
  status?: KpiStatus;
  hint?: string;
  footer?: React.ReactNode;
  sparkline?: React.ReactNode;
  drillHref?: string;
  onClick?: () => void;
  className?: string;
  /** Stage 10.6.C.1 — visual variant. Default preserves existing 10.B behavior. */
  variant?: KpiVariant;
  /** Stage 10.6.C.1 — tone (background) for hero variant. */
  tone?: KpiTone;
}

const TONE_CLS: Record<KpiTone, string> = {
  // Legacy
  "surface": "bg-surface",
  "emerald-soft": "bg-gradient-emerald-soft",
  "gold-soft": "bg-gradient-gold-soft",
  "coral-soft": "bg-gradient-coral-soft",
  "ink-deep": "bg-gradient-ink-deep text-ink-inverse",
  // Redesign (additive). Tonal soft-fill cards from the handoff —
  // each pairs a `-tint` background with a `-deep` accent for the
  // sparkline / icon. The dark `ink-warm` is the "hero KPI" slot
  // (one per row).
  "terra": "bg-terra-tint",
  "olive": "bg-olive-tint",
  "sea": "bg-sea-tint",
  "sand": "bg-sand-soft",
  "warm": "bg-surface-warm",
  "ink-warm": "bg-ink-warm text-white",
};

const STATUS_RING: Record<KpiStatus, string> = {
  good: "border-l-2 border-l-success",
  warn: "border-l-2 border-l-warning",
  bad: "border-l-2 border-l-danger",
  neutral: "",
};

export function DashboardKpi(props: DashboardKpiProps) {
  const {
    label,
    value,
    unit,
    delta,
    status = "neutral",
    hint,
    footer,
    sparkline,
    drillHref,
    onClick,
    className,
    variant = "default",
    tone = "surface",
  } = props;
  const isHero = variant === "hero";
  // Redesign: `ink-warm` is also a dark-bg tone that needs inverse
  // foregrounds, same as the legacy `ink-deep`.
  const isDarkTone = tone === "ink-deep" || tone === "ink-warm";

  const trend = delta
    ? delta.value > 0
      ? "up"
      : delta.value < 0
        ? "down"
        : "flat"
    : null;
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-danger"
        : "text-ink-tertiary";

  const interactive = Boolean(drillHref || onClick);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-label",
            isDarkTone && "text-ink-inverse opacity-80",
          )}
        >
          {label}
        </span>
        {interactive && (
          <ChevronRight
            className={cn(
              "w-4 h-4",
              isDarkTone ? "text-ink-inverse opacity-70" : "text-ink-tertiary",
            )}
            aria-hidden
          />
        )}
      </div>
      <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
        <span
          className={cn(
            "text-display font-medium",
            isHero
              ? "text-[56px] leading-[1.0] md:text-[64px] md:leading-[0.95]"
              : "text-[28px] leading-[32px]",
            isDarkTone ? "text-ink-inverse" : "text-ink",
          )}
        >
          {value}
        </span>
        {unit && (
          <span
            className={cn(
              isHero ? "text-base" : "text-sm",
              isDarkTone ? "text-ink-inverse opacity-70" : "text-ink-tertiary",
            )}
          >
            {unit}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 gap-3 min-h-[1rem]">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
              trendColor,
            )}
          >
            <TrendIcon className="w-3.5 h-3.5" />
            {delta.value > 0 ? "+" : ""}
            {delta.value.toFixed(1)}%
            {delta.label && (
              <span className="text-ink-tertiary font-normal ml-1">
                {delta.label}
              </span>
            )}
          </span>
        ) : (
          <span />
        )}
        {hint && (
          <span className="text-xs text-ink-tertiary truncate">{hint}</span>
        )}
      </div>
      {sparkline && <div className="mt-2">{sparkline}</div>}
      {footer && (
        <div className="mt-2 text-xs text-ink-tertiary border-t border-line-soft pt-2">
          {footer}
        </div>
      )}
    </>
  );

  const baseCls = cn(
    "flex flex-col gap-2 border border-line-soft",
    isHero
      ? "rounded-3xl p-7 md:p-8 gap-4 shadow-soft-card"
      : "rounded-md p-5",
    TONE_CLS[tone],
    STATUS_RING[status],
    interactive &&
      (isHero
        ? "transition-shadow hover:shadow-elevated-card cursor-pointer"
        : "transition-shadow hover:shadow-[var(--shadow-raised)] cursor-pointer"),
    className,
  );

  if (drillHref) {
    return (
      <a href={drillHref} className={cn(baseCls, "no-underline")}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(baseCls, "text-left")}>
        {body}
      </button>
    );
  }
  return <div className={baseCls}>{body}</div>;
}
