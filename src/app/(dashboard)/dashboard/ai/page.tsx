import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 6 (visual port) — Mgmt OS AI Hub cabinet.
 *
 * 1:1 visual port of `_handoff/management/ai-hub.html` (app.js
 * block). Mock data preserved verbatim — live wiring (agent
 * registry from features/ai/services + runs ledger from features/
 * ai-runs/services) deferred to TASK-6-DATA per
 * docs/audits/task-6-data-wiring-todo.md.
 *
 * Section order: SectionHeading → 5-up KPIs → 8-card agent grid →
 * AI inbox table (cross-agent) → Runs table (full audit log) +
 * refusal footer note.
 */

export const metadata = { title: "AI assistants" };
export const dynamic = "force-dynamic";

type Tone = "emerald" | "gold" | "sage" | "stone" | "terracotta" | "ink";

const TONE_COLOR: Record<Tone, string> = {
  emerald: "var(--ok)",
  gold: "var(--gold)",
  sage: "var(--sage)",
  stone: "var(--ink-3)",
  terracotta: "var(--terra)",
  ink: "var(--forest)",
};

// TODO(task-6-data): wire to features/ai/services.listAgents() or
// reuse src/lib/mock/ai-assistants.ts (mockAssistants).
const AI_AGENTS: {
  id: string;
  name: string;
  tone: Tone;
  target: string;
  phase: string;
  live: boolean;
  desc: string;
}[] = [
  { id: "investor", name: "Investor Assistant", tone: "emerald", target: "Investor · Owner · Delegate", phase: "v3", live: true, desc: "Explains owner statements with line-by-line citations. Never invents a number." },
  { id: "finance", name: "Finance Analyst", tone: "gold", target: "Finance Manager · Director · Accountant", phase: "v3", live: true, desc: "GOP, NOI, ADR, RevPAR, variance detection and narrative drafting across the portfolio." },
  { id: "operations", name: "Operations Copilot", tone: "sage", target: "Ops Manager · Property Manager · Housekeeping", phase: "v4", live: true, desc: "Today's turnovers, SLA risk, task reassignment, complaint summaries." },
  { id: "maintenance", name: "Maintenance Assistant", tone: "stone", target: "Ops Manager · Technician", phase: "v4", live: true, desc: "Draft resolutions, lookup warranty documents, propose purchase requests." },
  { id: "procurement", name: "Procurement Assistant", tone: "emerald", target: "Procurement Manager · Ops", phase: "v5", live: false, desc: "Low-stock forecasts, supplier scoring, draft POs — never auto-sent." },
  { id: "report", name: "Report Writer", tone: "gold", target: "Director · Finance · Ops Manager", phase: "v4", live: false, desc: "Drafts monthly operations reports, investor letters, board summaries with citations." },
  { id: "guest", name: "Guest Concierge", tone: "sage", target: "Guest (via signed stay token)", phase: "v6", live: true, desc: "Tokenized guest-side help: guide, Wi-Fi, upsells, service requests. Never reveals smart-lock code." },
  { id: "crm", name: "CRM Assistant", tone: "terracotta", target: "Sales · Director · Concierge", phase: "v7", live: false, desc: "Draft replies, classify leads, match villas to prospect briefs. Never auto-sends." },
];

// TODO(task-6-data): wire to features/ai-runs/services.listInbox().
const AI_INBOX = [
  { id: "run-9af", agent: "Operations Copilot", subj: "ES-S6 turnover blocked · pool filter on backorder", when: "06:18", read: false, sev: "warn" as const },
  { id: "run-9ae", agent: "Finance Analyst", subj: "PHR tax variance March — 0.2pp over historic median", when: "05:50", read: false, sev: "info" as const },
  { id: "run-9ad", agent: "Maintenance Asst.", subj: "ES-S6 AC ticket — 3 likely root causes ranked", when: "yesterday 22:14", read: true, sev: "info" as const },
  { id: "run-9ac", agent: "Investor Assistant", subj: "Emma · explanation of March net (drafted, awaiting reviewer)", when: "yesterday 14:08", read: true, sev: "info" as const },
  { id: "run-9ab", agent: "Report Writer", subj: "Q1 investor letter · Enso pool · 612 words", when: "yesterday 10:30", read: true, sev: "info" as const },
];

