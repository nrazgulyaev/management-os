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
import { mockProjects } from "@/lib/mock/projects";
import { mockOwners } from "@/lib/mock/owners";
import {
  portfolioMetrics,
  revenueByChannel,
  monthlyRevenueStrip,
} from "@/lib/mock/metrics";

/**
 * Sprint _handoff/ Task 6 — Mgmt OS Overview cabinet.
 *
 * 1:1 port of `_handoff/management/index.html` (`app.js` block) into a
 * Next.js server component. Replaces the prior Sprint 1 / Task 4
 * composition (DashboardKpi / AreaChartCard / DonutRatioCard hero — all
 * primitives from the superseded `design_handoff_arconique_os` package).
 *
 * Section order matches the prototype:
 *   Greeting (time-aware) → 5-up KPI strip → Today schedule + AI
 *   Operations Copilot card → Channels + Monthly revenue + Owners glance
 *   → 4-up operational health KPIs → Portfolio table → Owner statement
 *   nudge band.
 *
 * Data sources (live → mock fallback in that order):
 *   getLiveDashboardCounts()   → villa/booking/check-in counts (DB)
 *   getCurrentAppUser()        → first-name in greeting
 *   portfolioMetrics           → occ YTD / ADR / RevPAR / MTD revenue
 *                                + open maintenance / upcoming check-ins
 *                                / housekeeping (mock; no live equivalent
 *                                ships in this commit — wire-up tracked
 *                                under Task 6 follow-up)
 *   revenueByChannel           → channel mix bars (mock)
 *   monthlyRevenueStrip        → six-month chart (mock)
 *   mockProjects               → portfolio table (mock)
 *   mockOwners                 → top-3 owners YTD payouts (mock)
 *
 * Hard-coded prototype demo (turnovers, AI advisory text, EV-07 Emma
 * Whitmore statement nudge) — preserved as-is for visual fidelity until
 * the live services land (operations service / AI runs service /
 * statement-detail server query).
 */

export const metadata = { title: "Portfolio overview" };
export const dynamic = "force-dynamic";

const IDR_TRILLION = 1_000_000_000_000;
const IDR_BILLION = 1_000_000_000;
const IDR_MILLION = 1_000_000;
const USD_PER_IDR = 1 / 16_000;

function rupiahMillions(minor: number): string {
  return `${(minor / IDR_BILLION).toFixed(1)}M`;
}
function rupiahBillions(minor: number): string {
  return `${(minor / IDR_TRILLION).toFixed(2)}B`;
}
function idrToUsdK(minor: number): string {
  const usd = (minor / IDR_MILLION) * USD_PER_IDR;
  return `$${Math.round(usd).toLocaleString()}K`;
}

