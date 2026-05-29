import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { DashboardIcon } from "@/components/dashboard/icons";
import { RecentDigestsTile } from "@/components/digests/recent-digests-tile";
import { getLiveDashboardCounts } from "@/features/dashboard/live-counts";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  getPortfolioMetrics,
  getRevenueByChannel,
  getMonthlyRevenueStrip,
  getOwnersYtdPayouts,
  getPortfolioProjects,
  getTodaySchedule,
  getCurrentStatementNudge,
  getOperationalHealthTiles,
} from "@/features/dashboard/dashboard-cabinet-queries";
import { getAttentionFeed } from "@/features/dashboard/attention-feed";
import { AttentionFeedCard } from "@/components/dashboard/attention-feed-card";

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Overview live wiring.
 *
 * Visual port from `_handoff/management/index.html` (commit `9aaa68a`).
 * This commit replaces the prototype's mock arrays with live reads in
 * `src/features/dashboard/dashboard-cabinet-queries.ts`:
 *
 *   - portfolioMetrics    → getPortfolioMetrics()
 *   - revenueByChannel    → getRevenueByChannel()
 *   - monthlyRevenueStrip → getMonthlyRevenueStrip(6)
 *   - mockOwners (top 3)  → getOwnersYtdPayouts(3)
 *   - mockProjects        → getPortfolioProjects()
 *   - TODAY_SCHEDULE      → getTodaySchedule()
 *   - EV-07 nudge band    → getCurrentStatementNudge() (empty until
 *                           STATEMENT-1 ships the schema)
 *
 * Bookings live above the multi-tenancy line in the schema (no
 * `organization_id` column) — reads are tenant-wide, consistent with
 * `getLiveDashboardCounts()` shipped in commit 95501b1. AI Copilot
 * band kept as static empty-state copy until daily-digest agent runs
 * land (TASK-6-DATA-PART-1B).
 */

export const metadata = { title: "Portfolio overview" };
export const dynamic = "force-dynamic";

const IDR_BILLION_MINOR = 1_000_000_000_00; // 1B IDR in minor
const IDR_MILLION_MINOR = 1_000_000_00; // 1M IDR in minor

function fmtIdrM(minor: bigint): string {
  const m = Number(minor) / IDR_MILLION_MINOR;
  return `${m.toFixed(1)}M`;
}
function fmtIdrB(minor: bigint): string {
  const b = Number(minor) / IDR_BILLION_MINOR;
  return `${b.toFixed(2)}B`;
}
function fmtUsdK(usdMinor: bigint): string {
  const k = Number(usdMinor) / 100_000;
  return `$${Math.round(k).toLocaleString()}K`;
}

