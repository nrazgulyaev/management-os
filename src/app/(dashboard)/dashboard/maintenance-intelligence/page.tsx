import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { QueryWarningCard } from "@/components/system/query-warning-card";
import {
  listMaintenanceTemplates,
  listMaintenanceRiskEvents,
  listOpenSuggestions,
  listVillaMaintenancePlans,
} from "@/features/maintenance-intelligence/services";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Maintenance intelligence" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};
const DISRUPTION_TONE: Record<string, "neutral" | "info" | "warning"> = {
  none: "neutral",
  low: "neutral",
  medium: "info",
  high: "warning",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

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
  const criticalRisks = openRisks.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  ).length;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Maintenance intelligence</span>
          </div>
          <h1>Maintenance intelligence</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Stop failures before guests see them. Per-villa preventive plans,
            smart windows scheduled around stays, and a risk feed aggregating
            overdue maintenance, low balances, repeat tickets and arrival-not-ready.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/maintenance-intelligence/templates"
            className="btn btn-secondary btn-sm"
          >
            Templates →
          </Link>
          <Link
            href="/dashboard/maintenance-intelligence/risks"
            className="btn btn-accent btn-sm"
          >
            Risk feed →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Active plans" value={String(plans.length)} sub="preventive" />
        <Kpi
          label="Overdue plans"
          value={String(overduePlans.length)}
          sub={overduePlans.length > 0 ? "past due" : "on schedule"}
          tone={overduePlans.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Risks open"
          value={String(openRisks.length)}
          sub={`${criticalRisks} critical / high`}
          tone={openRisks.length > 0 ? "accent" : undefined}
        />
        <Kpi label="Templates" value={String(templates.length)} sub="Bali catalog" />
        <Kpi label="Window suggestions" value={String(suggestions.length)} sub="open" tone="gold" />
      </div>

      <QueryWarningCard result={templatesResult} tableName="maintenance_templates" />
      <QueryWarningCard result={plansResult} tableName="villa_maintenance_plans" />
      <QueryWarningCard result={openRisksResult} tableName="maintenance_risk_events" />

      {/* Templates */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="templates">Templates</h2>
        <Link
          href="/dashboard/maintenance-intelligence/plans"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          Plans →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Template</th>
              <th>Category</th>
              <th>Cadence</th>
              <th>Disruption</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-ink-3 italic py-8">
                  No active templates.
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <Badge tone="outline">{t.category}</Badge>
                  </td>
                  <td className="mono text-[12px] text-ink-3">
                    {t.defaultFrequency.replace(/_/g, " ")}
                  </td>
                  <td>
                    <Badge tone={DISRUPTION_TONE[t.guestDisruptionLevel] ?? "neutral"}>
                      {t.guestDisruptionLevel}
                    </Badge>
                  </td>
                  <td className="text-[12px] text-ink-3">{t.defaultPriority}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Risk feed */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="risks">
        Risk feed
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Villa</th>
              <th>Severity</th>
              <th>Source</th>
              <th>First seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {openRisks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-3 italic py-8">
                  No open risks. The scanner surfaces overdue maintenance, low
                  balances and repeat tickets here.
                </td>
              </tr>
            ) : (
              openRisks.slice(0, 14).map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td className="mono">{r.villaCode ?? "—"}</td>
                  <td>
                    <Badge tone={SEVERITY_TONE[r.severity] ?? "neutral"}>{r.severity}</Badge>
                  </td>
                  <td className="text-[12px] text-ink-3">{r.sourceType}</td>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="text-right">
                    <Link
                      href="/dashboard/maintenance-intelligence/risks"
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
