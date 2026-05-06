import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Briefcase,
  Filter,
  Flame,
  HardHat,
  LineChart,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "Visual reports · Development OS" };
export const dynamic = "force-dynamic";

const REPORTS = [
  {
    Icon: Activity,
    name: "Cashflow waterfall",
    description: "Starting cash → inflows → outflows → ending cash.",
    href: "/development-os/reports/cashflow-waterfall",
  },
  {
    Icon: TrendingUp,
    name: "S-curve (planned vs actual)",
    description: "Cumulative project progress; planned overlay.",
    href: "/development-os/reports/s-curve",
  },
  {
    Icon: BarChart3,
    name: "Budget burn",
    description: "Cumulative committed vs actual against total budget line.",
    href: "/development-os/reports/budget-burn",
  },
  {
    Icon: Flame,
    name: "Cost heatmap",
    description: "Per-asset cost overage by category.",
    href: "/development-os/reports/cost-heatmap",
  },
  {
    Icon: Briefcase,
    name: "Investor capital timeline",
    description: "Monthly stacked: contributions / drawdowns / distributions.",
    href: "/development-os/reports/investor-capital-timeline",
  },
  {
    Icon: Filter,
    name: "Sales funnel",
    description: "Lead → qualified → reservation → contract → closed.",
    href: "/development-os/reports/sales-funnel",
  },
  {
    Icon: HardHat,
    name: "Workforce productivity",
    description: "Per-role utilisation over time, idle vs active.",
    href: "/development-os/reports/workforce-productivity",
  },
  {
    Icon: LineChart,
    name: "Procurement delays",
    description: "Lead-time and on-time performance per supplier.",
    href: "/development-os/reports/procurement-delays",
  },
];

export default async function VisualReportsIndexPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Visual reports" },
        ]}
        eyebrow="Stage 5.C"
        title="Visual reports"
        description="Server-rendered SVG charts. Open any report to view the chart and the underlying data table."
      />
      <Section title="All reports">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {REPORTS.map((r) => (
            <li
              key={r.name}
              className="rounded-lg border border-line-soft bg-surface p-5 flex gap-3 hover:border-ink/20 transition-colors"
            >
              <div className="shrink-0">
                <r.Icon
                  className="w-5 h-5 text-ink-secondary"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-ink">
                    <Link href={r.href} className="hover:underline">
                      {r.name}
                    </Link>
                  </h4>
                  <Badge tone="neutral">5.C</Badge>
                </div>
                <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                  {r.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </DevelopmentShell>
  );
}