// TODO(task-6-data): wire to features/ai-runs/services.listRecentRuns().
const RUNS = [
  { id: "run-9af", agent: "operations", model: "haiku-4.5", status: "ok" as const, tools: 6, lat: "1.4s", tokens: 540 },
  { id: "run-9ae", agent: "finance", model: "haiku-4.5", status: "ok" as const, tools: 3, lat: "0.9s", tokens: 418 },
  { id: "run-9ad", agent: "maintenance", model: "haiku-4.5", status: "ok" as const, tools: 5, lat: "2.1s", tokens: 712 },
  { id: "run-9ac", agent: "investor", model: "haiku-4.5", status: "ok" as const, tools: 4, lat: "3.2s", tokens: 980 },
  { id: "run-9ab", agent: "report", model: "sonnet-4.5", status: "ok" as const, tools: 8, lat: "8.4s", tokens: 2410 },
  { id: "run-9aa", agent: "procurement", model: "haiku-4.5", status: "blocked" as const, tools: 0, lat: "0.1s", tokens: 34 },
];

export default function AiHubPage() {
  return (
    <>
      <SectionHeading
        eyebrow="AI assistants · 8 agents · 4 live"
        title={
          <>
            One quiet team.{" "}
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>Eight</em> specialists. One audit log.
          </>
        }
        subtitle="Every agent reads the same data, writes to the same audit, hits the same per-tenant budget. Read-only allowlists, refusal on closed periods, escalation paths declared up front."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Token usage</button>
            <button className="btn btn-secondary btn-sm">Memory editor</button>
            <button className="btn btn-primary btn-sm">New conversation +</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Agents · live" value="4" sub="vs 8 in roadmap" tone="success" />
        <Kpi label="Runs · 30d" value="1,284" sub="98.1% completed" />
        <Kpi label="Avg latency" value="2.1s" sub="p95: 6.4s" />
        <Kpi label="Token spend · MTD" value="USD 18.40" sub="Budget: USD 150" tone="gold" />
        <Kpi label="Refusals · 30d" value="42" sub="closed-period · safety · scope" />
      </div>

      {/* Agent grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {AI_AGENTS.map((a) => (
          <Card
            key={a.id}
            style={{
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 220,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: a.live ? TONE_COLOR[a.tone] : "var(--cream-deep)",
                  color: a.live ? "var(--cream-warm)" : "var(--ink-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16,
                }}
              >
                ✦
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 500,
                    fontFamily: "var(--font-newsreader), serif",
                  }}
                >
                  {a.name}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
                  {a.phase} · {a.live ? "LIVE" : "PLANNED"}
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
              {a.desc}
            </p>
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
              <div className="label" style={{ fontSize: 9.5 }}>For</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{a.target}</div>
            </div>
            {a.live && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ position: "absolute", top: 14, right: 14, padding: "3px 8px", fontSize: 11 }}
              >
                Open ↗
              </button>
            )}
          </Card>
        ))}
      </div>

      {/* AI inbox */}
      <h2
        id="inbox"
        className="display"
        style={{ fontSize: 30, marginBottom: 14, fontWeight: 400 }}
      >
        AI inbox ·{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>cross-agent</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Run</th>
              <th>Agent</th>
              <th>Subject</th>
              <th>Severity</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {AI_INBOX.map((m) => (
              <tr
                key={m.id}
                style={{
                  fontWeight: m.read ? 400 : 500,
                  background: m.read ? "transparent" : "var(--cream-warm)",
                }}
              >
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.id}</td>
                <td><Badge>{m.agent}</Badge></td>
                <td style={{ fontSize: 13, maxWidth: 480 }}>{m.subj}</td>
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

      {/* Runs */}
      <h2
        id="runs"
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Recent runs ·{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>full audit log</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Run</th>
              <th>Agent</th>
              <th>Model</th>
              <th>Status</th>
              <th className="num">Tools</th>
              <th className="num">Latency</th>
              <th className="num">Tokens</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {RUNS.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.id}</td>
                <td>
                  <span className="badge" style={{ textTransform: "capitalize" }}>{r.agent}</span>
                </td>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.model}</td>
                <td>
                  {r.status === "ok" ? <Badge tone="ok">OK</Badge> : <Badge tone="danger">Blocked</Badge>}
                </td>
                <td className="num">{r.tools}</td>
                <td className="num">{r.lat}</td>
                <td className="num">{r.tokens.toLocaleString()}</td>
                <td><button className="btn btn-ghost btn-sm">↗</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          className="mono"
          style={{
            padding: "12px 22px",
            background: "var(--cream-warm)",
            borderTop: "1px solid var(--line-soft)",
            fontSize: 11.5,
            color: "var(--ink-3)",
          }}
        >
          <strong style={{ color: "var(--ink)" }}>1 blocked:</strong> run-9aa ·
          procurement-assistant tried to call{" "}
          <code style={{ background: "var(--paper)", padding: "1px 5px", borderRadius: 3 }}>create_po</code> — not in
          allowlist. Refusal logged. Operator manual draft.
        </div>
      </Card>
    </>
  );
}
