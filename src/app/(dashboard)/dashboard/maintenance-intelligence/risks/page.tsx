import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { listMaintenanceRiskEvents } from "@/features/maintenance-intelligence/services";
import { RiskRowActions } from "@/components/maintenance-intelligence/risk-row-actions";
import { ScanRisksButton } from "@/components/maintenance-intelligence/scan-risks-button";

export const metadata = { title: "Maintenance risk feed" };
export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  open: "warning",
  acknowledged: "info",
  resolved: "success",
  dismissed: "neutral",
};

export default async function RisksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listMaintenanceRiskEvents({
    status: sp.status || "open",
    limit: 200,
  });
  const open = rows.filter((r) => r.status === "open");
  const critical = rows.filter((r) => r.severity === "critical");
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Risks" },
        ]}
        title="Risk feed"
        description="Unified feed: overdue maintenance, low utility balance, no recent reading, repeated tickets, upcoming guest-block conflicts, arrival-not-ready warnings. Idempotent — running the scanner won't duplicate open rows."
        actions={<ScanRisksButton />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Open" value={String(open.length)} accent={open.length > 0} />
        <MetricCard label="Critical" value={String(critical.length)} accent={critical.length > 0} />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        {[
          { label: "Open", status: "open" },
          { label: "Acknowledged", status: "acknowledged" },
          { label: "Resolved", status: "resolved" },
        ].map((f) => (
          <Link
            key={f.status}
            href={`?status=${f.status}`}
            className={`px-3 py-1.5 rounded-full border ${
              (sp.status ?? "open") === f.status
                ? "bg-ink text-ink-inverse border-ink"
                : "border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Section eyebrow="Risks" title={`${rows.length} rows`}>
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            None.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={SEVERITY_TONES[r.severity] ?? "neutral"}>
                        {r.severity}
                      </Badge>
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {r.status}
                      </Badge>
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
          </div>
        )}
      </Section>
    </div>
  );
}