const CHANNEL_COLOR: Record<string, string> = {
  emerald: "var(--ok)",
  gold: "var(--gold)",
  sage: "var(--sage, var(--ok))",
  stone: "var(--ink-3)",
  terracotta: "var(--terra)",
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
  const [live, currentUser] = await Promise.all([
    getLiveDashboardCounts().catch(() => null),
    getCurrentAppUser().catch(() => null),
  ]);

  const firstName =
    currentUser?.fullName?.split(/\s+/)[0] ?? "operator";
  const m = portfolioMetrics;

  // Live counts override mock equivalents where present.
  const villaCount = live?.villas ?? 19;
  const projectCount = live?.projects ?? mockProjects.length;
  const bedrooms = mockProjects.reduce((s, p) => s + p.bedrooms, 0);
  const upcomingCheckIns =
    live?.upcomingCheckIns ?? m.upcomingCheckins.value;

  // Pull a stable 6-month max for the bar-chart scale (max + 20% headroom).
  const monthlyMax = Math.max(...monthlyRevenueStrip.map((r) => r.revenue));
  const sixMonthTotal =
    monthlyRevenueStrip.reduce((s, r) => s + r.revenue, 0) / 1000; // → B IDR

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
        subtitle={`${m.upcomingCheckins.today} arrivals before sunset, ${m.openMaintenance.value} maintenance tickets open (${m.openMaintenance.sla} within SLA), ${m.housekeepingOpen.value} housekeeping tasks active.`}
        actions={
          <>
            <button className="btn btn-secondary btn-sm">
              Export brief <DashboardIcon name="logo" width={13} height={13} />
            </button>
            <Link href="/dashboard/bookings" className="btn btn-primary btn-sm">
              New booking +
            </Link>
          </>
        }
      />

      {/* KPI strip — 5-up */}
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
          value={`${m.occupancyYTD.value}%`}
          sub={`+${m.occupancyYTD.deltaYoY}pp YoY`}
          tone="success"
        />
        <Kpi
          label="ADR"
          value={`IDR ${rupiahMillions(m.adr.value)}`}
          sub={`+${m.adr.deltaYoY}% YoY`}
          tone="accent"
        />
        <Kpi
          label="RevPAR"
          value={`IDR ${rupiahMillions(m.revpar.value)}`}
          sub={`+${m.revpar.deltaYoY}% YoY`}
        />
        <Kpi
          label="Gross MTD"
          value={`IDR ${rupiahBillions(m.grossRevenueMTD.value)}`}
          sub={`+${m.grossRevenueMTD.deltaYoY}% MoM`}
          tone="gold"
        />
        <Kpi
          label="Net to owners MTD"
          value={`IDR ${rupiahBillions(m.netOwnerPayoutsMTD.value)}`}
          sub={`+${m.netOwnerPayoutsMTD.deltaYoY}% MoM`}
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
              ARRIVALS · DEPARTURES · TURNOVERS
            </span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Villa</th>
                <th>Guest / Notes</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {TODAY_SCHEDULE.map((row) => (
                <tr key={`${row.time}-${row.villa}-${row.type}`}>
                  <td className="mono">{row.time}</td>
                  <td>{row.type}</td>
                  <td>{row.villa}</td>
                  <td>{row.notes}</td>
                  <td>
                    <Badge tone={row.state.tone}>{row.state.label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* AI Operations Copilot card — placeholder copy until AI runs
            service is wired (Task 6 follow-up). */}
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
              AI · Operations Copilot · 06:18
            </div>
            <h3
              style={{
                margin: "8px 0 12px",
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 22,
                fontWeight: 400,
                lineHeight: 1.25,
              }}
            >
              <em
                style={{
                  color: "var(--gold-soft)",
                  fontStyle: "italic",
                }}
              >
                ES-S6
              </em>{" "}
              blocked since yesterday — pool filter on backorder. AC ticket
              still in progress. Suggest extending block until 24 Apr and
              notifying Emma Whitmore (her stay request is 27 Apr).
            </h3>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Link
                href="/dashboard/operations"
                className="btn"
                style={{
                  background: "var(--cream-warm)",
                  color: "var(--ink)",
                  fontSize: 12,
                  padding: "6px 12px",
                }}
              >
                Apply block + notify
              </Link>
              <Link
                href="/dashboard/ai"
                className="btn"
                style={{
                  background: "transparent",
                  color: "var(--cream-warm)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: 12,
                  padding: "6px 12px",
                }}
              >
                Show reasoning
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
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 11,
            }}
          >
            {revenueByChannel.map((c) => (
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
                  <span className="num">{c.share}%</span>
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
                      width: `${c.share * 2}%`,
                      background: CHANNEL_COLOR[c.tone] ?? "var(--ink-2)",
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
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
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              marginTop: 18,
              height: 140,
            }}
          >
            {monthlyRevenueStrip.map((row, i) => (
              <div
                key={row.month}
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
                  {(row.revenue / 1000).toFixed(1)}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${(row.revenue / monthlyMax) * 120}px`,
                    background:
                      i === monthlyRevenueStrip.length - 1
                        ? "var(--terra)"
                        : "var(--forest)",
                    borderRadius: "4px 4px 0 0",
                  }}
                />
                <span
                  className="mono"
                  style={{ fontSize: 10, color: "var(--ink-4)" }}
                >
                  {row.month}
                </span>
              </div>
            ))}
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
                IDR {sixMonthTotal.toFixed(2)}B
              </span>
            </span>
            <span>
              Forecast next:{" "}
              <span className="num" style={{ color: "var(--gold)" }}>
                IDR {(monthlyMax / 1000).toFixed(2)}B
              </span>
            </span>
          </div>
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
            USD-equivalent · top {Math.min(mockOwners.length, 3)}
          </div>
          <ul className="clean" style={{ marginTop: 14 }}>
            {mockOwners.slice(0, 3).map((o) => (
              <li key={o.id} style={{ padding: "10px 0" }}>
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
                  {o.initials}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {o.displayName}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 10, color: "var(--ink-4)" }}
                  >
                    {o.scope}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="num"
                    style={{ fontSize: 13, color: "var(--terra)" }}
                  >
                    {idrToUsdK(o.ytdPayouts)}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 10, color: "var(--ink-3)" }}
                  >
                    {o.annualizedYield}% yield
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Operational health — 4-up */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Kpi
          label="Open maintenance"
          value={m.openMaintenance.value}
          sub={`${m.openMaintenance.sla} within SLA`}
        />
        <Kpi
          label="Upcoming check-ins"
          value={upcomingCheckIns}
          sub={`${m.upcomingCheckins.today} today · next 14 days`}
        />
        <Kpi
          label="Housekeeping"
          value={m.housekeepingOpen.value}
          sub={`${m.housekeepingOpen.onTrack} on track`}
        />
        <Kpi
          label="Owner stay requests"
          value="2"
          sub="1 needs relocation · 1 approved"
        />
      </div>

      {/* Portfolio table */}
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
            Portfolio · {projectCount} projects
          </h2>
          <span
            className="mono"
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "var(--ink-3)",
            }}
          >
            {villaCount} VILLAS · {bedrooms} BEDROOMS · {projectCount} PROJECTS
          </span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Project</th>
              <th>Area</th>
              <th className="num">Villas</th>
              <th>Model</th>
              <th className="num">Occ. YTD</th>
              <th className="num">ADR (IDR M)</th>
              <th className="num">RevPAR</th>
              <th className="num">YTD revenue</th>
            </tr>
          </thead>
          <tbody>
            {mockProjects.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      className="mono"
                      style={{
                        padding: "2px 6px",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        background: "var(--cream-warm)",
                        fontSize: 10,
                      }}
                    >
                      {p.code}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-newsreader), serif",
                        fontSize: 15,
                      }}
                    >
                      {p.name}
                    </span>
                  </div>
                </td>
                <td style={{ color: "var(--ink-3)" }}>{p.area}</td>
                <td className="num">{p.villas}</td>
                <td>
                  <Badge>{p.ownershipModel}</Badge>
                </td>
                <td className="num">{p.occupancy}%</td>
                <td className="num">{rupiahMillions(p.adr)}</td>
                <td className="num">{rupiahMillions(p.revpar)}</td>
                <td
                  className="num"
                  style={{ color: "var(--ink)", fontWeight: 500 }}
                >
                  IDR {rupiahBillions(p.ytdRevenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Statement nudge */}
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
            Emma Whitmore · EV-07 · March 2026
          </strong>{" "}
          awaits your sign-off before auto-sending on 1 May 09:00 GMT+8.
        </span>
        <Link
          href="/dashboard/finance"
          className="btn btn-terra btn-sm"
          style={{ marginLeft: "auto" }}
        >
          Open statement →
        </Link>
      </div>
    </>
  );
}

// ============================================================
// Today's schedule — preserved from prototype until ops service wires
// arrivals/departures/turnovers (Task 6 follow-up).
// ============================================================

interface BadgeTone {
  label: string;
  tone?: "ok" | "warn" | "info" | "gold";
}
interface ScheduleRow {
  time: string;
  type: string;
  villa: string;
  notes: string;
  state: BadgeTone;
}

const TODAY_SCHEDULE: ScheduleRow[] = [
  {
    time: "11:00",
    type: "Turnover",
    villa: "ES-S2",
    notes: "Sari W. · checklist 11/18",
    state: { label: "In progress", tone: "info" },
  },
  {
    time: "13:00",
    type: "Inspection",
    villa: "EV-07",
    notes: "Ketut A. · awaiting Made S. sign-off",
    state: { label: "Approval", tone: "gold" },
  },
  {
    time: "14:00",
    type: "Arrival",
    villa: "EV-07",
    notes: "H. Williams · 5 nights · BCN agent",
    state: { label: "Ready 13:30", tone: "ok" },
  },
  {
    time: "14:30",
    type: "Turnover",
    villa: "AH-02",
    notes: "Made T. · checklist 0/24",
    state: { label: "Queued" },
  },
  {
    time: "15:30",
    type: "Arrival",
    villa: "ES-S2",
    notes: "Family Nielsen · 6 nights · Direct",
    state: { label: "Cleaning", tone: "info" },
  },
  {
    time: "16:00",
    type: "Arrival",
    villa: "ES-S5",
    notes: "A. Martin · 4 nights · Booking.com",
    state: { label: "Ready", tone: "ok" },
  },
  {
    time: "11:30",
    type: "Departure",
    villa: "AH-02",
    notes: "S. Dubois · late checkout till 12:00",
    state: { label: "Checkout", tone: "warn" },
  },
];
