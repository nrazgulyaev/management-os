import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
  Pulse,
} from "@/components/dashboard/primitives";
import {
  getConciergeKpis,
  listConciergeSessionsForCabinet,
  listConciergeHandoffsForCabinet,
  listSafetyEventsForCabinet,
  listConciergeMemoryNotes,
} from "@/features/guest-ai-concierge/concierge-cabinet-queries";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS Concierge cabinet live wiring.
 *
 * Five mock arrays replaced with live reads in
 * `src/features/guest-ai-concierge/concierge-cabinet-queries.ts`.
 *
 * DEMO-2 doesn't seed concierge data — sessions / messages / handoffs
 * / safety events / memory all empty. The cabinet renders as a clear
 * "ready for guests to start messaging" state rather than synthetic
 * activity. Once guests message via WhatsApp / direct chat, every
 * panel populates automatically.
 */

export const metadata = { title: "Concierge AI" };
export const dynamic = "force-dynamic";

function initials(name: string | null): string {
  if (!name) return "—";
  return name
    .split(" ")
    .filter((p) => p && /[A-Za-z]/.test(p[0]))
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ConciergePage() {
  const [kpis, sessions, handoffs, safety, memory] = await Promise.all([
    getConciergeKpis().catch(() => null),
    listConciergeSessionsForCabinet(6).catch(() => []),
    listConciergeHandoffsForCabinet(5).catch(() => []),
    listSafetyEventsForCabinet(5).catch(() => []),
    listConciergeMemoryNotes().catch(() => []),
  ]);

  return (
    <>
      <SectionHeading
        eyebrow={
          kpis
            ? `Concierge AI · ${kpis.activeSessions} active · ${kpis.handoffsOpen} handoffs`
            : "Concierge AI"
        }
        title={
          sessions.length === 0 ? (
            <>
              Ready for guests to{" "}
              <em style={{ color: "var(--terra)", fontStyle: "italic" }}>start messaging.</em>
            </>
          ) : (
            <>
              {sessions.length} sessions{" "}
              <em style={{ color: "var(--terra)", fontStyle: "italic" }}>across channels.</em>
            </>
          )
        }
        subtitle="Multilingual replies on WhatsApp, in-stay portal and email. Escalates only what truly needs you. Audit log per reply."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Templates</button>
            <button className="btn btn-secondary btn-sm">Memory</button>
            <button className="btn btn-primary btn-sm">
              Review handoffs · {kpis?.handoffsOpen ?? 0}
            </button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Active sessions"
          value={kpis && kpis.activeSessions > 0 ? String(kpis.activeSessions) : "—"}
          sub={kpis && kpis.activeSessions > 0 ? "live" : "none active"}
          tone={kpis && kpis.activeSessions > 0 ? "success" : undefined}
        />
        <Kpi
          label="Messages · today"
          value={kpis && kpis.messagesToday > 0 ? String(kpis.messagesToday) : "—"}
          sub="across channels"
        />
        <Kpi
          label="Refusals · today"
          value={kpis && kpis.refusalsToday > 0 ? String(kpis.refusalsToday) : "—"}
          sub="safety_status flagged"
        />
        <Kpi
          label="Handoffs queued"
          value={kpis && kpis.handoffsOpen > 0 ? String(kpis.handoffsOpen) : "—"}
          sub={kpis && kpis.handoffsOpen > 0 ? "open" : "all clear"}
          tone={kpis && kpis.handoffsOpen > 0 ? "accent" : undefined}
        />
        <Kpi label="CSAT · 30d" value="—" sub="feedback collection in DEMO-3" />
      </div>

      {/* 2-up: sessions list + active transcript panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--line-soft)" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
              Sessions
            </h3>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              {sessions.length} · ALL CHANNELS
            </span>
          </div>
          {sessions.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No active sessions. Concierge sessions appear here when guests
              message via WhatsApp, the in-stay portal, or direct chat.
            </p>
          ) : (
            <ul className="clean" style={{ padding: 0 }}>
              {sessions.map((s, i) => (
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
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: "var(--cream-deep)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                      }}
                    >
                      {initials(s.guestName)}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 13.5 }}>
                      {s.guestName ?? "Guest"}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
                      {s.villaCode ?? "—"} {s.language ? `· ${s.language.toUpperCase()}` : ""}
                    </span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-4)" }}>
                      {fmtTime(s.lastMessageAt)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 36 }}>
                    {s.status === "active" ? (
                      <Badge tone="ok">
                        <Pulse /> Live
                      </Badge>
                    ) : s.status === "handoff" ? (
                      <Badge tone="warn">Handoff</Badge>
                    ) : (
                      <Badge>{s.status}</Badge>
                    )}
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
                      {s.messageCount} msgs
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Transcript panel — empty state until session selected */}
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 380 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {sessions.length === 0 ? "No session selected" : "Select a session"}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {sessions.length === 0
                  ? "Live transcript renders here once guests start messaging"
                  : "Open a session on the left to view the transcript"}
              </div>
            </div>
          </div>
          <div
            style={{
              padding: 24,
              flex: 1,
              background: "var(--cream-warm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-3)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            {sessions.length === 0
              ? "Configure WhatsApp / in-stay portal channels on the AI hub to start receiving messages."
              : "Click a session to load its transcript."}
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
        {handoffs.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No handoffs queued. Sessions that the AI cannot resolve surface
            here automatically with priority + assignment context.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Session</th>
                <th>Villa</th>
                <th>Guest</th>
                <th>What</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {handoffs.map((h) => (
                <tr
                  key={h.id}
                  style={{
                    background: h.priority === "urgent" ? "rgba(196,88,60,0.04)" : "transparent",
                  }}
                >
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {h.sessionId ? h.sessionId.slice(0, 8) : "—"}
                  </td>
                  <td className="mono">{h.villaCode ?? "—"}</td>
                  <td>{h.guestName ?? "—"}</td>
                  <td style={{ maxWidth: 380, fontSize: 13 }}>{h.summary}</td>
                  <td>
                    {h.priority === "urgent" ? (
                      <Badge tone="danger">Urgent</Badge>
                    ) : h.priority === "warn" ? (
                      <Badge tone="warn">Warn</Badge>
                    ) : (
                      <Badge>{h.priority}</Badge>
                    )}
                  </td>
                  <td>
                    <Badge>{h.status}</Badge>
                  </td>
                  <td className="mono">{fmtTime(h.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Safety events + Memory editor */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
              Safety events · last 24h
            </h3>
            <div className="label" style={{ marginTop: 4 }}>
              Projected from message safety flags
            </div>
          </div>
          {safety.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No safety events. Anomalies (refused requests, sensitive
              disclosures, lock-attempt patterns) surface here in real time.
            </p>
          ) : (
            <ul className="clean" style={{ padding: 0 }}>
              {safety.map((e) => (
                <li key={e.id} style={{ padding: "12px 18px" }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: e.riskLevel === "warn" ? "var(--warn)" : "var(--ink-3)",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.eventLabel}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                      {e.villaCode ?? "—"} · {fmtTime(e.occurredAt)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{e.note}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          style={{
            padding: 20,
            background: "var(--cream-warm)",
            border: "1px dashed var(--line-strong)",
          }}
        >
          <div className="label label-amber">AI Memory · written by AI</div>
          <h3
            style={{
              margin: "4px 0 8px",
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            Recalled per-guest facts
          </h3>
          {memory.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: "0 0 14px" }}>
              Once concierge sessions start producing facts (allergies,
              preferences, smart-lock notes), they surface here for review +
              editing.
            </p>
          ) : (
            <ul className="clean" style={{ padding: 0, marginBottom: 14 }}>
              {memory.map((m) => (
                <li key={m.id} style={{ padding: "8px 0", fontSize: 13 }}>
                  • {m.fact}
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-secondary btn-sm" disabled>
            Open memory editor
          </button>
        </Card>
      </div>
    </>
  );
}
