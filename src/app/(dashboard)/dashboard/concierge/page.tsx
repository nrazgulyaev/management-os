import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
  Pulse,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 6 (visual port) — Mgmt OS Concierge cabinet.
 *
 * 1:1 visual port of `_handoff/management/concierge.html` (app.js
 * block). Live transcript wiring (`getActiveSession()` from
 * `src/features/guest-ai/services`) is deferred to TASK-6-DATA per
 * docs/audits/task-6-data-wiring-todo.md — SESSIONS / HANDOFFS /
 * TRANSCRIPT / SAFETY mocks below are preserved verbatim from the
 * prototype.
 *
 * Section order: SectionHeading → 5-up KPIs → 2-up (Sessions list +
 * active Transcript chat panel) → Handoffs queue table → 2-up
 * (Security events + AI Memory editor).
 */

export const metadata = { title: "Concierge AI" };
export const dynamic = "force-dynamic";

// TODO(task-6-data): wire to features/guest-ai/services.listActiveSessions().
const SESSIONS = [
  { id: "sess-a14", guest: "Mr. Tanaka", villa: "ES-S1", lang: "JA", started: "23:18", msgs: 8, status: "active" as const, last: "Pool heater set 28°C from 05:30 ✓" },
  { id: "sess-a13", guest: "S. Dubois", villa: "AH-02", lang: "FR", started: "08:14", msgs: 3, status: "active" as const, last: "Late checkout 12:00 confirmed" },
  { id: "sess-a12", guest: "Family Nielsen", villa: "ES-S2", lang: "DA", started: "07:42", msgs: 6, status: "handoff" as const, last: "AC not cool → ESCALATED to Budi" },
  { id: "sess-a11", guest: "L. Okonkwo", villa: "AH-01", lang: "EN", started: "yesterday", msgs: 11, status: "resolved" as const, last: "Dinner at Locavore booked · 19:30" },
  { id: "sess-a10", guest: "H. Williams", villa: "EV-07", lang: "EN", started: "yesterday", msgs: 5, status: "resolved" as const, last: "Airport pickup confirmed · 14:00" },
  { id: "sess-a09", guest: "K. Park", villa: "ES-S1", lang: "KO", started: "yesterday", msgs: 14, status: "resolved" as const, last: "Restaurant in Ubud booked" },
];

// TODO(task-6-data): wire to features/guest-ai/services.listHandoffs().
const HANDOFFS = [
  { id: "hand-1", from: "sess-a12", villa: "ES-S2", who: "Family Nielsen", text: "AC unit not cooling below 26°C. Family asking when fix expected — they have a 2 yr old child.", priority: "urgent" as const, assigned: "Budi W.", elapsed: "6m" },
  { id: "hand-2", from: "sess-z08", villa: "ES-S6", who: "Anya P.", text: "Pool not opening tomorrow morning — known issue. Guest requests alternative.", priority: "warn" as const, assigned: "Made S.", elapsed: "22m" },
];

// TODO(task-6-data): wire to features/guest-ai/services.getActiveSession(id) for the right pane.
const TRANSCRIPT: { from: "guest" | "ai"; t: string; at: string }[] = [
  { from: "guest", t: "Hi! Pool heater for tomorrow 6am pls? We'd like to swim before checkout 🙏", at: "23:18" },
  { from: "ai", t: "Of course, Mr. Tanaka. Pool heated to 28°C from 05:30 to 09:00. I've also moved your checkout to 12:00 — no charge. Anything else for the morning?", at: "23:18" },
  { from: "guest", t: "Wow thanks. Could we maybe get breakfast at 7? Two croissants and fruit", at: "23:19" },
  { from: "ai", t: "Done. Chef Ari is making a fruit bowl with mangosteen + hot croissants for 07:00 on the deck. ☕ I've added IDR 420K to your stay.", at: "23:19" },
  { from: "guest", t: "Perfect. Sleep well 🙏", at: "23:20" },
  { from: "ai", t: "Oyasumi nasai, Tanaka-san. The smart-lock code remains valid until checkout. Pool fence stays locked until 05:30.", at: "23:20" },
];

