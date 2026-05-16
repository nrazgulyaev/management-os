import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS Overview / Command center.
 *
 * 1:1 visual port of `_handoff/development/index.html` (app.js block).
 * Mock data preserved as-is — live wiring deferred to TASK-7-DATA per
 * docs/audits/task-6-7-data-wiring-todo.md.
 *
 * Lives under the Task 5 development shell (DevelopmentAppShell). Body
 * content only — sidebar / topbar / trial banner / MobileTabbar all
 * preserved.
 *
 * Section order: SectionHeading → 5-up KPIs → qs-cost-analyst AI band
 * (amber corner-marks panel) → Projects roll-up table → 2-up (Risk
 * radar + Site activity today) → Team grid (8 staff cards).
 */

export const metadata = { title: "Development OS · Command center" };
export const dynamic = "force-dynamic";

// TODO(task-7-data): wire to features/development/services.listActiveProjects().
const PROJECTS = [
  { code: "EP02", name: "Eternal Phase 02", units: 12, gdvM: 5.4, stage: "construction", prog: 58, ontrack: true, irr: 23.4 },
  { code: "ES10", name: "Enso 10 Pool", units: 8, gdvM: 7.4, stage: "construction", prog: 34, ontrack: true, irr: 21.8 },
  { code: "AHP3", name: "Ahau Phase 3", units: 5, gdvM: 6.8, stage: "permit", prog: 14, ontrack: false, irr: 18.2 },
];

// TODO(task-7-data): wire to features/development/services.listRiskRadar().
const RISK_RADAR: { color: string; label: string; tone: "danger" | "warn" | "info"; badge: string }[] = [
  { color: "var(--danger)", label: "AHP3 permit stalled · 12 days", tone: "danger", badge: "Critical" },
  { color: "var(--amber)", label: "EP02 marble PO over baseline", tone: "warn", badge: "High" },
  { color: "var(--warn)", label: "ES10 rebar lead-time +4 days", tone: "warn", badge: "Medium" },
  { color: "var(--steel)", label: "Heavy rain forecast 23–25 Apr", tone: "info", badge: "Weather" },
];

// TODO(task-7-data): wire to features/development/services.listSiteActivityToday().
const SITE_ACTIVITY: { at: string; text: string; tone?: "warn" | "info" | undefined; badge: string }[] = [
  { at: "04:30", text: "EP02 · Block B concrete pour · 1,420 m³", tone: "warn", badge: "In progress" },
  { at: "08:00", text: "ES10 · MEP rough-in inspection", badge: "Scheduled" },
  { at: "10:00", text: "AHP3 · permit office meeting", tone: "warn", badge: "Critical" },
  { at: "14:00", text: "EP02 · marble samples vendor visit", badge: "Scheduled" },
];

// TODO(task-7-data): wire to features/development/services.listTeamRoster().
const STAFF = [
  { name: "Nikita R.", role: "Director", init: "NR" },
  { name: "Made S.", role: "Project Manager", init: "MS" },
  { name: "Komang Y.", role: "Site Supervisor", init: "KY" },
  { name: "Dewi S.", role: "CFO / Accountant", init: "DS" },
  { name: "Wayan T.", role: "QS / Cost Analyst", init: "WT" },
  { name: "Ari P.", role: "Procurement", init: "AP" },
  { name: "Putu L.", role: "Marketing", init: "PL" },
  { name: "Inka R.", role: "Sales Manager", init: "IR" },
];

