import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 6 (visual port) — Mgmt OS Operations cabinet.
 *
 * 1:1 visual port of `_handoff/management/operations.html` (app.js
 * block). Mock data preserved verbatim — live wiring deferred to
 * TASK-6-DATA per docs/audits/task-6-data-wiring-todo.md. The HOUSEKEEPING /
 * MAINTENANCE / PREVENTIVE arrays below are inlined from the prototype's
 * shell `data.js` block since `MgmtData` doesn't exist in production.
 *
 * Section order: SectionHeading → 6-up KPIs → Operations Copilot AI band
 * → 2-up (Housekeeping table + 19-villa status board) → 2-up
 * (Maintenance tickets table + Preventive upcoming list) → Service
 * requests table.
 */

export const metadata = { title: "Operations · Command center" };
export const dynamic = "force-dynamic";

// TODO(task-6-data): wire to features/operations/services.listHousekeepingForToday().
const HOUSEKEEPING = [
  { id: "hk-1", villa: "Enso S2", code: "ES-S2", at: "11:00", who: "Sari W.", prog: 62, status: "in_progress" as const, pri: "P2", checks: "11/18" },
  { id: "hk-2", villa: "Eternal 07", code: "EV-07", at: "13:00", who: "Ketut A.", prog: 100, status: "awaiting_approval" as const, pri: "P3", checks: "22/22" },
  { id: "hk-3", villa: "Ahau 02", code: "AH-02", at: "14:30", who: "Made T.", prog: 0, status: "queued" as const, pri: "P3", checks: "0/24" },
];

// TODO(task-6-data): wire to features/operations/services.listOpenMaintenance().
const MAINTENANCE = [
  { id: "mt-1", villa: "Enso S6", code: "ES-S6", title: "Master bedroom AC not cooling below 26°C", cat: "AC", pri: "P2", status: "in_progress" as const, ago: "6h", who: "Budi W.", sla: "ok" as const },
  { id: "mt-2", villa: "Enso S6", code: "ES-S6", title: "Pool filter pressure alarm", cat: "Pool", pri: "P2", status: "waiting_parts" as const, ago: "1d", who: "Budi W.", sla: "warn" as const },
  { id: "mt-3", villa: "Enso S2", code: "ES-S2", title: "Living room ceiling fan wobble", cat: "Electrical", pri: "P3", status: "triaged" as const, ago: "2h", who: "—", sla: "ok" as const },
  { id: "mt-4", villa: "Ahau 01", code: "AH-01", title: "Garden irrigation leak near entrance", cat: "Landscaping", pri: "P3", status: "open" as const, ago: "30m", who: "—", sla: "ok" as const },
];

// TODO(task-6-data): wire to features/operations/services.listPreventiveUpcoming().
const PREVENTIVE = [
  { id: "pv-1", scope: "Eternal Villas · all", task: "Quarterly AC deep clean", in: "4 days", cad: "Every 90 days", who: "External · CoolAir" },
  { id: "pv-2", scope: "Enso Villas · S1–S8", task: "Monthly pest management", in: "2 days", cad: "Every 30 days", who: "External · BaliPest" },
  { id: "pv-3", scope: "Ahau Gardens · common", task: "Fire extinguisher inspection", in: "18 days", cad: "Every 180 days", who: "Internal · Security" },
];

// TODO(task-6-data): wire to features/operations/services.listServiceRequests().
const SERVICE_REQUESTS: [string, string, string, string, string, string, ServiceState][] = [
  ["SR-2421", "ES-S1", "Mr. Tanaka", "Breakfast for 2 · tomorrow 07:00", "Chef Ari · in-villa", "Internal", "fulfilled"],
  ["SR-2419", "AH-01", "L. Okonkwo", "Spa massage · two persons · couples", "Bali Body", "external", "scheduled"],
  ["SR-2418", "EV-07", "H. Williams", "Airport pickup · Sat 14:00", "Bluebird premium", "external", "confirmed"],
  ["SR-2417", "ES-S2", "Family Nielsen", "Babysitter Fri evening", "Local sitter network", "external", "pending"],
  ["SR-2416", "ES-S5", "A. Martin", "Welcome flower bouquet", "Internal", "Internal", "fulfilled"],
  ["SR-2414", "AH-02", "S. Dubois", "Private dinner · 6 people · Sat", "Chef Wayan", "external", "quote_required"],
];

