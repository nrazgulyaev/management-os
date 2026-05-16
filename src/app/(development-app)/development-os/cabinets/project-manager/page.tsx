import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS Project Manager cabinet.
 *
 * 1:1 visual port of `_handoff/development/project-manager.html`
 * (app.js block). Mock data preserved verbatim — live wiring deferred
 * to TASK-7-DATA per docs/audits/task-6-7-data-wiring-todo.md.
 *
 * Section order: SectionHeading → 5-up KPIs → 4-column WP kanban board
 * → 2-up (Portfolio at-risk + Today's daily digest) → Construction
 * schedule timeline (weekly gantt strip).
 */

export const metadata = { title: "Project Manager · Cabinet" };
export const dynamic = "force-dynamic";

type Pri = "P1" | "P2" | "P3";
interface KanbanCard {
  id: string;
  t: string;
  who: string;
  pri: Pri;
}

// TODO(task-7-data): wire to features/development/services.listWorkPackagesByStatus(projectId).
const KANBAN: Record<string, KanbanCard[]> = {
  Backlog: [
    { id: "WP-051", t: "Pool tile selection · ES10", who: "WT", pri: "P3" },
    { id: "WP-049", t: "Smart-lock specification", who: "MS", pri: "P3" },
  ],
  "This week": [
    { id: "WP-046", t: "Block B / column pour", who: "KY", pri: "P1" },
    { id: "WP-047", t: "MEP rough-in inspection", who: "KY", pri: "P2" },
    { id: "WP-048", t: "Vendor reselection · marble", who: "AP", pri: "P2" },
  ],
  "In progress": [
    { id: "WP-042", t: "Foundations · Block A", who: "KY", pri: "P1" },
    { id: "WP-043", t: "Roofing · Block A", who: "KY", pri: "P2" },
  ],
  "Done · this week": [
    { id: "WP-038", t: "Substructure Block B", who: "KY", pri: "P1" },
    { id: "WP-039", t: "Drawings rev 14 issue", who: "MS", pri: "P2" },
    { id: "WP-040", t: "BoQ rebaseline", who: "WT", pri: "P2" },
  ],
};

const PRI_COLOR: Record<Pri, string> = {
  P1: "var(--danger)",
  P2: "var(--warn)",
  P3: "var(--ink-4)",
};

// TODO(task-7-data): wire to features/development/services.listPortfolioAtRisk().
const AT_RISK: { color: string; tone: "danger" | "warn"; badge: string; title: string; note: string }[] = [
  { color: "var(--danger)", tone: "danger", badge: "Critical", title: "AHP3 · permit hold · 12 days", note: "Building permit revision required · cost: $24K opportunity" },
  { color: "var(--amber)", tone: "warn", badge: "High", title: "EP02 · marble PO over baseline", note: "+$3,744 vs reference · re-RFQ flagged by qs-cost" },
  { color: "var(--warn)", tone: "warn", badge: "Medium", title: "ES10 · rebar lead-time +4 days", note: "Critical path delay risk · backup supplier qualified" },
];

// TODO(task-7-data): wire to features/development/services.getConstructionScheduleStrip(projectId, weekIso).
const SCHEDULE_BARS = [
  { l: "Foundations · Block B", w: 90, left: 0, c: "var(--ok)" },
  { l: "Concrete · Block B/L2", w: 55, left: 25, c: "var(--amber)" },
  { l: "MEP rough-in · Block A", w: 45, left: 10, c: "var(--steel)" },
  { l: "Roofing · Block A", w: 30, left: 55, c: "var(--ink-3)" },
  { l: "Finishes · Phase 1", w: 20, left: 75, c: "var(--ink-3)" },
  { l: "Pool deck · Block B", w: 18, left: 62, c: "var(--ink-3)" },
];

export default function ProjectManagerPage() {
  return (
    <>
      <SectionHeading
        eyebrow="My cabinet · Made S. · Project manager"
        title={
          <>
            Three projects.{" "}
            <span style={{ color: "var(--amber)" }}>Twelve WPs in flight.</span>
          </>
        }
        subtitle="Portfolio at-risk view, kanban-style WP board, integrated daily digest + weekly plan from AI. One screen the PM lives in."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Weekly plan PDF ↓</button>
            <button className="btn btn-amber btn-sm">+ Work package</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="WPs · in progress" value="12" sub="across 3 projects" />
        <Kpi label="Schedule variance" value="−0.4d" sub="vs critical path" tone="success" />
        <Kpi label="Open tickets" value="14" sub="3 P1 · 7 P2 · 4 P3" />
        <Kpi label="Decisions awaiting me" value="4" sub="vendor · spec · variance" tone="accent" />
        <Kpi label="Crew on site · today" value="42" sub="across 3 projects" />
      </div>

      {/* Kanban */}
      <Card style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Work package board · EP02
          </h2>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            WK 36 · 12 OPEN
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {Object.entries(KANBAN).map(([col, items]) => (
            <div
              key={col}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 14,
                background: "var(--bg-3)",
                borderRadius: 14,
                minHeight: 280,
                border: "1px solid var(--line)",
              }}
            >
              <div className="label">
                {col} · {items.length}
              </div>
              {items.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 12px",
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                      {c.id}
                    </span>
                    <span
                      className="mono"
                      style={{
                        marginLeft: "auto",
                        fontSize: 9,
                        color: PRI_COLOR[c.pri],
                      }}
                    >
                      {c.pri}
                    </span>
                  </div>
                  <div style={{ fontSize: 13 }}>{c.t}</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: "var(--amber)",
                        color: "var(--carbon)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 600,
                        fontFamily: "var(--font-space), sans-serif",
                      }}
                    >
                      {c.who}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      {/* Portfolio at-risk + daily digest */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Portfolio at-risk · this week
          </h3>
          <ul className="clean" style={{ marginTop: 14 }}>
            {AT_RISK.map((r) => (
              <li key={r.title}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {r.note}
                  </div>
                </div>
                <Badge tone={r.tone}>{r.badge}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Today · daily digest
          </h3>
          <div className="label label-amber" style={{ marginTop: 4 }}>
            FILED 06:00 BY AI
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--ink-2)",
            }}
          >
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "var(--ink)" }}>EP02</strong> · Block B pour starts
              04:30 — 14 vehicles, 3 pumps. Method statement signed by KY at 22:14
              yesterday.
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "var(--ink)" }}>ES10</strong> · MEP rough-in
              inspection 08:00. Sub-trade arrives 07:30.
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "var(--amber)" }}>AHP3</strong> · Permit office
              meeting 10:00 — required documents listed in attached folder.
            </p>
            <p
              style={{
                margin: 0,
                paddingTop: 8,
                borderTop: "1px dashed var(--line-2)",
                fontSize: 12,
                color: "var(--ink-3)",
              }}
            >
              3 anomalies caught overnight · 1 critical · 2 medium. All addressed in this
              digest.
            </p>
          </div>
        </Card>
      </div>

      {/* Construction schedule */}
      <Card style={{ padding: 20 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
          Construction schedule · this week
        </h2>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {SCHEDULE_BARS.map((b) => (
            <div
              key={b.l}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span style={{ fontSize: 13 }}>{b.l}</span>
              <div
                style={{
                  position: "relative",
                  height: 18,
                  background: "var(--bg-3)",
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                  }}
                >
                  {Array.from({ length: 6 }).map((_, k) => (
                    <div key={k} style={{ borderRight: "1px dashed var(--line)" }} />
                  ))}
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    bottom: 2,
                    left: `${b.left}%`,
                    width: `${b.w}%`,
                    background: b.c,
                    borderRadius: 4,
                    opacity: b.c === "var(--ink-3)" ? 0.4 : 1,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--ink-3)",
          }}
        >
          <span>MON 21</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span>SAT</span>
          <span>SUN 27</span>
        </div>
      </Card>
    </>
  );
}
