import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  countHandoffsByStatus,
  listHandoffs,
} from "@/features/guest-ai-concierge/handoff-services";

export const metadata = { title: "Concierge AI handoffs" };
export const dynamic = "force-dynamic";

const PRIORITY_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  created: "info",
  linked_to_request: "info",
  acknowledged: "warning",
  resolved: "success",
  cancelled: "neutral",
};

const ALL_STATUSES = [
  "created",
  "linked_to_request",
  "acknowledged",
  "resolved",
  "cancelled",
] as const;

export default async function HandoffsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const status = ALL_STATUSES.includes(sp.status as never)
    ? (sp.status as (typeof ALL_STATUSES)[number])
    : undefined;
  const priority =
    sp.priority === "low" ||
    sp.priority === "normal" ||
    sp.priority === "high" ||
    sp.priority === "urgent"
      ? (sp.priority as "low" | "normal" | "high" | "urgent")
      : undefined;
  const [counts, rows] = await Promise.all([
    countHandoffsByStatus(),
    listHandoffs({ status, priority, limit: 200 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI", href: "/dashboard/guest-ai" },
          { label: "Handoffs" },
        ]}
        title="Handoffs"
        description="Every Ask-human / Report-to-staff escalation from /stay/[token]/concierge. Each row links to the underlying service_requests row that ops actually works."
        actions={
          <Link
            href="/dashboard/guest-ai/handoffs/metrics"
            className="text-sm px-4 py-2 rounded-full border border-line-soft hover:border-line-strong"
          >
            SLA metrics →
          </Link>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Open" value={String(counts.created + counts.linked)} />
        <MetricCard label="Acknowledged" value={String(counts.acknowledged)} />
        <MetricCard label="Resolved" value={String(counts.resolved)} />
        <MetricCard
          label="Open urgent"
          value={String(counts.urgent)}
          accent={counts.urgent > 0}
        />
      </div>
      <Section eyebrow="Filter" title={`${rows.length} handoffs`}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <FilterPill href="/dashboard/guest-ai/handoffs" active={!status}>
            All statuses
          </FilterPill>
          {ALL_STATUSES.map((s) => (
            <FilterPill
              key={s}
              href={`/dashboard/guest-ai/handoffs?status=${s}`}
              active={status === s}
            >
              {s.replace("_", " ")}
            </FilterPill>
          ))}
          <span className="mx-2 text-ink-tertiary">|</span>
          <FilterPill
            href="/dashboard/guest-ai/handoffs?priority=urgent"
            active={priority === "urgent"}
          >
            Urgent only
          </FilterPill>
        </div>
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Villa / booking</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SR</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No handoffs match.
                  </td>
                </tr>
              )}
              {rows.map((h) => (
                <tr key={h.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums whitespace-nowrap">
                    {new Date(h.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-xs">{h.handoffType}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">
                    {h.villaCode ?? "—"}
                    {h.bookingCode && (
                      <div className="text-[10px] text-ink-tertiary">
                        {h.bookingCode}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-md truncate">
                    {h.guestSummary}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={PRIORITY_TONES[h.priority] ?? "neutral"}>
                      {h.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[h.status] ?? "neutral"}>
                      {h.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {h.serviceRequestCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/guest-ai/handoffs/${h.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
        active
          ? "bg-ink text-ink-inverse"
          : "border border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}
