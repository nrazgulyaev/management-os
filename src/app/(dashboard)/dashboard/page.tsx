import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import { DashboardIcon } from "@/components/dashboard/icons";
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
} from "@/features/dashboard/dashboard-cabinet-queries";

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
  const [live, currentUser, metrics, channels, monthly, owners, portfolio, schedule, nudge] =
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
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>
              {firstName}.
            </em>
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
              className="btn btn-secondary btn-sm"
              disabled
              title="Coming soon"
              style={{ opacity: 0.55, cursor: "not-allowed" }}
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
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

      {/* Today + AI Copilot */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 22,
                fontWeight: 400,
              }}
            >
              Today
            </h2>
            <span
              className="mono"
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--ink-3)",
              }}
            >
              ARRIVALS · DEPARTURES
            </span>
          </div>
          {schedule.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
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
                      <Badge tone={row.type === "arrival" ? "ok" : "warn"}>
                        {row.nights}n
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* AI Operations Copilot — empty state until daily-digest agent runs */}
        <Card
          style={{
            padding: 20,
            background: "var(--forest)",
            color: "var(--cream-warm)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.13,
              background:
                "radial-gradient(60% 60% at 100% 0%, var(--gold) 0%, transparent 60%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div className="label" style={{ color: "rgba(244,239,230,0.6)" }}>
              AI · Operations Copilot
            </div>
            <h3
              style={{
                margin: "8px 0 12px",
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 20,
                fontWeight: 400,
                lineHeight: 1.3,
              }}
            >
              The Operations Copilot surfaces here the first time the
              daily-digest agent files a run.
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(244,239,230,0.8)", lineHeight: 1.5 }}>
              Configure the agent on the AI hub to start receiving
              morning briefs with arrivals, turnovers, and exception flags.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Link
                href="/dashboard/ai"
                className="btn"
                style={{
                  background: "var(--cream-warm)",
                  color: "var(--ink)",
                  fontSize: 12,
                  padding: "6px 12px",
                }}
              >
                Configure agent
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* Channels + Monthly revenue + Owners */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.3fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <Card style={{ padding: 20 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            Revenue by channel
          </h3>
          <div className="label" style={{ marginTop: 4 }}>
            MTD share
          </div>
          {channels.length === 0 ? (
            <p style={{ marginTop: 16, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No bookings this month yet.
            </p>
          ) : (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 11,
              }}
            >
              {channels.map((c) => (
                <div key={c.channel}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                      marginBottom: 4,
                    }}
                  >
                    <span>{c.channel}</span>
                    <span className="num">{c.pctShare}%</span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "var(--cream-deep)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(c.pctShare * 2, 100)}%`,
                        background: CHANNEL_COLOR[c.channel] ?? "var(--ink-2)",
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 18,
                fontWeight: 400,
              }}
            >
              Six-month gross
            </h3>
            <span
              className="num"
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--ink-3)",
              }}
            >
              IDR · billions
            </span>
          </div>
          {monthly.length === 0 ? (
            <p style={{ marginTop: 18, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No booking history yet.
            </p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                  marginTop: 18,
                  height: 140,
                }}
              >
                {monthly.map((row, i) => {
                  const h = monthlyMax > 0 ? (Number(row.amountIdrMinor) / monthlyMax) * 120 : 0;
                  return (
                    <div
                      key={row.monthIso}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        className="num"
                        style={{ fontSize: 10, color: "var(--ink-3)" }}
                      >
                        {fmtIdrB(row.amountIdrMinor)}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          height: `${Math.max(h, 2)}px`,
                          background:
                            i === monthly.length - 1
                              ? "var(--terra)"
                              : "var(--forest)",
                          borderRadius: "4px 4px 0 0",
                        }}
                      />
                      <span
                        className="mono"
                        style={{ fontSize: 10, color: "var(--ink-4)" }}
                      >
                        {row.monthLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 12,
                  fontSize: 11,
                  color: "var(--ink-3)",
                }}
              >
                <span>
                  6-month total:{" "}
                  <span className="num" style={{ color: "var(--ink)" }}>
                    IDR {fmtIdrB(sixMonthTotalMinor)}
                  </span>
                </span>
              </div>
            </>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            Owners · YTD payouts
          </h3>
          <div className="label" style={{ marginTop: 4 }}>
            USD-equivalent · top {owners.length}
          </div>
          {owners.length === 0 ? (
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No owner payouts yet.
            </p>
          ) : (
            <ul className="clean" style={{ marginTop: 14 }}>
              {owners.map((o) => {
                const initials = o.name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <li key={o.ownerId} style={{ padding: "10px 0" }}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background:
                          "linear-gradient(135deg, var(--gold-soft), var(--terra))",
                        color: "var(--cream-warm)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      {initials}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
                      <div
                        className="mono"
                        style={{ fontSize: 10, color: "var(--ink-4)" }}
                      >
                        {o.villasCount} {o.villasCount === 1 ? "villa" : "villas"}
                        {o.projectName ? ` · ${o.projectName.replace(/^\[DEMO\] /, "")}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="num"
                        style={{ fontSize: 13, color: "var(--terra)" }}
                      >
                        {fmtUsdK(o.payoutUsdMinor)}
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: 10, color: "var(--ink-3)" }}
                      >
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

      {/* Operational health — 4-up KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Kpi label="Open maintenance" value="—" sub="ops cabinet · live" />
        <Kpi
          label="Upcoming check-ins"
          value={String(upcomingCheckIns)}
          sub="next 14 days"
        />
        <Kpi label="Housekeeping" value="—" sub="no tasks seeded" />
        <Kpi label="Owner stay requests" value="—" sub="coming soon" />
      </div>

      {/* Portfolio table — live */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 22,
              fontWeight: 400,
            }}
          >
            Portfolio · {projectCount} {projectCount === 1 ? "project" : "projects"}
          </h2>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            {villaCount} VILLAS · {projectCount}{" "}
            {projectCount === 1 ? "PROJECT" : "PROJECTS"}
          </span>
        </div>
        {portfolio.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
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
                    <span
                      style={{
                        fontFamily: "var(--font-newsreader), serif",
                        fontSize: 15,
                      }}
                    >
                      {p.projectName.replace(/^\[DEMO\] /, "")}
                    </span>
                  </td>
                  <td style={{ color: "var(--ink-3)" }}>{p.location}</td>
                  <td className="num">{p.villasCount}</td>
                  <td>
                    <Badge>{p.managementModel}</Badge>
                  </td>
                  <td className="num">{p.occYtdPct}%</td>
                  <td className="num">{fmtIdrM(p.adrIdrMinor)}</td>
                  <td className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>
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
        <div
          style={{
            marginTop: 24,
            padding: "14px 20px",
            border: "1px dashed var(--line)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
          <span className="badge badge-gold" style={{ fontSize: 9 }}>
            NEXT
          </span>
          <span>
            Owner statement for{" "}
            <strong style={{ color: "var(--ink)" }}>
              {nudge.ownerName} · {nudge.villaCode} · {nudge.monthLabel}
            </strong>{" "}
            awaits your sign-off before auto-sending on {nudge.autoSendAt}.
          </span>
          <Link
            href={`/dashboard/finance/statements/${nudge.statementId}`}
            className="btn btn-terra btn-sm"
            style={{ marginLeft: "auto" }}
          >
            Open statement →
          </Link>
        </div>
      ) : null}
    </>
  );
}
