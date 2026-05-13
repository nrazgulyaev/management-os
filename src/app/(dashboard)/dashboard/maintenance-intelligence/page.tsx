import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import {
  listMaintenanceTemplates,
  listMaintenanceRiskEvents,
  listOpenSuggestions,
  listVillaMaintenancePlans,
} from "@/features/maintenance-intelligence/services";
import { safeList } from "@/features/system/db-health";
import { QueryWarningCard } from "@/components/system/query-warning-card";

export const metadata = { title: "Maintenance intelligence" };
export const dynamic = "force-dynamic";

export default async function MaintenanceIntelligenceHub() {
  const now = new Date();
  const [templatesResult, plansResult, suggestionsResult, openRisksResult] =
    await Promise.all([
      safeList("maintenance_templates", () =>
        listMaintenanceTemplates({ status: "active" }),
      ),
      safeList("villa_maintenance_plans", () =>
        listVillaMaintenancePlans({ status: "active" }),
      ),
      safeList("maintenance_window_suggestions", () => listOpenSuggestions(50)),
      safeList("maintenance_risk_events", () =>
        listMaintenanceRiskEvents({ status: "open", limit: 200 }),
      ),
    ]);
  const templates = templatesResult.value;
  const plans = plansResult.value;
  const suggestions = suggestionsResult.value;
  const openRisks = openRisksResult.value;
  const overduePlans = plans.filter(
    (p) => p.nextDueAt && new Date(p.nextDueAt).getTime() <= now.getTime(),
  );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Maintenance intelligence" }]}
        title="Maintenance intelligence"
        description="Preventive maintenance plans, scored maintenance windows, and a unified risk feed. Generate operation_tasks from plans; the calendar block keeps front office in the loop."
        actions={
          <Link
            href="/dashboard/maintenance-intelligence/risks"
            className="text-sm px-4 py-2 rounded-full border border-line-soft hover:border-line-strong"
          >
            Risk feed
          </Link>
        }
      />
      <QueryWarningCard result={templatesResult} tableName="maintenance_templates" />
      <QueryWarningCard result={plansResult} tableName="villa_maintenance_plans" />
      <QueryWarningCard
        result={openRisksResult}
        tableName="maintenance_risk_events"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active templates" value={String(templates.length)} />
        <MetricCard label="Active plans" value={String(plans.length)} />
        <MetricCard
          label="Overdue plans"
          value={String(overduePlans.length)}
          accent={overduePlans.length > 0}
        />
        <MetricCard
          label="Open risks"
          value={String(openRisks.length)}
          accent={openRisks.length > 0}
        />
      </div>

      <Section eyebrow="Surfaces" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card
            href="/dashboard/maintenance-intelligence/templates"
            title="Templates"
            detail={`${templates.length} active`}
          />
          <Card
            href="/dashboard/maintenance-intelligence/plans"
            title="Plans"
            detail={`${plans.length} active · ${overduePlans.length} overdue`}
          />
          <Card
            href="/dashboard/maintenance-intelligence/windows"
            title="Window suggestions"
            detail={`${suggestions.length} open`}
          />
          <Card
            href="/dashboard/maintenance-intelligence/risks"
            title="Risk feed"
            detail={`${openRisks.length} open events`}
          />
        </div>
      </Section>
    </div>
  );
}

function Card({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