type ServiceState = "fulfilled" | "scheduled" | "confirmed" | "pending" | "quote_required";

const STATUS_TILES: { s: string; c: number; col: string }[] = [
  { s: "Ready", c: 2, col: "var(--ok)" },
  { s: "Occupied", c: 3, col: "var(--forest)" },
  { s: "Cleaning", c: 1, col: "var(--terra)" },
  { s: "Inspection", c: 1, col: "var(--info)" },
  { s: "Checkout", c: 1, col: "var(--warn)" },
  { s: "Maintenance", c: 1, col: "var(--danger)" },
  { s: "Owner stay", c: 1, col: "var(--gold)" },
  { s: "OOO", c: 0, col: "var(--line-strong)" },
];

export default function OperationsPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Today · live command center"
        title={
          <>
            Six arrivals before sunset,{" "}
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>four open tickets</em>, three turnovers in motion.
          </>
        }
        subtitle="Housekeeping, maintenance, preventive tasks and service requests in one inbox. Geo-tagged photos, voice notes auto-transcribed."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Morning brief PDF ↓</button>
            <button className="btn btn-secondary btn-sm">Assignments</button>
            <button className="btn btn-primary btn-sm">New task +</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Turnovers · today" value="6" sub="3 in progress · 3 queued" />
        <Kpi label="Arrivals · today" value="6" sub="1 VIP · 100% ready" />
        <Kpi label="Tickets open" value="4" sub="1 P2 awaiting parts" tone="accent" />
        <Kpi label="Preventive due" value="3" sub="2 within 4 days" tone="gold" />
        <Kpi label="Service requests" value="9" sub="6 pending guest reply" />
        <Kpi label="Photo evidence" value="184" sub="last 24h · all geo-tagged" tone="success" />
      </div>

      {/* AI Operations Copilot band */}
      <Card
        style={{
          padding: 20,
          marginBottom: 18,
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
            background: "radial-gradient(60% 60% at 100% 0%, var(--gold) 0%, transparent 60%)",
          }}
        />
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", position: "relative" }}>
          <span
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gold-soft)",
            }}
          >
            ✦
          </span>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ color: "rgba(244,239,230,0.65)" }}>
              Operations Copilot · 06:18 · run 4a2f8e
            </div>
            <p
              style={{
                margin: "6px 0 14px",
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 22,
                lineHeight: 1.3,
                fontWeight: 300,
              }}
            >
              Today is calm on paper but{" "}
              <em style={{ color: "var(--gold-soft)", fontStyle: "italic" }}>
                ES-S5 has a 3-hour gap
              </em>{" "}
              between Tanaka's checkout and Martin's arrival. Suggest moving Ketut A.'s
              inspection to 12:00 — Sari is already on premises after the S2 turnover.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                style={{
                  background: "var(--cream-warm)",
                  color: "var(--ink)",
                  fontSize: 13,
                  padding: "7px 14px",
                }}
              >
                Apply · move inspection ✓
              </button>
              <button
                className="btn"
                style={{
                  background: "transparent",
                  color: "var(--cream-warm)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: 13,
                  padding: "7px 14px",
                }}
              >
                Show reasoning
              </button>
            </div>
          </div>
          <div
            className="mono"
            style={{
              flexShrink: 0,
              fontSize: 10,
              color: "rgba(244,239,230,0.5)",
              textAlign: "right",
            }}
          >
            92 tok · 1.4s
            <br />
            Read-only
          </div>
        </div>
      </Card>

      {/* Housekeeping + status board */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card id="housekeeping" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 22, fontWeight: 400 }}>
              Housekeeping · today
            </h2>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              3 ACTIVE · 8 ASSIGNED
            </span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Villa</th>
                <th>Time</th>
                <th>Assignee</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {HOUSEKEEPING.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="mono" style={{ fontSize: 12 }}>{t.code}</span>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-newsreader), serif" }}>
                      {t.villa}
                    </div>
                  </td>
                  <td className="mono">{t.at}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          background: "var(--cream-deep)",
                          border: "1px solid var(--line)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                        }}
                      >
                        {t.who.split(" ")[0][0]}
                      </span>
                      <span>{t.who}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: "var(--cream-deep)",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${t.prog}%`,
                            background: t.prog === 100 ? "var(--ok)" : "var(--terra)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", width: 46 }}>
                        {t.checks}
                      </span>
                    </div>
                  </td>
                  <td>
                    {t.status === "in_progress" && <Badge tone="info">In progress</Badge>}
                    {t.status === "awaiting_approval" && <Badge tone="gold">Approval</Badge>}
                    {t.status === "queued" && <Badge>Queued</Badge>}
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{t.pri}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
            Status board · 19 villas
          </h3>
          <div className="label" style={{ marginTop: 4 }}>Live readiness</div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {STATUS_TILES.map((s) => (
              <div
                key={s.s}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  background: "var(--cream-warm)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: s.col }} />
                <span style={{ fontSize: 13, flex: 1 }}>{s.s}</span>
                <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{s.c}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Maintenance + preventive */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card id="maintenance" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 22, fontWeight: 400 }}>
              Maintenance tickets
            </h2>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              4 OPEN · 1 WAITING PARTS
            </span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Villa</th>
                <th>Issue</th>
                <th>Cat.</th>
                <th>Pri.</th>
                <th>Status</th>
                <th>Age</th>
                <th>Assignee</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {MAINTENANCE.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.code}</td>
                  <td style={{ maxWidth: 280, fontSize: 13 }}>{t.title}</td>
                  <td><Badge>{t.cat}</Badge></td>
                  <td className="mono">{t.pri}</td>
                  <td>
                    {t.status === "open" && <Badge>Open</Badge>}
                    {t.status === "triaged" && <Badge tone="info">Triaged</Badge>}
                    {t.status === "in_progress" && <Badge tone="gold">In progress</Badge>}
                    {t.status === "waiting_parts" && <Badge tone="warn">Waiting parts</Badge>}
                  </td>
                  <td className="mono">{t.ago}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{t.who}</td>
                  <td>
                    {t.sla === "ok" ? (
                      <span style={{ color: "var(--ok)" }}>●</span>
                    ) : (
                      <span style={{ color: "var(--warn)" }}>●</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 22, fontWeight: 400 }}>
              Preventive · upcoming
            </h2>
            <div className="label" style={{ marginTop: 4 }}>Scheduled around guest stays</div>
          </div>
          <ul className="clean" style={{ padding: "4px 0" }}>
            {PREVENTIVE.map((p) => (
              <li
                key={p.id}
                style={{
                  padding: "12px 18px",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  display: "flex",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                  <span style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 15, flex: 1 }}>
                    {p.task}
                  </span>
                  <Badge tone="gold">{p.in}</Badge>
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{p.scope}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                  {p.cad} · {p.who}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Service requests */}
      <h2
        id="service-requests"
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Service requests ·{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>guest-side</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Villa</th>
              <th>Guest</th>
              <th>Request</th>
              <th>Service</th>
              <th>Vendor</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {SERVICE_REQUESTS.map((r) => (
              <tr key={r[0]}>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r[0]}</td>
                <td className="mono">{r[1]}</td>
                <td>{r[2]}</td>
                <td style={{ fontSize: 13, maxWidth: 240 }}>{r[3]}</td>
                <td style={{ color: "var(--ink-3)" }}>{r[4]}</td>
                <td><Badge>{r[5]}</Badge></td>
                <td>
                  {r[6] === "fulfilled" && <Badge tone="ok">Fulfilled</Badge>}
                  {r[6] === "scheduled" && <Badge tone="info">Scheduled</Badge>}
                  {r[6] === "confirmed" && <Badge tone="info">Confirmed</Badge>}
                  {r[6] === "pending" && <Badge tone="warn">Pending</Badge>}
                  {r[6] === "quote_required" && <Badge tone="gold">Quote</Badge>}
                </td>
                <td><button className="btn btn-ghost btn-sm">Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
