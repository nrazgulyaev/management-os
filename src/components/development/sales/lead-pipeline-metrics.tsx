import * as React from "react";
import { DevelopmentMetricCard } from "@/components/development/metric-card";
import type { DevelopmentMetric } from "@/lib/development/types";
import type { LeadPipelineMetrics } from "@/lib/development/types/sales";

export function LeadPipelineMetricsStrip({
  metrics,
}: {
  metrics: LeadPipelineMetrics;
}) {
  const cards: DevelopmentMetric[] = [
    {
      id: "leads-total",
      label: "Active leads",
      value: String(metrics.total),
      changePct: null,
      trend: "flat",
      status: "ok",
    },
    {
      id: "leads-new-week",
      label: "New · 7 days",
      value: String(metrics.newThisWeek),
      changePct: null,
      trend: metrics.newThisWeek > 0 ? "up" : "flat",
      status: "ok",
    },
    {
      id: "leads-qualified",
      label: "Qualified",
      value: String(metrics.qualified),
      changePct: null,
      trend: "flat",
      status: metrics.qualified > 0 ? "ok" : "watch",
    },
    {
      id: "leads-negotiation",
      label: "In negotiation",
      value: String(metrics.inNegotiation),
      changePct: null,
      trend: "flat",
      status: "ok",
    },
    {
      id: "leads-converted-mtd",
      label: "Converted · MTD",
      value: String(metrics.convertedMtd),
      changePct: null,
      trend: "flat",
      status: "ok",
    },
    {
      id: "leads-lost-mtd",
      label: "Lost · MTD",
      value: String(metrics.lostMtd),
      changePct: null,
      trend: metrics.lostMtd > 0 ? "down" : "flat",
      status: metrics.lostMtd > 0 ? "watch" : "ok",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <DevelopmentMetricCard key={c.id} metric={c} />
      ))}
    </div>
  );
}
