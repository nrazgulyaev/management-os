import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  getOperationsKpis,
  getVillaStatusBoard,
  getMaintenanceTickets,
  getPreventiveUpcoming,
  getHousekeepingProgress,
  getServiceRequestsForCabinet,
  type VillaState,
} from "@/features/operations/operations-cabinet-queries";

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Operations cabinet live wiring.
 *
 * Visual port from `_handoff/management/operations.html`. This commit
 * replaces five mock arrays with live reads in
 * `src/features/operations/operations-cabinet-queries.ts`:
 *
 *   - HOUSEKEEPING     → getHousekeepingProgress() (empty until tasks seeded)
 *   - MAINTENANCE      → getMaintenanceTickets()   (live · 8 seeded tickets)
 *   - PREVENTIVE       → getPreventiveUpcoming()   (templates only — no schedule)
 *   - SERVICE_REQUESTS → getServiceRequestsForCabinet() (empty until seeded)
 *   - STATUS_TILES     → derived from getVillaStatusBoard()
 *
 * Operations Copilot AI band stays as a static empty-state copy until
 * the daily-digest agent files a run.
 */

export const metadata = { title: "Operations · Command center" };
export const dynamic = "force-dynamic";

const STATE_TILES: Array<{ key: VillaState; label: string; color: string }> = [
  { key: "ready", label: "Ready", color: "var(--ok)" },
  { key: "occupied", label: "Occupied", color: "var(--forest)" },
  { key: "cleaning", label: "Cleaning", color: "var(--terra)" },
  { key: "inspection", label: "Inspection", color: "var(--info)" },
  { key: "checkout_pending", label: "Checkout", color: "var(--warn)" },
  { key: "maintenance", label: "Maintenance", color: "var(--danger)" },
  { key: "owner_stay", label: "Owner stay", color: "var(--gold)" },
  { key: "ooo", label: "OOO", color: "var(--line-strong)" },
];

const SEVERITY_TONE: Record<string, "ok" | "info" | "gold" | "warn" | undefined> = {
  low: undefined,
  normal: "info",
  high: "warn",
  urgent: "warn",
};

const STATUS_LABEL: Record<string, { tone?: "ok" | "info" | "gold" | "warn"; text: string }> = {
  open: { text: "Open" },
  triaged: { tone: "info", text: "Triaged" },
  scheduled: { tone: "info", text: "Scheduled" },
  in_progress: { tone: "gold", text: "In progress" },
  waiting_parts: { tone: "warn", text: "Waiting parts" },
  resolved: { tone: "ok", text: "Resolved" },
};

