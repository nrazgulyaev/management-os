import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { FinanceSummary } from "@/components/dashboard/finance-summary";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileCheck2 } from "lucide-react";
import { portfolioMetrics } from "@/lib/mock/metrics";

export const metadata = { title: "Finance" };

const closeChecklist = [
  { label: "Bookings recognized to checkout date", done: true, hint: "238 of 238" },
  { label: "OTA + payment fees attributed", done: true, hint: "Airbnb · Booking · Agoda · Direct" },
  { label: "Bank reconciliation", done: false, hint: "14 of 19 villas matched" },
  { label: "Allocation rules applied (v4.2)", done: true, hint: "Eternal · Enso · Ahau" },
  { label: "Reserve contributions posted", done: true, hint: "Renovation 3% · FF&E 5%" },
  { label: "Statements drafted", done: true, hint: "All villas · awaiting review" },
  { label: "Statements approved & published", done: false, hint: "0 of 19" },
  { label: "Payouts dispatched", done: false, hint: "0 of 7 batches" },
];

export default function FinancePage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Finance" }]}
        eyebrow="March 2026 · preliminary"
        title="Monthly close in progress."
        description="Draft statements ready for review. 14 of 19 villas reconciled with the bank. Four statements pending supervisor approval."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary">
              <Download className="w-4 h-4" strokeWidth={1.75} />
              Export ledger
            </Button>
            <Button>
              <FileCheck2 className="w-4 h-4" strokeWidth={1.75} />
              Run close
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Gross revenue MTD"
          value={`Rp ${(portfolioMetrics.grossRevenueMTD.value / 100_000_000_000).toFixed(1)}B`}
          delta={{ value: portfolioMetrics.grossRevenueMTD.deltaYoY, label: "YoY" }}
        />
        <MetricCard
          label="OTA + payment fees"
          value="Rp 1.83B"
          delta={{ value: -1.2, label: "as % of rev" }}
        />
        <MetricCard
          label="Net owner payouts MTD"
          value={`Rp ${(portfolioMetrics.netOwnerPayoutsMTD.value / 100_000_000_000).toFixed(1)}B`}
          delta={{ value: portfolioMetrics.netOwnerPayoutsMTD.deltaYoY, label: "YoY" }}
        />
        <MetricCard
          label="Reserves (Reno + FF&E)"
          value="Rp 412M"
          hint="YTD contributions"
        />
      </div>

      <Section
        eyebrow="Close checklist"
        title="Where we are this month"
        description="An audit-ready close runs through these gates. Statements cannot be published until reconciliation is complete and the close is approved by both Finance Manager and Director."
      >
        <div className="rounded-lg border border-line-soft bg-surface divide-y divide-line-soft">
          {closeChecklist.map((c) => (
            <div
              key={c.label}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-5 h-5 rounded-full border inline-flex items-center justify-center text-[10px] font-medium shrink-0 ${c.done ? "bg-accent border-accent text-accent-contrast" : "bg-surface border-line-strong text-ink-tertiary"}`}
                >
                  {c.done ? "✓" : ""}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">{c.label}</div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {c.hint}
                  </div>
                </div>
              </div>
              <Badge tone={c.done ? "success" : "warning"}>
                {c.done ? "Complete" : "Pending"}
              </Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Sample statement"
        title="An owner statement, exactly as published."
        description="Demo data — Eternal 07, March 2026. In production, every line drills to the source ledger row and the PDF carries a tamper-evident hash."
      >
        <FinanceSummary />
      </Section>
    </div>
  );
}
