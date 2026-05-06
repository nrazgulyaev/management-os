import * as React from "react";
import { cn } from "@/lib/utils";
import type { MockChartSeries } from "@/lib/development/mock-data";

const toneClass: Record<MockChartSeries["series"][number]["tone"], string> = {
  accent: "bg-accent",
  gold: "bg-gold",
  stone: "bg-data-stone",
  sage: "bg-data-sage",
};

/**
 * Lightweight visual placeholder used while no chart library is installed.
 * Renders grouped bars from a `MockChartSeries`, normalized to the largest
 * value across all series so proportions stay readable.
 */
export function SnapshotPanel({
  data,
  className,
}: {
  data: MockChartSeries;
  className?: string;
}) {
  const max = Math.max(
    1,
    ...data.series.flatMap((s) => s.values.map((v) => Math.abs(v)))
  );

  return (
    <div
      className={cn(
        "rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-4 h-full",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-medium text-ink">{data.label}</h3>
          <p className="text-xs text-ink-tertiary">{data.description}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {data.series.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary"
            >
              <span
                className={cn("w-2 h-2 rounded-sm", toneClass[s.tone])}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-[160px] flex items-end gap-2">
        {data.axis.map((axisLabel, i) => (
          <div
            key={axisLabel}
            className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
          >
            <div className="w-full h-32 flex items-end justify-center gap-0.5">
              {data.series.map((s) => {
                const v = s.values[i] ?? 0;
                const h = Math.max(2, Math.round((Math.abs(v) / max) * 100));
                return (
                  <div
                    key={s.label}
                    className={cn("w-2.5 rounded-t-[2px]", toneClass[s.tone])}
                    style={{ height: `${h}%` }}
                    title={`${s.label}: ${v}`}
                  />
                );
              })}
            </div>
            <span className="text-[10px] tracking-wide uppercase text-ink-tertiary truncate w-full text-center">
              {axisLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