export default async function OperationsPage() {
  const [kpis, board, tickets, preventive, housekeeping, serviceRequests] = await Promise.all([
    getOperationsKpis().catch(() => null),
    getVillaStatusBoard().catch(() => []),
    getMaintenanceTickets(12).catch(() => []),
    getPreventiveUpcoming(6).catch(() => []),
    getHousekeepingProgress().catch(() => []),
    getServiceRequestsForCabinet().catch(() => []),
  ]);

  // Tile counts from the live board.
  const tileCounts = new Map<VillaState, number>();
  for (const v of board) {
    tileCounts.set(v.state, (tileCounts.get(v.state) ?? 0) + 1);
  }
  const totalVillas = board.length;
  const ticketsOpen = kpis?.ticketsOpen ?? tickets.length;

  return (
    <>
      <SectionHeading
        eyebrow="Today · live command center"
        title={
          <>
            {kpis && kpis.arrivalsToday > 0
              ? `${kpis.arrivalsToday} arrivals today`
              : "No arrivals today"}
            {", "}
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>
              {ticketsOpen} open {ticketsOpen === 1 ? "ticket" : "tickets"}
            </em>
            {kpis && kpis.turnoversToday > 0 ? `, ${kpis.turnoversToday} turnovers in motion.` : "."}
          </>
        }
        subtitle="Housekeeping, maintenance, preventive tasks and service requests in one inbox. Photos and voice notes coming soon."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Morning brief PDF ↓</button>
            <button className="btn btn-secondary btn-sm">Assignments</button>
            <button className="btn btn-primary btn-sm">New task +</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Turnovers · today"
          value={kpis && kpis.turnoversToday > 0 ? String(kpis.turnoversToday) : "—"}
          sub="check-outs today"
        />
        <Kpi
          label="Arrivals · today"
          value={kpis && kpis.arrivalsToday > 0 ? String(kpis.arrivalsToday) : "—"}
          sub="check-ins today"
        />
        <Kpi
          label="Tickets open"
          value={ticketsOpen > 0 ? String(ticketsOpen) : "—"}
          sub="across portfolio"
          tone={ticketsOpen > 0 ? "accent" : undefined}
        />
        <Kpi label="Preventive due" value="—" sub="preventive schedule coming soon" />
        <Kpi
          label="Service requests"
          value={kpis && kpis.serviceRequestsOpen > 0 ? String(kpis.serviceRequestsOpen) : "—"}
          sub={kpis && kpis.serviceRequestsOpen > 0 ? "open" : "none seeded"}
        />
        <Kpi label="Photo evidence" value="—" sub="documents pipeline coming soon" />
      </div>

      {/* AI Operations Copilot — empty state until daily-digest agent runs */}
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
              Operations Copilot
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
              The Operations Copilot will surface ad-hoc scheduling suggestions
              here the first time the{" "}
              <em style={{ color: "var(--gold-soft)", fontStyle: "italic" }}>
                daily-digest agent
              </em>{" "}
              files a run.
            </p>
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
              NOT SEEDED
            </span>
          </div>
          {housekeeping.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No housekeeping tasks scheduled. Seed `operation_tasks` rows or
              wire the Mgmt OS scheduler to populate this board.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Villa</th>
                  <th>Time</th>
                  <th>Assignee</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Pri.</th>
                </tr>
              </thead>
              <tbody>
                {housekeeping.map((t) => (
                  <tr key={t.taskId}>
                    <td className="mono">{t.villaCode}</td>
                    <td className="mono">{t.scheduledAt}</td>
                    <td>{t.assigneeName ?? "—"}</td>
                    <td className="num">{t.progressPct}%</td>
                    <td>
                      <Badge>{t.status}</Badge>
                    </td>
                    <td className="mono">{t.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
            Status board · {totalVillas} {totalVillas === 1 ? "villa" : "villas"}
          </h3>
          <div className="label" style={{ marginTop: 4 }}>Live readiness</div>
          {totalVillas === 0 ? (
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No villas yet.
            </p>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {STATE_TILES.map((s) => (
                <div
                  key={s.key}
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
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{s.label}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>
                    {tileCounts.get(s.key) ?? 0}
                  </span>
                </div>
              ))}
            </div>
          )}
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
              {tickets.length} OPEN
            </span>
          </div>
          {tickets.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No open tickets. Maintenance tickets surface here once reported.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Villa</th>
                  <th>Issue</th>
                  <th>Cat.</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const status = STATUS_LABEL[t.status] ?? { text: t.status };
                  return (
                    <tr key={t.id}>
                      <td className="mono">{t.villaCode ?? "—"}</td>
                      <td style={{ maxWidth: 280, fontSize: 13 }}>{t.title}</td>
                      <td>
                        <Badge>{t.issueCategory}</Badge>
                      </td>
                      <td>
                        <Badge tone={SEVERITY_TONE[t.severity]}>{t.severity}</Badge>
                      </td>
                      <td>
                        <Badge tone={status.tone}>{status.text}</Badge>
                      </td>
                      <td className="mono">{t.daysOpen}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 22, fontWeight: 400 }}>
              Preventive · upcoming
            </h2>
            <div className="label" style={{ marginTop: 4 }}>
              Templates · no schedule yet
            </div>
          </div>
          {preventive.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No preventive maintenance templates configured.
            </p>
          ) : (
            <ul className="clean" style={{ padding: "4px 0" }}>
              {preventive.map((p) => (
                <li
                  key={p.templateKey}
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
                      {p.templateName}
                    </span>
                    <Badge>{p.defaultFrequency}</Badge>
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                    {p.category}
                  </div>
                </li>
              ))}
            </ul>
          )}
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
        {serviceRequests.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No service requests yet. Guest-initiated requests surface here once
            the in-stay portal or concierge cabinet routes them through.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Villa</th>
                <th>Guest</th>
                <th>Request</th>
                <th>Vendor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {serviceRequests.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {r.code}
                  </td>
                  <td className="mono">{r.villaCode ?? "—"}</td>
                  <td>{r.guestName ?? "—"}</td>
                  <td style={{ fontSize: 13, maxWidth: 240 }}>{r.requestType}</td>
                  <td style={{ color: "var(--ink-3)" }}>{r.vendorName ?? "—"}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
