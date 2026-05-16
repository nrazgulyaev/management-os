import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS AI Agents Hub.
 *
 * 1:1 visual port of `_handoff/development/ai-agents.html` (app.js
 * block). Mock data preserved verbatim — live wiring deferred to
 * TASK-7-DATA per docs/audits/task-6-7-data-wiring-todo.md.
 *
 * Sections: SectionHeading → 5-up KPIs → 5-column agent grid (10
 * agents, 5 live) → AI inbox cross-agent table.
 */

export const metadata = { title: "Development OS · AI agents" };
export const dynamic = "force-dynamic";

// TODO(task-7-data): wire to features/ai/services.listDevAgents().
const AGENTS = [
  { id: "qs-cost", name: "QS Cost Analyst", live: true, desc: "Catches unit-cost outliers before they ship to PO. Reads against historical baselines + flags drift." },
  { id: "proc", name: "Procurement Analyst", live: true, desc: "Compares quotations side-by-side, picks the right vendor, flags price drifts." },
  { id: "daily", name: "Daily Construction Digest", live: true, desc: "Yesterday's exceptions, today's plan. Filed at 06:00 to your PM inbox." },
  { id: "weekly", name: "Weekly Plan Generator", live: true, desc: "Forward-looking week plan with resource calls, risk callouts, schedule pivots." },
  { id: "tax", name: "Tax Assistant", live: true, desc: "Auto-categorises every transaction, splits VAT, drafts journal entries." },
  { id: "mkt", name: "Marketing Assistant", live: false, desc: "Per-villa launch copy, channel briefs, agent decks — tuned weekly." },
  { id: "exec", name: "Executive Business", live: false, desc: "Board-ready snapshot. Multi-project. Owner-stay forecast included." },
  { id: "buyer", name: "Buyer CRM Assistant", live: false, desc: "Draft replies, classify leads, match units to prospect briefs. Never auto-sends." },
  { id: "memory", name: "Project Memory", live: true, desc: "Shared semantic memory. Every fact written once, recalled by everyone." },
  { id: "site", name: "Site Photo Verifier", live: false, desc: "Reads geo-tagged photos against checklist items, flags discrepancies." },
];

// TODO(task-7-data): wire to features/ai-runs/services.listDevInbox().
const INBOX = [
  { id: "run-4af2", agent: "QS Cost Analyst", subj: "Marble Hindari · +18.4% vs baseline · reissue RFQ", when: "06:14", sev: "warn" as const },
  { id: "run-4af1", agent: "Procurement Analyst", subj: "BaliSteel scored best for stainless balustrade", when: "05:48", sev: "info" as const },
  { id: "run-4af0", agent: "Daily Construction Digest", subj: "EP02 · Block B pour at 04:30 · 3 anomalies caught", when: "06:00", sev: "info" as const },
  { id: "run-4aef", agent: "Tax Assistant", subj: "PPh 23 withholding · 4 vendor payments need filing in 4d", when: "yesterday", sev: "warn" as const },
  { id: "run-4aee", agent: "Project Memory", subj: "Wrote: 'Beton Nusantara prefers 04:30 dispatch'", when: "yesterday", sev: "info" as const },
];

export default function AiAgentsPage() {
  return (
    <>
      <SectionHeading
        eyebrow="AI agents · 10 specialists · 5 live"
        title={
          <>
            One quiet team for the{" "}
            <span style={{ color: "var(--amber)" }}>jobsite.</span>
          </>
        }
        subtitle="Read-only allowlists. Refuses to act on closed periods or beyond scope. Every reply tied to a run id and an audit row."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Token usage</button>
            <button className="btn btn-dark btn-sm">Memory editor</button>
            <button className="btn btn-amber btn-sm">+ Conversation</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Agents · live" value="5" sub="vs 10 in roadmap" tone="success" />
        <Kpi label="Runs · 30d" value="1,840" sub="98.4% completed" />
        <Kpi label="Avg latency" value="2.4s" sub="p95: 7.1s" />
        <Kpi label="Tokens · MTD" value="$24.20" sub="Budget: $180" tone="accent" />
        <Kpi label="Anomalies caught" value="142" sub="saved est. $84K" />
      </div>

      {/* Agent grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {AGENTS.map((a) => (
          <Card
            key={a.id}
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 180 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: a.live ? "var(--amber)" : "var(--bg-2)",
                  color: a.live ? "var(--carbon)" : "var(--ink-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                ✦
              </span>
              <span style={{ marginLeft: "auto" }}>
                <Badge>{a.live ? "LIVE" : "PLAN"}</Badge>
              </span>
            </div>
            <div className="display" style={{ fontSize: 14, fontWeight: 500 }}>
              {a.name}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
              {a.desc}
            </p>
          </Card>
        ))}
      </div>

      <h2
        id="inbox"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}
      >
        AI inbox · cross-agent
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Run</th>
              <th>Agent</th>
              <th>Subject</th>
              <th>Severity</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {INBOX.map((m) => (
              <tr key={m.id}>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.id}</td>
                <td><Badge>{m.agent}</Badge></td>
                <td style={{ fontSize: 13, maxWidth: 520 }}>{m.subj}</td>
                <td>
                  {m.sev === "warn" ? <Badge tone="warn">Warn</Badge> : <Badge>Info</Badge>}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{m.when}</td>
                <td><button className="btn btn-ghost btn-sm">Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
