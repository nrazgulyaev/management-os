import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { getHandoffMetricsView } from "@/features/guest-ai-concierge/handoff-metrics";
import { formatDuration } from "@/features/guest-ai-concierge/replies-pure";

export const metadata = { title: "Handoff metrics" };
export const dynamic = "force-dynamic";

export default async function HandoffMetricsPage() {
  const view = await getHandoffMetricsView({ limit: 1000 });
  const { sla, byVilla, byType, byPriority, overdueOpen } = view;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI", href: "/dashboard/guest-ai" },
          { label: "Handoffs", href: "/dashboard/guest-ai/handoffs" },
          { label: "Metrics" },
        ]}
        title="Handoff metrics"
        description="Operational SLAs for guest concierge handoffs across the last ~1000 rows. Overdue thresholds: 30 min (urgent) / 2h (everything else)."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total" value={String(sla.total)} />
        <MetricCard
          label="Open"
          value={String(sla.open)}
          accent={sla.open > 0}
        />
        <MetricCard
          label="Urgent open"
          value={String(sla.urgentOpen)}
          accent={sla.urgentOpen > 0}
        />
        <MetricCard
          label="Overdue"
          value={String(sla.overdue)}
          accent={sla.overdue > 0}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard
          label="Median time-to-acknowledge"
          value={formatDuration(sla.medianTimeToAcknowledgeSec)}
        />
        <MetricCard
          label="Median first response"
          value={formatDuration(sla.medianTimeToFirstResponseSec)}
        />
        <MetricCard
          label="Median first staff read"
          value={formatDuration(view.medianFirstStaffReadSec)}
        />
        <MetricCard
          label="Median time-to-resolve"
          value={formatDuration(sla.medianTimeToResolveSec)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard
          label="Unread by guest"
          value={String(view.unread.byGuest)}
          accent={view.unread.byGuest > 0}
          hint="staff replies not yet read"
        />
        <MetricCard
          label="Unread by staff"
          value={String(view.unread.byStaff)}
          accent={view.unread.byStaff > 0}
          hint="guest replies awaiting attention"
        />
        <MetricCard
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
        <Section
          eyebrow="Attachments"
          title="By handoff type"
        >
          <ul className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
            {view.attachmentCountsByType.map((b) => (
              <li
                key={b.handoffType}
                className="px-4 py-3 flex items-center justify-between text-sm"
              >
                <span className="text-ink">{b.handoffType}</span>
                <span className="font-mono tabular-nums text-ink-tertiary">
                  {b.count}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        eyebrow="Overdue"
        title={`${overdueOpen.length} open over SLA`}
        description="Sorted by age. Tap to triage."
      >
        {overdueOpen.length === 0 ? (
          <p className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-6 text-sm text-ink-tertiary">
            None — nice.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Villa / Booking</th>
                  <th className="px-4 py-3">Age</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overdueOpen.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 text-xs">{r.handoffType}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          r.priority === "urgent" ? "danger" : "warning"
                        }
                      >
                        {r.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">
                      {r.villaCode ?? "—"}
                      {r.bookingCode && (
                        <div className="text-[10px] text-ink-tertiary">
                          {r.bookingCode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {formatDuration(r.ageSec)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/guest-ai/handoffs/${r.id}`}
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
        )}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BucketSection title="By villa" buckets={byVilla} />
        <BucketSection title="By type" buckets={byType} />
        <BucketSection title="By priority" buckets={byPriority} />
      </div>
    </div>
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
    <Section eyebrow="Breakdown" title={title}>
      {buckets.length === 0 ? (
        <p className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-4 text-xs text-ink-tertiary">
          No data yet. Guest AI handoff metrics roll up from concierge sessions; first signals appear after a guest interacts with the AI.
        </p>
      ) : (
        <ul className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
          {buckets.map((b) => (
            <li
              key={b.key}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex flex-col">
                <span className="text-sm text-ink font-medium">
                  {b.label}
                </span>
                <span className="text-[11px] text-ink-tertiary">
                  {b.total} total · {b.open} open · {b.urgentOpen} urgent ·{" "}
                  {b.resolved} resolved
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums text-ink-tertiary">
                {formatDuration(b.medianResolveSec)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
