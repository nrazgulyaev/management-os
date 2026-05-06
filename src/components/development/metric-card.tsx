import * as React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DevelopmentMetric } from "@/lib/development/types";

const statusRing: Record<DevelopmentMetric["status"], string> = {
  ok: "border-line-soft",
  watch: "border-warning/30",
  alert: "border-danger/40",
};

const statusDot: Record<DevelopmentMetric["status"], string> = {
  ok: "bg-success",
  watch: "bg-warning",
  alert: "bg-danger",
};

const trendColor: Record<DevelopmentMetric["trend"], string> = {
  up: "text-success",
  down: "text-danger",
  flat: "text-ink-tertiary",
};

export function DevelopmentMetricCard({
  metric,
  className,
}: {
  metric: DevelopmentMetric;
  className?: string;
}) {
  const TrendIcon =
    metric.trend === "up"
      ? TrendingUp
      : metric.trend === "down"
        ? TrendingDown
        : Minus;

  return (
    <div
      className={cn(
        "rounded-md bg-surface border p-5 flex flex-col gap-3 min-h-[140px]",
        statusRing[metric.status],
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-label">{metric.label}</span>
        <span
          className={cn("w-1.5 h-1.5 rounded-full", statusDot[metric.status])}
          aria-hidden
        />
      </div>
      <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
        <span className="text-display text-[28px] leading-[32px] font-medium text-ink">
          {metric.value}
        </span>
        {metric.unit && (
          <span className="text-xs text-ink-tertiary">{metric.unit}</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-auto">
        {metric.changePct !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
              trendColor[metric.trend]
            )}
          >
            <TrendIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
            {metric.changePct > 0 ? "+" : ""}
            {metric.changePct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-ink-tertiary">—</span>
        )}
        {metric.hint && (
          <span className="text-xs text-ink-tertiary truncate max-w-[60%] text-right">
            {metric.hint}
          </span>
        )}
      </div>
    </div>
  );
}