export default function DevelopmentOverviewPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Tuesday · 21 April 2026 · WK36"
        title={
          <>
            Three projects in motion.{" "}
            <span style={{ color: "var(--amber)" }}>One demands your eyes.</span>
          </>
        }
        subtitle="Eternal Phase 02 on track at 58% complete · Enso 10 Pool ahead of schedule · Ahau Phase 3 stalled in permit (12-day delay)."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Daily digest PDF ↓</button>
            <button className="btn btn-amber btn-sm">New project +</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        <Kpi label="Active projects" value="3" sub="1 watch · 2 on track" tone="accent" />
        <Kpi label="Total commitment" value="$24M" sub="across 14 LPs" />
        <Kpi label="Avg progress" value="35%" sub="weighted by GDV" />
        <Kpi label="Cost variance · agg" value="+1.4%" sub="EAC +2.1%" tone="accent" />
        <Kpi label="Portfolio IRR · YTD" value="23.4%" sub="vs PPM 18.0%" tone="success" />
      </div>

      {/* AI band — qs-cost-analyst run */}
      <Card
        className="corner-marks"
        style={{
          padding: 24,
          marginBottom: 18,
          borderColor: "var(--amber)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 42,
              height: 42,
              background: "rgba(255,107,53,0.15)",
              border: "1px solid var(--amber)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--amber)",
            }}
          >
            ✦
          </span>
          <div style={{ flex: 1 }}>
            <div className="label label-amber">qs-cost-analyst · 06:14 · run 4af2</div>
            <p
              style={{
                margin: "8px 0 14px",
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--ink)",
              }}
            >
              Line{" "}
              <span className="mono" style={{ color: "var(--amber)" }}>
                EP02.WP-04.18.b · Marble Hindari 60×60
              </span>{" "}
              is <strong>+18.4%</strong> vs 6-month rolling baseline for comparable lots
              from supplier <span className="mono">BatuJaya</span>. Median across 4
              reference projects is $42/m²; we are quoted $49.6/m². Suggest re-RFQ to 2
              backup vendors before approving PO.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-amber btn-sm">Reissue RFQ →</button>
              <button className="btn btn-dark btn-sm">Mark accepted</button>
            </div>
          </div>
        </div>
      </Card>

      {/* Projects roll-up */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Projects · 3 active
          </h2>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            $24M GDV · 25 UNITS
          </span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Project</th>
              <th>Units</th>
              <th>GDV</th>
              <th>Stage</th>
              <th>Progress</th>
              <th>State</th>
              <th>IRR</th>
            </tr>
          </thead>
          <tbody>
            {PROJECTS.map((p) => (
              <tr key={p.code}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      className="mono"
                      style={{
                        padding: "2px 6px",
                        border: "1px solid var(--line-2)",
                        borderRadius: 6,
                        background: "var(--bg-2)",
                        fontSize: 10,
                      }}
                    >
                      {p.code}
                    </span>
                    <span className="display" style={{ fontSize: 14, fontWeight: 500 }}>
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className="num">{p.units}</td>
                <td className="num">${p.gdvM}M</td>
                <td><Badge>{p.stage}</Badge></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "var(--bg-2)",
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${p.prog}%`,
                          background: p.ontrack ? "var(--amber)" : "var(--warn)",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", width: 32 }}>
                      {p.prog}%
                    </span>
                  </div>
                </td>
                <td>
                  {p.ontrack ? <Badge tone="ok">On track</Badge> : <Badge tone="warn">Watch</Badge>}
                </td>
                <td className="num" style={{ color: "var(--amber)", fontWeight: 500 }}>
                  {p.irr}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Risk radar + Site activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Risk radar
          </h3>
          <ul className="clean" style={{ marginTop: 14 }}>
            {RISK_RADAR.map((r) => (
              <li key={r.label}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color }} />
                <span style={{ flex: 1, fontSize: 13 }}>{r.label}</span>
                <Badge tone={r.tone}>{r.badge}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Site activity · today
          </h3>
          <ul className="clean" style={{ marginTop: 14, fontSize: 13 }}>
            {SITE_ACTIVITY.map((a) => (
              <li key={a.at}>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 48 }}
                >
                  {a.at}
                </span>
                <span style={{ flex: 1 }}>{a.text}</span>
                {a.tone ? <Badge tone={a.tone}>{a.badge}</Badge> : <Badge>{a.badge}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Team grid */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Team · 8 cabinets
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, padding: 20 }}>
          {STAFF.map((p) => (
            <div
              key={p.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid var(--line)",
                borderRadius: 12,
                background: "var(--bg-3)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: "var(--amber)",
                  color: "var(--carbon)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-space), sans-serif",
                }}
              >
                {p.init}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                  {p.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