const CHANNEL_COLOR: Record<string, string> = {
  Airbnb: "var(--ok)",
  "Booking.com": "var(--gold)",
  Direct: "var(--sage, var(--ok))",
  Agoda: "var(--ink-3)",
  "Travel agent": "var(--terra)",
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function todayBrief(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default async function DashboardOverviewPage() {
  const [live, currentUser, metrics, channels, monthly, owners, portfolio, schedule, nudge, opsHealth, attention] =
    await Promise.all([
      getLiveDashboardCounts().catch(() => null),
      getCurrentAppUser().catch(() => null),
      getPortfolioMetrics().catch(() => null),
      getRevenueByChannel(1).catch(() => []),
      getMonthlyRevenueStrip(6).catch(() => []),
      getOwnersYtdPayouts(3).catch(() => []),
      getPortfolioProjects().catch(() => []),
      getTodaySchedule().catch(() => []),
      getCurrentStatementNudge().catch(() => null),
      getOperationalHealthTiles().catch(() => null),
      getAttentionFeed().catch(() => ({
        items: [],
        total: 0,
        counts: { critical: 0, high: 0, medium: 0 },
      })),
    ]);

  const firstName = currentUser?.fullName?.split(/\s+/)[0] ?? "operator";
  const villaCount = live?.villas ?? 0;
  const projectCount = portfolio.length;
  const upcomingCheckIns = live?.upcomingCheckIns ?? 0;
  const arrivalsToday = schedule.filter((s) => s.type === "arrival").length;

  const monthlyMax = Math.max(0, ...monthly.map((r) => Number(r.amountIdrMinor)));
  const sixMonthTotalMinor = monthly.reduce((s, r) => s + r.amountIdrMinor, 0n);

  return (
    <>
      <SectionHeading
        eyebrow={`${todayBrief()} · GMT+8`}
        title={
          <>
            {timeOfDayGreeting()},{" "}
            {/* `.display em` rule in typography.css already styles em
                inside .display as italic + terra; no inline needed. */}
            <em>{firstName}.</em>
          </>
        }
        subtitle={
          arrivalsToday > 0
            ? `${arrivalsToday} ${arrivalsToday === 1 ? "arrival" : "arrivals"} today, ${upcomingCheckIns} check-ins in the next 14 days.`
            : `${upcomingCheckIns} check-ins in the next 14 days. No arrivals scheduled today.`
        }
        actions={
          <>
            <button
              className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Export brief <DashboardIcon name="logo" width={13} height={13} />
            </button>
            <Link href="/dashboard/bookings" className="btn btn-primary btn-sm">
              New booking +
            </Link>
          </>
        }
      />

      {/* KPI strip — live portfolio metrics */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Kpi
          label="Occupancy YTD"
          value={metrics ? `${metrics.occupancyYtd}%` : "—"}
          sub={metrics && metrics.occupancyYtd > 0 ? "live · YTD" : "no bookings yet"}
          tone={metrics && metrics.occupancyYtd > 0 ? "success" : undefined}
        />
        <Kpi
          label="ADR"
          value={metrics && metrics.adrIdrMinor > 0n ? `IDR ${fmtIdrM(metrics.adrIdrMinor)}` : "—"}
          sub="live · YTD average"
          tone={metrics && metrics.adrIdrMinor > 0n ? "accent" : undefined}
        />
        <Kpi
          label="RevPAR"
          value={metrics && metrics.revparIdrMinor > 0n ? `IDR ${fmtIdrM(metrics.revparIdrMinor)}` : "—"}
          sub="live · YTD"
        />
        <Kpi
          label="Gross MTD"
          value={metrics && metrics.grossMtdIdrMinor > 0n ? `IDR ${fmtIdrB(metrics.grossMtdIdrMinor)}` : "—"}
          sub="live · this month"
          tone={metrics && metrics.grossMtdIdrMinor > 0n ? "gold" : undefined}
        />
        <Kpi
          label="Net to owners MTD"
          value={metrics && metrics.netToOwnersMtdIdrMinor > 0n ? `IDR ${fmtIdrB(metrics.netToOwnersMtdIdrMinor)}` : "—"}
          sub="gross × (1 − commission)"
        />
      </div>

      {/* Cross-cabinet attention queue — phase-2a PR 2 */}
      <div className="mb-3.5">
        <AttentionFeedCard feed={attention} />
      </div>

      {/* Today + AI Copilot */}
      <div className="grid grid-cols-[1.5fr_1fr] gap-3.5 mb-3.5">
        <Card padding="none" overflowHidden>
          <div className="px-5 py-4 flex items-center border-b border-line-soft">
            <h2 className="display-md">Today</h2>
            <span className="mono ml-auto text-[11px] text-ink-3">
              ARRIVALS · DEPARTURES
            </span>
          </div>
          {schedule.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No arrivals or departures scheduled for today.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Villa</th>
                  <th>Guest / Notes</th>
                  <th>Nights</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={`${row.villaCode}-${row.type}-${row.time}`}>
                    <td className="mono">{row.time}</td>
                    <td>{row.type === "arrival" ? "Arrival" : "Departure"}</td>
                    <td>{row.villaCode}</td>
                    <td>{row.guestName ?? "—"}</td>
                    <td>
                      <HandoffBadge tone={row.type === "arrival" ? "ok" : "warn"}>
                        {row.nights}n
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* DAILY-DIGEST-SPRINT-1 P4.4 — Recent digests tile replaces
            the previous scaffolded "Operations Copilot" placeholder.
            Empty state in the component still surfaces friendly copy
            until the first digest lands. */}
        <RecentDigestsTile basePath="/dashboard/digests" />
      </div>

      {/* Channels + Monthly revenue + Owners */}
      <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-3.5 mb-3.5">
        <Card className="p-5">
          <h3 className="display-sm">Revenue by channel</h3>
          <div className="label mt-1">MTD share</div>
          {channels.length === 0 ? (
            <p className="mt-4 text-[13px] text-ink-3 italic">
              No bookings this month yet.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-[11px]">
              {channels.map((c) => (
                <div key={c.channel}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span>{c.channel}</span>
                    <span className="num">{c.pctShare}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(c.pctShare * 2, 100)}%`,
                        background: CHANNEL_COLOR[c.channel] ?? "var(--ink-2)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline">
            <h3 className="display-sm">Six-month gross</h3>
            <span className="num ml-auto text-[11px] text-ink-3">
              IDR · billions
            </span>
          </div>
          {monthly.length === 0 ? (
            <p className="mt-[18px] text-[13px] text-ink-3 italic">
              No booking history yet.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-2 mt-[18px] h-[140px]">
                {monthly.map((row, i) => {
                  const h = monthlyMax > 0 ? (Number(row.amountIdrMinor) / monthlyMax) * 120 : 0;
                  return (
                    <div
                      key={row.monthIso}
                      className="flex-1 flex flex-col items-center gap-1.5"
                    >
                      <span className="num text-[10px] text-ink-3">
                        {fmtIdrB(row.amountIdrMinor)}
                      </span>
                      <div
                        className={
                          "w-full rounded-t-[4px] " +
                          (i === monthly.length - 1 ? "bg-terra" : "bg-forest")
                        }
                        style={{ height: `${Math.max(h, 2)}px` }}
                      />
                      <span className="mono text-[10px] text-ink-4">
                        {row.monthLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-[11px] text-ink-3">
                <span>
                  6-month total:{" "}
                  <span className="num text-ink">
                    IDR {fmtIdrB(sixMonthTotalMinor)}
                  </span>
                </span>
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="display-sm">Owners · YTD payouts</h3>
          <div className="label mt-1">
            USD-equivalent · top {owners.length}
          </div>
          {owners.length === 0 ? (
            <p className="mt-3.5 text-[13px] text-ink-3 italic">
              No owner payouts yet.
            </p>
          ) : (
            <ul className="clean mt-3.5">
              {owners.map((o) => {
                const initials = o.name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <li key={o.ownerId} className="py-2.5">
                    <span
                      className="w-8 h-8 rounded-full text-cream-warm flex items-center justify-center text-[11px] font-medium bg-[linear-gradient(135deg,var(--gold-soft),var(--terra))]"
                    >
                      {initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{o.name}</div>
                      <div className="mono text-[10px] text-ink-4">
                        {o.villasCount} {o.villasCount === 1 ? "villa" : "villas"}
                        {o.projectName ? ` · ${o.projectName.replace(/^\[DEMO\] /, "")}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[13px] text-terra">
                        {fmtUsdK(o.payoutUsdMinor)}
                      </div>
                      <div className="mono text-[10px] text-ink-3">
                        {o.yieldPct}% net
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Operational health — 4-up KPIs (live via getOperationalHealthTiles) */}
      <div className="grid grid-cols-4 gap-3 mb-3.5">
        <Kpi
          label="Open maintenance"
          value={opsHealth ? String(opsHealth.openMaintenance) : "—"}
          sub="ops cabinet · live"
          tone={opsHealth && opsHealth.openMaintenance > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Upcoming check-ins"
          value={String(upcomingCheckIns)}
          sub="next 14 days"
        />
        <Kpi
          label="Housekeeping"
          value={opsHealth ? String(opsHealth.housekeepingTurnoversToday) : "—"}
          sub="turnovers today"
        />
        <Kpi
          label="Owner stay requests"
          value={opsHealth ? String(opsHealth.ownerStayRequestsPending) : "—"}
          sub="awaiting decision"
        />
      </div>

      {/* Portfolio table — live */}
      <Card padding="none" overflowHidden>
        <div className="px-5 py-4 flex items-center border-b border-line-soft">
          <h2 className="display-md">
            Portfolio · {projectCount} {projectCount === 1 ? "project" : "projects"}
          </h2>
          <span className="mono ml-auto text-[11px] text-ink-3">
            {villaCount} VILLAS · {projectCount}{" "}
            {projectCount === 1 ? "PROJECT" : "PROJECTS"}
          </span>
        </div>
        {portfolio.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No villa-style projects yet. Seed a project + villas to populate.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Project</th>
                <th>Area</th>
                <th className="num">Villas</th>
                <th>Model</th>
                <th className="num">Occ. YTD</th>
                <th className="num">ADR (IDR M)</th>
                <th className="num">YTD revenue</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((p) => (
                <tr key={p.projectId}>
                  <td>
                    <span className="serif text-[15px]">
                      {p.projectName.replace(/^\[DEMO\] /, "")}
                    </span>
                  </td>
                  <td className="text-ink-3">{p.location}</td>
                  <td className="num">{p.villasCount}</td>
                  <td>
                    <HandoffBadge>{p.managementModel}</HandoffBadge>
                  </td>
                  <td className="num">{p.occYtdPct}%</td>
                  <td className="num">{fmtIdrM(p.adrIdrMinor)}</td>
                  <td className="num text-ink font-medium">
                    IDR {fmtIdrB(p.ytdRevenueIdrMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Statement nudge — empty state until STATEMENT-1 ships the schema */}
      {nudge ? (
        <div className="mt-6 px-5 py-3.5 border border-dashed border-line rounded-xl flex items-center gap-3.5 text-[13px] text-ink-3">
          <span className="badge badge-gold text-[9px]">NEXT</span>
          <span>
            Owner statement for{" "}
            <strong className="text-ink">
              {nudge.ownerName} · {nudge.villaCode} · {nudge.monthLabel}
            </strong>{" "}
            awaits your sign-off before auto-sending on {nudge.autoSendAt}.
          </span>
          <Link
            href={`/dashboard/finance/statements/${nudge.statementId}`}
            className="btn btn-terra btn-sm ml-auto"
          >
            Open statement →
          </Link>
        </div>
      ) : null}
    </>
  );
}
