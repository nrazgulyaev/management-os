import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <span>Handoffs</span>
          </div>
          <h1>Handoffs</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Every Ask-human / Report-to-staff escalation from
            /stay/[token]/concierge. Each row links to the underlying
            service_requests row that ops actually works.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/guest-ai/handoffs/metrics"
            className="btn btn-secondary btn-sm"
          >
            SLA metrics →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Open" value={String(counts.created + counts.linked)} />
        <Kpi label="Acknowledged" value={String(counts.acknowledged)} />
        <Kpi
          label="Resolved"
          value={String(counts.resolved)}
          tone={counts.resolved > 0 ? "success" : undefined}
        />
        <Kpi
          label="Open urgent"
          value={String(counts.urgent)}
          tone={counts.urgent > 0 ? "danger" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-[14px]">
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
        <span className="mx-2 text-ink-4">|</span>
        <FilterPill
          href="/dashboard/guest-ai/handoffs?priority=urgent"
          active={priority === "urgent"}
        >
          Urgent only
        </FilterPill>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Type</th>
              <th scope="col">Villa / booking</th>
              <th scope="col">Summary</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col">SR</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>No handoffs match.</TableEmpty>
            ) : (
              rows.map((h) => (
                <tr key={h.id}>
                  <td className="mono text-[11px] text-ink-4 tabular-nums whitespace-nowrap">
                    {new Date(h.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="text-[12px] text-ink-3">{h.handoffType}</td>
                  <td className="text-[12px] text-ink-3">
                    <span className="mono">{h.villaCode ?? "—"}</span>
                    {h.bookingCode && (
                      <div className="mono text-[10px] text-ink-4">
                        {h.bookingCode}
                      </div>
                    )}
                  </td>
                  <td className="text-[12px] max-w-md truncate">
                    {h.guestSummary}
                  </td>
                  <td>
                    <Badge tone={PRIORITY_TONES[h.priority] ?? "neutral"}>
                      {h.priority}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONES[h.status] ?? "neutral"}>
                      {h.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {h.serviceRequestCode ?? "—"}
                  </td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-ai/handoffs/${h.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
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
    <Link href={href} className={active ? "filter-chip on" : "filter-chip"}>
      {children}
    </Link>
  );
}
