import * as React from "react";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS Site Supervisor cabinet.
 *
 * 1:1 visual port of `_handoff/development/site-supervisor.html`
 * (app.js block). Mock data preserved verbatim — live wiring deferred
 * to TASK-7-DATA per docs/audits/task-6-7-data-wiring-todo.md.
 *
 * Sections: SectionHeading → 5-up KPIs → Daily report timeline (5
 * rows w/ time + status badge) → Photo evidence grid (10 thumbs,
 * geo-tagged) → transcribed voice-note panel.
 */

export const metadata = { title: "Site Supervisor · Daily report" };
export const dynamic = "force-dynamic";

// TODO(task-7-data): wire to features/development/services.getDailyReportSchedule(projectId, date).
const DIARY: { t: string; a: string; q: string; who: string; st: "in_progress" | "queued" | "done" }[] = [
  { t: "04:30 → 09:00", a: "Block B / Level 2 concrete pour · C25/30", q: "1,420 m³ delivered", who: "Beton Nusantara · 14 trucks · 3 pumps", st: "in_progress" },
  { t: "08:00 → 12:00", a: "MEP rough-in · Block A · Level 1 reinforcing tie", q: "180 m run completed", who: "Elek Bali · 6 crew", st: "in_progress" },
  { t: "10:30 → 11:30", a: "QS inspection — Wayan T.", q: "Sign-off on column reinforcement", who: "Internal", st: "queued" },
  { t: "13:00 → 17:00", a: "Marble vendor visit · BatuJaya samples", q: "3 samples requested", who: "Wayan T. + Ari P.", st: "queued" },
  { t: "15:00 → 16:30", a: "Toolbox talk · weather + scaffold", q: "42 crew", who: "Komang Y.", st: "queued" },
];

// TODO(task-7-data): wire to features/development/services.listSitePhotosForDate(projectId, date).
const PHOTOS: { t: string; c: string; g: string }[] = [
  { t: "05:14", c: "Concrete pour start", g: "linear-gradient(135deg, #3a4250 0%, #1a1d22 100%)" },
  { t: "06:48", c: "Pump #2 alignment", g: "linear-gradient(135deg, #463826 0%, #1c1812 100%)" },
  { t: "07:12", c: "L2 slab progress", g: "linear-gradient(135deg, #5a6e7a 0%, #1c1812 100%)" },
  { t: "07:58", c: "Block A · MEP cabling", g: "linear-gradient(135deg, #2c3848 0%, #15191e 100%)" },
  { t: "08:30", c: "Marble samples laid out", g: "linear-gradient(135deg, #ddc4ab 0%, #806244 100%)" },
  { t: "09:02", c: "Slab vibration check", g: "linear-gradient(135deg, #3a4250 0%, #1a1d22 100%)" },
  { t: "09:30", c: "Site cleanup · Block B", g: "linear-gradient(135deg, #463826 0%, #1c1812 100%)" },
  { t: "10:14", c: "Toolbox briefing", g: "linear-gradient(135deg, #2c3848 0%, #15191e 100%)" },
  { t: "10:48", c: "Reinforcement detail", g: "linear-gradient(135deg, #5a6e7a 0%, #1c1812 100%)" },
  { t: "11:02", c: "Drain rough-in", g: "linear-gradient(135deg, #3a4250 0%, #1a1d22 100%)" },
];

export default function SiteSupervisorPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Site supervisor · Komang Y. · EP02"
        title={
          <>
            Today's{" "}
            <span style={{ color: "var(--amber)" }}>jobsite log.</span>
          </>
        }
        subtitle="Daily report drafted at 06:00, photo-evidence trail, voice notes auto-transcribed, geo-tagged completion stamps. Offline-first PWA."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Submit for sign-off</button>
            <button className="btn btn-amber btn-sm">+ Photo</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Crew on site" value="42" sub="6 trades · 4 sub-contractors" />
        <Kpi label="Activities today" value="8" sub="3 critical path" />
        <Kpi label="Photos · today" value="38" sub="all geo-tagged" tone="success" />
        <Kpi label="QA checks done" value="14 / 16" sub="2 awaiting" />
        <Kpi label="Safety incidents" value="0" sub="14 days streak" tone="success" />
      </div>

      {/* Daily report timeline */}
      <Card style={{ padding: 24, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>
            Daily report · 21 April 2026
          </h2>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            EP02 · WK36 · DAY 3
          </span>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "160px 1fr", gap: 14 }}>
          {DIARY.map((r) => (
            <React.Fragment key={r.t + r.a}>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", paddingTop: 4 }}>
                {r.t}
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  background: "var(--bg-3)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.a}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                  {r.q} · <span className="mono">{r.who}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  {r.st === "in_progress" && <Badge tone="warn">In progress</Badge>}
                  {r.st === "queued" && <Badge>Queued</Badge>}
                  {r.st === "done" && <Badge tone="ok">Done</Badge>}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Photo evidence */}
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
          Photo evidence · today
        </h3>
        <div className="label" style={{ marginTop: 4 }}>
          Auto-uploaded · geo-tagged · linked to checklist items
        </div>
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
          }}
        >
          {PHOTOS.map((p) => (
            <div
              key={p.t + p.c}
              style={{
                aspectRatio: "4 / 3",
                background: p.g,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                border: "1px solid var(--line)",
                borderRadius: 10,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: "0.08em",
                }}
              >
                {p.t}
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>{p.c}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Voice note */}
      <Card style={{ padding: 18, border: "1px dashed var(--line-2)" }}>
        <div className="label label-amber">VOICE NOTE · transcribed · 11:42</div>
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-space), sans-serif",
            fontStyle: "italic",
            fontSize: 15,
            color: "var(--ink)",
          }}
        >
          &quot;Slump test on truck 8 came out at 14cm, that&apos;s higher than spec —
          flagged with batch and sent driver back for adjustment. Lab sample sent. Pour
          resumed 11:48.&quot;
        </p>
      </Card>
    </>
  );
}
