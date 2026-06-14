import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { FilterPills } from "@/components/ui/primitives";
import { listMaintenanceRiskEvents } from "@/features/maintenance-intelligence/services";
import { RiskRowActions } from "@/components/maintenance-intelligence/risk-row-actions";
import { ScanRisksButton } from "@/components/maintenance-intelligence/scan-risks-button";

export const metadata = { title: "Maintenance risk feed" };
export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  low: "soft",
  medium: "info",
  high: "warn",
  critical: "danger",
};

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  open: "warn",
  acknowledged: "info",
  resolved: "ok",
  dismissed: "soft",
};

const RISK_TYPES = [
  "overdue_maintenance",
  "utility_low_balance",
  "utility_critical_balance",
  "no_recent_reading",
  "repeated_ticket",
  "upcoming_guest_conflict",
  "arrival_not_ready",
] as const;
type RiskType = (typeof RISK_TYPES)[number];

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
type Severity = (typeof SEVERITIES)[number];

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildQuery(
  base: { status: string; severity: string; type: string },
  override: Partial<{ status: string; severity: string; type: string }>,
): string {
  const merged = { ...base, ...override };
  const parts: string[] = [];
  if (merged.status && merged.status !== "open") parts.push(`status=${merged.status}`);
  if (merged.severity) parts.push(`severity=${merged.severity}`);
  if (merged.type) parts.push(`type=${merged.type}`);
  return parts.length ? `?${parts.join("&")}` : "?";
}

export default async function RisksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const activeStatus = sp.status || "open";
  const activeSeverity = SEVERITIES.includes(sp.severity as Severity)
    ? (sp.severity as Severity)
    : "";
  const activeType = RISK_TYPES.includes(sp.type as RiskType)
    ? (sp.type as RiskType)
    : "";

  const rows = await listMaintenanceRiskEvents({
    status: activeStatus,
    severity: activeSeverity || undefined,
    riskType: activeType || undefined,
    limit: 200,
  });
  // Counts come from the status-filtered set so severity/type pills
  // always reflect "of the X risks at this status, how many are Y".
  // We re-fetch with status-only to get an accurate count baseline.
  const statusFilteredRows = activeSeverity || activeType
    ? await listMaintenanceRiskEvents({ status: activeStatus, limit: 500 })
    : rows;
  const open = rows.filter((r) => r.status === "open");
  const critical = rows.filter((r) => r.severity === "critical");

  const filters = { status: activeStatus, severity: activeSeverity, type: activeType };
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/maintenance-intelligence">Maintenance intelligence</Link> /{" "}
            <span>Risks</span>
          </div>
          <h1>Risk feed</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Unified feed: overdue maintenance, low utility balance, no recent reading, repeated tickets, upcoming guest-block conflicts, arrival-not-ready warnings. Idempotent — running the scanner won't duplicate open rows.
          </p>
        </div>
        <div className="actions">
          <ScanRisksButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Open" value={String(open.length)} tone={open.length > 0 ? "accent" : undefined} />
        <Kpi label="Critical" value={String(critical.length)} tone={critical.length > 0 ? "accent" : undefined} />
      </div>

      <div className="flex flex-col gap-4">
        <FilterPills
          label="Status"
          current={activeStatus}
          items={[
            { value: "open", label: "Open", href: buildQuery(filters, { status: "open" }) },
            { value: "acknowledged", label: "Acknowledged", href: buildQuery(filters, { status: "acknowledged" }) },
            { value: "resolved", label: "Resolved", href: buildQuery(filters, { status: "resolved" }) },
            { value: "dismissed", label: "Dismissed", href: buildQuery(filters, { status: "dismissed" }) },
          ]}
        />
        <FilterPills
          label="Severity"
          current={activeSeverity}
          items={[
            { value: "", label: "All", href: buildQuery(filters, { severity: "" }) },
            ...SEVERITIES.map((s) => ({
              value: s,
              label: titleCase(s),
              count: statusFilteredRows.filter((r) => r.severity === s).length,
              href: buildQuery(filters, { severity: s }),
            })),
          ]}
        />
        <FilterPills
          label="Risk type"
          current={activeType}
          items={[
            { value: "", label: "All", href: buildQuery(filters, { type: "" }) },
            ...RISK_TYPES.map((t) => ({
              value: t,
              label: titleCase(t),
              count: statusFilteredRows.filter((r) => r.riskType === t).length,
              href: buildQuery(filters, { type: t }),
            })),
          ]}
        />
      </div>

      <div>
        <div className="label mb-2.5">Risks · {rows.length} rows</div>
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            None.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HandoffBadge tone={SEVERITY_TONES[r.severity] ?? "soft"}>
                        {r.severity}
                      </HandoffBadge>
                      <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>
                        {r.status}
                      </HandoffBadge>
                      <span className="font-mono text-[11px] text-ink-tertiary">
                        {r.riskType.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-ink-tertiary tabular-nums">
                        {r.createdAt.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <div className="text-sm text-ink font-medium mt-1.5">
                      {r.title}
                    </div>
                    {r.description && (
                      <div className="text-xs text-ink-tertiary mt-1">
                        {r.description}
                      </div>
                    )}
                    {r.villaCode && (
                      <div className="text-[11px] text-ink-tertiary mt-1">
                        Villa {r.villaCode}
                      </div>
                    )}
                  </div>
                  {r.status === "open" && <RiskRowActions id={r.id} />}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
