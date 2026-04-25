import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

type Delta = { value: number; label?: string };

export function MetricCard({
  label,
  value,
  unit,
  delta,
  hint,
  className,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: Delta;
  hint?: string;
  className?: string;
  accent?: boolean;
}) {
  const trend = delta
    ? delta.value > 0
      ? "up"
      : delta.value < 0
        ? "down"
        : "flat"
    : null;

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-danger"
        : "text-ink-tertiary";

  return (
    <div
      className={cn(
        "rounded-md bg-surface border border-line-soft p-6 flex flex-col gap-3",
        accent && "bg-accent-weak border-accent/20",
        className
      )}
    >
      <span className="text-label">{label}</span>
      <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
        <span className="text-display text-[32px] leading-[36px] font-medium text-ink">
          {value}
        </span>
        {unit && <span className="text-sm text-ink-tertiary">{unit}</span>}
      </div>
      <div className="flex items-center justify-between mt-1">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
              trendColor
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
    </div>
  );
}
