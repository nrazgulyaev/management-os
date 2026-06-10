import type { Metadata } from "next";
import Link from "next/link";
import {
  SectionHeading,
  Kpi,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { safeQuery } from "@/lib/development/safe-query";
import {
  loadRepScoreboard,
  loadRepSnapshots,
} from "@/lib/development/server/marketing/manager-performance-queries";

/**
 * `/development-os/marketing/performance` — per-rep manager performance
 * scoreboard, mock cabinets/new/dev-marketing.html §02 variant C
 * ("Manager performance · per-rep stats"). Replaces the legacy
 * /marketing/manager-performance snapshot table (that route now 308s
 * here). Data source unchanged: manager_performance_metrics snapshots
 * (weekly cron + manual recompute), read through the org-scoped
 * loadRepScoreboard / loadRepSnapshots helpers.
 *
 * Honest-data note: the snapshots carry no revenue column, so the
 * mock's "$1.8M ind" cell is intentionally NOT rendered — the
 * scoreboard shows leads · reservations · contracts · win rate ·
 * quality score instead.
 */

export const metadata: Metadata = { title: "Rep performance · Marketing" };
export const dynamic = "force-dynamic";

function fmtPeriod(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default async function RepPerformancePage() {
  const [reps, snapshots] = await Promise.all([
    safeQuery("repScoreboard", loadRepScoreboard(), []),
    safeQuery("repSnapshots", loadRepSnapshots({ limit: 40 }), []),
  ]);

  const totalLeads = reps.reduce((s, r) => s + r.leadsAssigned, 0);
  const totalReservations = reps.reduce((s, r) => s + r.reservations, 0);
  const totalContracts = reps.reduce((s, r) => s + r.contracts, 0);
  const scored = reps.filter((r) => r.avgQualityScore != null);
  const avgQuality =
    scored.length > 0
      ? (
          scored.reduce((s, r) => s + (r.avgQualityScore ?? 0), 0) /
          scored.length
        ).toFixed(1)
      : null;
  const maxLeads = reps.reduce((m, r) => Math.max(m, r.leadsAssigned), 0);

  return (
    <>
      <SectionHeading
        eyebrow="workspace / marketing / performance"
        title={
          <>
            Rep performance.{" "}
            <span className="text-amber">Per manager, per period.</span>
          </>
        }
        subtitle={`${reps.length} rep(s) tracked · ${totalLeads} leads handled · ${totalReservations} reservations secured`}
        actions={
          <>
            <Link
              href="/development-os/marketing/conversations"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Conversations
            </Link>
            <Link
              href="/development-os/marketing"
              prefetch={false}
              className="btn btn-ghost btn-sm"
            >
              ← Marketing
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-[18px] sm:grid-cols-4">
        <Kpi
          label="Reps tracked"
          value={String(reps.length)}
          sub={`${snapshots.length} recent snapshot(s)`}
        />
        <Kpi
          label="Leads handled"
          value={String(totalLeads)}
          tone={totalLeads > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Reservations"
          value={String(totalReservations)}
          sub={`${totalContracts} contracts signed`}
          tone={totalReservations > 0 ? "success" : undefined}
        />
        <Kpi
          label="Avg quality score"
          value={avgQuality ?? "—"}
          sub={avgQuality ? `across ${scored.length} scored rep(s)` : "no AI scores yet"}
        />
      </div>

      {reps.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No performance snapshots yet"
          body="The weekly Mon 04:00 cron populates manager performance from conversation threads. Run it manually from Jobs to seed."
          actions={
            <Link
              href="/dashboard/jobs"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              View jobs
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-7 gap-y-6 lg:grid-cols-[1.2fr_1fr]">
          {/* ---- LEFT: per-rep scoreboard (mock variant C) ---- */}
          <section className="min-w-0">
            <h3 className="display text-[22px] font-normal text-ink mb-3">
              Scoreboard{" "}
              <span className="text-amber italic">· {reps.length}</span>
            </h3>
            <div className="flex flex-col gap-2">
              {reps.map((r) => (
                <Link
                  key={r.managerId}
                  href={`/development-os/marketing/performance/${r.managerId}`}
                  prefetch={false}
                  className="block bg-surface border border-line-soft rounded-[10px] px-3.5 py-3 hover:border-line"
                >
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="display text-[16px] text-ink">
                      {r.managerName}
                    </span>
                    <HandoffBadge tone="soft">{r.periodType}</HandoffBadge>
                    <span className="ml-auto font-mono text-[10.5px] text-ink-tertiary whitespace-nowrap">
                      {fmtPeriod(r.firstPeriodStart)} →{" "}
                      {fmtPeriod(r.lastPeriodEnd)} · {r.snapshotCount} period(s)
                    </span>
                  </div>
                  <div className="mt-2 h-[9px] rounded bg-inset overflow-hidden">
                    <div
                      className="h-full rounded bg-amber"
                      style={{
                        width: `${
                          maxLeads > 0
                            ? Math.max((r.leadsAssigned / maxLeads) * 100, 2)
                            : 2
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 font-mono text-[10.5px] text-ink-tertiary flex gap-x-3 gap-y-1 flex-wrap">
                    <span>
                      <strong className="text-ink">{r.leadsAssigned}</strong>{" "}
                      leads
                    </span>
                    <span>
                      <strong className="text-ink">{r.reservations}</strong>{" "}
                      reservations
                    </span>
                    <span>
                      <strong className="text-ink">{r.contracts}</strong>{" "}
                      contracts
                    </span>
                    <span>
                      win rate{" "}
                      <strong className="text-ink">
                        {r.winRatePct != null ? `${r.winRatePct}%` : "—"}
                      </strong>
                    </span>
                    <span>
                      quality{" "}
                      <strong className="text-ink">
                        {r.avgQualityScore != null
                          ? `★${r.avgQualityScore}`
                          : "—"}
                      </strong>
                    </span>
                    {r.avgResponseMinutes != null && (
                      <span>
                        resp{" "}
                        <strong className="text-ink">
                          {r.avgResponseMinutes}m
                        </strong>
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-2.5 mb-0 font-mono text-[10px] text-ink-tertiary">
              Aggregated per rep over the most granular snapshot period
              available (weekly preferred). Revenue attribution is not
              captured on these snapshots.
            </p>
          </section>

          {/* ---- RIGHT: recent period snapshots ---- */}
          <section className="min-w-0 lg:border-l lg:border-line-soft lg:pl-7">
            <h3 className="display text-[22px] font-normal text-ink mb-3">
              Recent snapshots{" "}
              <span className="text-amber italic">· {snapshots.length}</span>
            </h3>
            <div className="bg-surface border border-line-soft rounded-[12px] overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                    <th className="text-left px-4 py-2.5 font-medium">rep</th>
                    <th className="text-left px-3 py-2.5 font-medium">
                      period
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium">
                      leads
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium">res</th>
                    <th className="text-right px-3 py-2.5 font-medium">
                      lead→res
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium">
                      quality
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-line-soft last:border-b-0 hover:bg-cream-warm"
                    >
                      <td className="px-4 py-2.5 text-[12px] text-ink">
                        <Link
                          href={`/development-os/marketing/performance/${m.managerId}`}
                          prefetch={false}
                          className="hover:underline"
                        >
                          {m.managerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10.5px] text-ink-tertiary whitespace-nowrap">
                        {fmtPeriod(m.periodStart)} → {fmtPeriod(m.periodEnd)}
                        <span className="block text-[9px]">{m.periodType}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                        {m.totalLeadsAssigned}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                        {m.reservationsSecured}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                        {m.leadToReservationRate != null
                          ? `${m.leadToReservationRate}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                        {m.aiQualityScore ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
