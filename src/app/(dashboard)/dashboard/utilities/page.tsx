import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import {
  listUtilityAccounts,
  listUtilityPaymentReminders,
} from "@/features/utilities/services";
import { listMaintenanceRiskEvents } from "@/features/maintenance-intelligence/services";
import { safeList } from "@/features/system/db-health";
import { QueryWarningCard } from "@/components/system/query-warning-card";

export const metadata = { title: "Utilities" };
export const dynamic = "force-dynamic";

export default async function UtilitiesHub() {
  const [accountsResult, openPaymentsResult, allRisksResult] = await Promise.all([
    safeList("utility_accounts", () => listUtilityAccounts({ status: "active" })),
    safeList("utility_payment_reminders", () =>
      listUtilityPaymentReminders({ status: ["open", "overdue"], limit: 200 }),
    ),
    safeList("maintenance_risk_events", () =>
      listMaintenanceRiskEvents({ status: "open", limit: 500 }),
    ),
  ]);
  const accounts = accountsResult.value;
  const openPayments = openPaymentsResult.value;
  const allRisks = allRisksResult.value;
  const utilityRisks = allRisks.filter((r) =>
    r.riskType.startsWith("utility_") || r.riskType === "no_recent_reading",
  );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Utilities" }]}
        title="Utilities"
        description="Per-villa accounts (electricity tokens, water, internet…), readings, and payment reminders. The risk scanner watches balances + reading freshness."
      />
      <QueryWarningCard result={accountsResult} tableName="utility_accounts" />
      <QueryWarningCard result={openPaymentsResult} tableName="utility_payment_reminders" />
      <QueryWarningCard result={allRisksResult} tableName="maintenance_risk_events" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active accounts" value={String(accounts.length)} />
        <MetricCard
          label="Open payments"
          value={String(openPayments.length)}
          accent={openPayments.length > 0}
        />
        <MetricCard
          label="Open utility risks"
          value={String(utilityRisks.length)}
          accent={utilityRisks.length > 0}
        />
      </div>

      <Section eyebrow="Surfaces" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card href="/dashboard/utilities/accounts" title="Accounts" detail={`${accounts.length} active`} />
          <Card href="/dashboard/utilities/readings" title="Readings" detail="Field & manual captures" />
          <Card href="/dashboard/utilities/payments" title="Payments" detail={`${openPayments.length} open`} />
          <Card href="/dashboard/utilities/risks" title="Utility risks" detail={`${utilityRisks.length} open`} />
        </div>
      </Section>
    </div>
  );
}

function Card({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
