import * as React from "react";
import { cn } from "@/lib/utils";
import type { LeadPipelineMetrics } from "@/lib/development/types/sales";

/**
 * Lead pipeline KPI strip — Dev OS `.kpi` primitive (cabinets/dev-p2/sales.html).
 *
 * Pixel target: mono uppercase label 10.5px / .14em, IBM Plex Mono tabular
 * value 26px, sub 12px ink-3. Semantic value tints (amber accent · warn ·
 * danger) match the mock's Contracted / Due / Overdue tiles. Same six
 * lead-pipeline metrics as before — only the presentation changed.
 */

type KpiTone = "default" | "accent" | "warn" | "danger";

interface KpiTile {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: KpiTone;
}

const valueTone: Record<KpiTone, string> = {
  default: "text-ink",
  accent: "text-accent",
  warn: "text-warning",
  danger: "text-danger",
};

export function LeadPipelineMetricsStrip({
  metrics,
}: {
  metrics: LeadPipelineMetrics;
}) {
  const cards: KpiTile[] = [
    {
      id: "leads-total",
      label: "Active leads",
      value: String(metrics.total),
      sub: "in pipeline",
      tone: "default",
    },
    {
      id: "leads-new-week",
      label: "New · 7 days",
      value: String(metrics.newThisWeek),
      sub: "this week",
      tone: metrics.newThisWeek > 0 ? "accent" : "default",
    },
    {
      id: "leads-qualified",
      label: "Qualified",
      value: String(metrics.qualified),
      sub: "ready to advance",
      tone: "default",
    },
    {
      id: "leads-negotiation",
      label: "In negotiation",
      value: String(metrics.inNegotiation),
      sub: "active deals",
      tone: metrics.inNegotiation > 0 ? "warn" : "default",
    },
    {
      id: "leads-converted-mtd",
      label: "Converted · MTD",
      value: String(metrics.convertedMtd),
      sub: "this month",
      tone: "default",
    },
    {
      id: "leads-lost-mtd",
      label: "Lost · MTD",
      value: String(metrics.lostMtd),
      sub: "this month",
      tone: metrics.lostMtd > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div
          key={c.id}
          className={cn(
            "rounded-md border bg-surface px-[18px] py-4",
            c.tone === "danger"
              ? "border-danger/35"
              : c.tone === "warn"
                ? "border-warning/35"
                : "border-line-soft",
          )}
        >
          <span className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">
            {c.label}
          </span>
          <span
            className={cn(
              "mt-1 block font-mono text-[26px] font-medium leading-[1.05] tabular-nums",
              valueTone[c.tone],
            )}
          >
            {c.value}
          </span>
          <span className="mt-0.5 block text-xs text-ink-tertiary">
            {c.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