// TODO(task-6-data): wire to features/security/services.listGuestSafetyEvents() — last 24h.
const SAFETY = [
  { id: "sec-1", evt: "Repeated lock attempts", villa: "ES-S6", time: "14:22", risk: "low", note: "Anya P. — likely typo, 3 attempts" },
  { id: "sec-2", evt: "WiFi credential reveal", villa: "AH-01", time: "11:08", risk: "info", note: "L. Okonkwo · normal viewer pattern" },
  { id: "sec-3", evt: "Token URL reused", villa: "EV-07", time: "09:14", risk: "info", note: "H. Williams · second device" },
];

function initials(name: string): string {
  return name
    .split(" ")
    .filter((p) => p && /[A-Za-z]/.test(p[0]))
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ConciergePage() {
  return (
    <>
      <SectionHeading
        eyebrow="Concierge AI · 7 active villas · 4 languages"
        title={
          <>
            Eighteen quiet decisions{" "}
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>your guests</em> never had to ask twice for.
          </>
        }
        subtitle="Multilingual replies on WhatsApp, in-stay portal and email. Escalates only what truly needs you. Audit log per reply."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Templates</button>
            <button className="btn btn-secondary btn-sm">Memory</button>
            <button className="btn btn-primary btn-sm">Review handoffs · 2</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Active sessions" value="3" sub="2 last hour · 1 since yesterday" tone="success" />
        <Kpi label="Messages · today" value="142" sub="6.2 avg per session" />
        <Kpi label="Auto-resolved" value="94%" sub="vs 88% Mar" tone="gold" />
        <Kpi label="Handoffs queued" value="2" sub="1 urgent · 1 warn" tone="accent" />
        <Kpi label="CSAT · 30d" value="4.86" sub="↑ 0.08 vs last 30d" />
      </div>

      {/* 2-up: sessions list + active transcript */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--line-soft)" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
              Sessions
            </h3>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              6 · ALL CHANNELS
            </span>
          </div>
          <ul className="clean" style={{ padding: 0 }}>
            {SESSIONS.map((s, i) => (
              <li
                key={s.id}
                style={{
                  padding: "12px 18px",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 6,
                  borderLeft: i === 0 ? "3px solid var(--terra)" : "3px solid transparent",
                  background: i === 0 ? "var(--cream-warm)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 28, height: 28, borderRadius: 999,
                      background: "var(--cream-deep)", border: "1px solid var(--line)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                    }}
                  >
                    {initials(s.guest)}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 13.5 }}>{s.guest}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
                    {s.villa} · {s.lang}
                  </span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-4)" }}>
                    {s.started}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", paddingLeft: 36, lineHeight: 1.4 }}>{s.last}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 36 }}>
                  {s.status === "active" && (
                    <Badge tone="ok">
                      <Pulse /> Live
                    </Badge>
                  )}
                  {s.status === "handoff" && <Badge tone="warn">Handoff</Badge>}
                  {s.status === "resolved" && <Badge>Resolved</Badge>}
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>{s.msgs} msgs</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 36, height: 36, borderRadius: 999,
                background: "linear-gradient(135deg, var(--gold), var(--terra))",
                color: "var(--cream-warm)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 500,
              }}
            >
              TA
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Mr. Tanaka · Enso S1 · 6 nights stay</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                WhatsApp · sess-a14 · JA → translated EN
              </div>
            </div>
            <span style={{ marginLeft: "auto" }}>
              <Badge tone="ok"><Pulse /> Live</Badge>
            </span>
          </div>
          <div
            style={{
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              background: "var(--cream-warm)",
              overflow: "auto",
              maxHeight: 380,
            }}
          >
            {TRANSCRIPT.map((m, i) => (
              <div key={i} style={{ alignSelf: m.from === "guest" ? "flex-start" : "flex-end", maxWidth: "80%" }}>
                <div
                  style={{
                    padding: "9px 13px",
                    borderRadius: 14,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    background: m.from === "guest" ? "var(--paper)" : "var(--forest)",
                    color: m.from === "guest" ? "var(--ink)" : "var(--cream-warm)",
                    border: m.from === "guest" ? "1px solid var(--line-soft)" : "0",
                  }}
                >
                  {m.t}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: "var(--ink-4)",
                    marginTop: 3,
                    textAlign: m.from === "guest" ? "left" : "right",
                  }}
                >
                  {m.from === "ai" ? "Concierge AI" : "Mr. Tanaka"} · {m.at}
                </div>
              </div>
            ))}
            <div
              className="mono"
              style={{
                alignSelf: "flex-end",
                fontSize: 11,
                color: "var(--ink-3)",
                display: "flex",
                gap: 6,
                padding: "4px 6px",
                alignItems: "center",
              }}
            >
              <span className="pulse-dot" style={{ background: "var(--gold)" }} />
              <span>AI typing...</span>
            </div>
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--line-soft)", display: "flex", gap: 8 }}>
            <input
              placeholder="Step in as human concierge…"
              style={{
                flex: 1,
                padding: "9px 12px",
                border: "1px solid var(--line)",
                borderRadius: 999,
                background: "var(--paper)",
                fontSize: 13,
                fontFamily: "inherit",
                color: "var(--ink)",
              }}
            />
            <button className="btn btn-ghost btn-sm">Suggest</button>
            <button className="btn btn-primary btn-sm">Send</button>
          </div>
        </Card>
      </div>

      <h2
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Handoffs needing{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>your eyes</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Session</th>
              <th>Villa</th>
              <th>Guest</th>
              <th>What</th>
              <th>Priority</th>
              <th>Assigned</th>
              <th>Elapsed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {HANDOFFS.map((h) => (
              <tr
                key={h.id}
                style={{
                  background: h.priority === "urgent" ? "rgba(196,88,60,0.04)" : "transparent",
                }}
              >
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{h.from}</td>
                <td className="mono">{h.villa}</td>
                <td>{h.who}</td>
                <td style={{ maxWidth: 380, fontSize: 13 }}>{h.text}</td>
                <td>
                  {h.priority === "urgent"
                    ? <Badge tone="danger">Urgent</Badge>
                    : <Badge tone="warn">Warn</Badge>}
                </td>
                <td><Badge>{h.assigned}</Badge></td>
                <td className="mono">{h.elapsed}</td>
                <td>
                  <button className="btn btn-secondary btn-sm">Open →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
            Security events · last 24h
          </h3>
          <div className="label" style={{ marginTop: 4 }}>Token usage · WiFi reveal · lock attempts</div>
          <ul className="clean" style={{ marginTop: 14 }}>
            {SAFETY.map((s) => (
              <li key={s.id} style={{ padding: "10px 0" }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: s.risk === "low" ? "var(--warn)" : "var(--info)",
                  }}
                />
                <span style={{ fontSize: 13, flex: 1 }}>
                  <strong>{s.evt}</strong> ·{" "}
                  <span className="mono" style={{ color: "var(--ink-3)" }}>{s.villa}</span> ·{" "}
                  <span style={{ color: "var(--ink-3)" }}>{s.note}</span>
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{s.time}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card style={{ padding: 20, background: "var(--cream-warm)", border: "1px dashed var(--line)" }}>
          <div className="label">Memory · written by AI</div>
          <h3
            style={{
              margin: "6px 0 12px",
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            What the AI remembers across stays
          </h3>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 13,
              color: "var(--ink-2)",
            }}
          >
            <li>· Tanaka family prefer <strong>Japanese-style breakfast</strong> · ¥-pricing comfort</li>
            <li>· Nielsen kids (4, 6) — <strong>pool gates locked</strong> by default</li>
            <li>· Williams — <strong>peanut allergy</strong>, kitchen briefed at every arrival</li>
            <li>· Okonkwo — repeat visitor, <strong>complimentary spa hour</strong> approved</li>
          </ul>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
          >
            Open memory editor
          </button>
        </Card>
      </div>
    </>
  );
}
