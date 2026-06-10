import type { Metadata } from "next";
import Link from "next/link";
import {
  SectionHeading,
  Kpi,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { safeQuery } from "@/lib/development/safe-query";
import { loadRepSnapshots } from "@/lib/development/server/marketing/manager-performance-queries";

/**
 * `/development-os/marketing/performance/[managerId]` — one rep's period
 * snapshots, DS restyle of the legacy
 * /marketing/manager-performance/[managerId] table (that route now 308s
 * here). Same data source (manager_performance_metrics), read through
 * the org-scoped loadRepSnapshots helper; every legacy column is
 * preserved (period · type · leads · active · reservations · contracts ·
 * lost · avg response · quality).
 */

export const metadata: Metadata = { title: "Rep detail · Marketing" };
export const dynamic = "force-dynamic";

function fmtPeriod(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso ?? "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function RepDetailPage({
  params,
}: {
  params: Promise<{ managerId: string }>;
}) {
  const { managerId } = await params;
  const rows = await safeQuery(
    "repDetailSnapshots",
    loadRepSnapshots({ managerId, limit: 100 }),
    [],
  );

  const repName = rows[0]?.managerName ?? `${managerId.slice(0, 8)}…`;
  const totalLeads = rows.reduce((s, r) => s + r.totalLeadsAssigned, 0);
  const totalReservations = rows.reduce((s, r) => s + r.reservationsSecured, 0);
  const totalContracts = rows.reduce((s, r) => s + r.contractsSigned, 0);
  const totalLost = rows.reduce((s, r) => s + r.leadsLost, 0);
  const scored = rows.filter((r) => r.aiQualityScore != null);
  const avgQuality =
    scored.length > 0
      ? (
          scored.reduce((s, r) => s + Number(r.aiQualityScore), 0) /
          scored.length
        ).toFixed(1)
      : null;

  return (
    <>
      <SectionHeading
        eyebrow="workspace / marketing / performance"
        title={
          <>
            {repName}{" "}
            <span className="text-amber italic">
              · {rows.length} snapshot(s)
            </span>
          </>
        }
        subtitle="Per-period performance snapshots for this rep, computed by the weekly cron."
        actions={
          <Link
            href="/development-os/marketing/performance"
            prefetch={false}
            className="btn btn-dark btn-sm"
          >
            ← All reps
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-[18px] sm:grid-cols-4">
        <Kpi
          label="Leads assigned"
          value={String(totalLeads)}
          sub={`${totalLost} lost`}
          tone={totalLeads > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Reservations"
          value={String(totalReservations)}
          tone={totalReservations > 0 ? "success" : undefined}
        />
        <Kpi label="Contracts signed" value={String(totalContracts)} />
        <Kpi
          label="Avg quality score"
          value={avgQuality ?? "—"}
          sub={avgQuality ? `${scored.length} scored period(s)` : "no AI scores yet"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No snapshots for this rep"
          body="Snapshots are created weekly by the cron job. Check back after the next Monday 04:00 run."
          actions={
            <Link
              href="/development-os/marketing/performance"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              All reps
            </Link>
          }
        />
      ) : (
        <div className="bg-surface border border-line-soft rounded-[12px] overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                <th className="text-left px-4 py-2.5 font-medium">period</th>
                <th className="text-left px-3 py-2.5 font-medium">type</th>
                <th className="text-right px-3 py-2.5 font-medium">leads</th>
                <th className="text-right px-3 py-2.5 font-medium">active</th>
                <th className="text-right px-3 py-2.5 font-medium">res</th>
                <th className="text-right px-3 py-2.5 font-medium">
                  contracts
                </th>
                <th className="text-right px-3 py-2.5 font-medium">lost</th>
                <th className="text-right px-3 py-2.5 font-medium">
                  avg resp (m)
                </th>
                <th className="text-right px-4 py-2.5 font-medium">quality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-cream-warm"
                >
                  <td className="px-4 py-2.5 font-mono text-[10.5px] text-ink whitespace-nowrap">
                    {fmtPeriod(m.periodStart)} → {fmtPeriod(m.periodEnd)}
                  </td>
                  <td className="px-3 py-2.5">
                    <HandoffBadge tone="soft">{m.periodType}</HandoffBadge>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                    {m.totalLeadsAssigned}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {m.totalConversationsActive}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                    {m.reservationsSecured}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                    {m.contractsSigned}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {m.leadsLost}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {m.averageResponseTimeMinutes ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {m.aiQualityScore ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
