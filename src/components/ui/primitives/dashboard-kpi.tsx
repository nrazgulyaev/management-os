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
}

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
  } = props;

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
        <span className="text-label">{label}</span>
        {interactive && (
          <ChevronRight className="w-4 h-4 text-ink-tertiary" aria-hidden />
        )}
      </div>
      <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
        <span className="text-display text-[28px] leading-[32px] font-medium text-ink">
          {value}
        </span>
        {unit && <span className="text-sm text-ink-tertiary">{unit}</span>}
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
    "rounded-md bg-surface border border-line-soft p-5 flex flex-col gap-2",
    STATUS_RING[status],
    interactive && "transition-shadow hover:shadow-[var(--shadow-raised)] cursor-pointer",
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
