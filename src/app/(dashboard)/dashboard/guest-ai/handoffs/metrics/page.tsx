import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { getHandoffMetricsView } from "@/features/guest-ai-concierge/handoff-metrics";
import { formatDuration } from "@/features/guest-ai-concierge/replies-pure";

export const metadata = { title: "Handoff metrics" };
export const dynamic = "force-dynamic";

export default async function HandoffMetricsPage() {
  const view = await getHandoffMetricsView({ limit: 1000 });
  const { sla, byVilla, byType, byPriority, overdueOpen } = view;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <Link href="/dashboard/guest-ai/handoffs">Handoffs</Link> /{" "}
            <span>Metrics</span>
          </div>
          <h1>Handoff metrics</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Operational SLAs for guest concierge handoffs across the last
            ~1000 rows. Overdue thresholds: 30 min (urgent) / 2h (everything
            else).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Kpi label="Total" value={String(sla.total)} />
        <Kpi
          label="Open"
          value={String(sla.open)}
          tone={sla.open > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Urgent open"
          value={String(sla.urgentOpen)}
          tone={sla.urgentOpen > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Overdue"
          value={String(sla.overdue)}
          tone={sla.overdue > 0 ? "warn" : undefined}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Kpi
          label="Median time-to-acknowledge"
          value={formatDuration(sla.medianTimeToAcknowledgeSec)}
        />
        <Kpi
          label="Median first response"
          value={formatDuration(sla.medianTimeToFirstResponseSec)}
        />
        <Kpi
          label="Median first staff read"
          value={formatDuration(view.medianFirstStaffReadSec)}
        />
        <Kpi
          label="Median time-to-resolve"
          value={formatDuration(sla.medianTimeToResolveSec)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-[18px]">
        <Kpi
          label="Unread by guest"
          value={String(view.unread.byGuest)}
          sub="staff replies not yet read"
          tone={view.unread.byGuest > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Unread by staff"
          value={String(view.unread.byStaff)}
          sub="guest replies awaiting attention"
          tone={view.unread.byStaff > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Attachments uploaded"
          value={String(
            view.attachmentCountsByType.reduce(
              (a, b) => a + b.count,
              0,
            ),
          )}
        />
      </div>

      {view.attachmentCountsByType.length > 0 && (
        <>
          <h2 className="display text-[22px] font-normal mt-8 mb-3.5">
            Attachments by handoff type
          </h2>
          <ul className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
            {view.attachmentCountsByType.map((b) => (
              <li
                key={b.handoffType}
                className="px-4 py-3 flex items-center justify-between text-sm"
              >
                <span>{b.handoffType}</span>
                <span className="mono tabular-nums text-ink-3">
                  {b.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          {overdueOpen.length} open over SLA
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          Sorted by age. Tap to triage.
        </p>
      </div>
      {overdueOpen.length === 0 ? (
        <p className="card px-5 py-[18px] text-sm text-ink-4">
          None — nice.
        </p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Priority</th>
                <th scope="col">Villa / Booking</th>
                <th scope="col" className="num">Age</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {overdueOpen.map((r) => (
                <tr key={r.id}>
                  <td className="text-[12px] text-ink-3">{r.handoffType}</td>
                  <td>
                    <Badge
                      tone={
                        r.priority === "urgent" ? "danger" : "warning"
                      }
                    >
                      {r.priority}
                    </Badge>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    <span className="mono">{r.villaCode ?? "—"}</span>
                    {r.bookingCode && (
                      <div className="mono text-[10px] text-ink-4">
                        {r.bookingCode}
                      </div>
                    )}
                  </td>
                  <td className="num mono tabular-nums text-[12px]">
                    {formatDuration(r.ageSec)}
                  </td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-ai/handoffs/${r.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] mt-8">
        <BucketSection title="By villa" buckets={byVilla} />
        <BucketSection title="By type" buckets={byType} />
        <BucketSection title="By priority" buckets={byPriority} />
      </div>
    </>
  );
}

function BucketSection({
  title,
  buckets,
}: {
  title: string;
  buckets: import("@/features/guest-ai-concierge/replies-pure").MetricBucket[];
}) {
  return (
    <div>
      <h2 className="display text-[22px] font-normal mb-3.5">{title}</h2>
      {buckets.length === 0 ? (
        <p className="card px-4 py-3.5 text-xs text-ink-4">
          No data yet. Guest AI handoff metrics roll up from concierge sessions; first signals appear after a guest interacts with the AI.
        </p>
      ) : (
        <ul className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
          {buckets.map((b) => (
            <li
              key={b.key}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {b.label}
                </span>
                <span className="text-[11px] text-ink-4">
                  {b.total} total · {b.open} open · {b.urgentOpen} urgent ·{" "}
                  {b.resolved} resolved
                </span>
              </div>
              <span className="mono text-xs tabular-nums text-ink-3">
                {formatDuration(b.medianResolveSec)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
