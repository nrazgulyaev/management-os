import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadCfoCabinet } from "@/lib/development/server/cabinets/cfo-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { formatMinorAsCurrency } from "@/lib/development/server/executive/widgets-helpers";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

export const metadata: Metadata = { title: "CFO / Accountant · Cabinet" };
export const dynamic = "force-dynamic";

export default async function CfoCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("cfo-accountant");
  if (__gateRedirect) redirect(__gateRedirect);

  const data = await safeQuery(
    "cfoCabinet",
    loadCfoCabinet(),
    {
      latestSnapshot: null,
      latestTaxAssistantOutputCode: null,
      latestQsCostAnalystOutputCode: null,
      pendingTaxClassificationsCount: 0,
      invoicesAwaitingPaymentCount: 0,
    },
  );
  const s = data.latestSnapshot;
  const c = s?.baseCurrency ?? "IDR";
  return (
    <DevelopmentShell>
      <PageHeader
        title="CFO / Accountant"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "CFO / Accountant" },
        ]}
        description="Cash position + bookkeeper inbox + period close + profitability."
      />

      {!s ? (
        <EmptyState
          title="No snapshot yet"
          description="The daily executive metrics cron will populate this. Run it manually from Jobs."
        />
      ) : (
        <Section title="Cash position">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Cash on hand" value={formatMinorAsCurrency(s.cashOnHandMinor, c)} />
            <MetricCard label="30-day cash" value={formatMinorAsCurrency(s.cashAt30Minor, c)} hint="forecast" />
            <MetricCard label="60-day cash" value={formatMinorAsCurrency(s.cashAt60Minor, c)} hint="forecast" />
            <MetricCard label="90-day cash" value={formatMinorAsCurrency(s.cashAt90Minor, c)} hint="forecast" />
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Receivables" value={formatMinorAsCurrency(s.receivablesMinor, c)} />
            <MetricCard label="Payables next 30d" value={formatMinorAsCurrency(s.payablesNext30Minor, c)} />
            <MetricCard label="Payables overdue" value={formatMinorAsCurrency(s.payablesOverdueMinor, c)} />
          </div>
        </Section>
      )}

      <Section title="Bookkeeper inbox">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Unclassified transactions"
            value={String(s?.unclassifiedTransactionsCount ?? 0)}
          />
          <MetricCard
            label="Pending tax classifications"
            value={String(data.pendingTaxClassificationsCount)}
          />
          <MetricCard
            label="Invoices awaiting payment"
            value={String(data.invoicesAwaitingPaymentCount)}
          />
        </div>
      </Section>

      <Section title="AI assistance">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-label">Latest tax assistant</div>
            {data.latestTaxAssistantOutputCode ? (
              <Link
                href={`/development-os/ai-agents/tax-assistant/outputs/${data.latestTaxAssistantOutputCode}`}
                className="text-sm text-info hover:underline"
              >
                {data.latestTaxAssistantOutputCode} →
              </Link>
            ) : (
              <span className="text-sm text-ink-tertiary">No output yet</span>
            )}
          </div>
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-label">Latest QS cost analyst</div>
            {data.latestQsCostAnalystOutputCode ? (
              <Link
                href={`/development-os/ai-agents/qs-cost-analyst/outputs/${data.latestQsCostAnalystOutputCode}`}
                className="text-sm text-info hover:underline"
              >
                {data.latestQsCostAnalystOutputCode} →
              </Link>
            ) : (
              <span className="text-sm text-ink-tertiary">No output yet</span>
            )}
          </div>
        </div>
      </Section>
    </DevelopmentShell>
  );
}
