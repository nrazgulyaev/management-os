import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  listAgentsForCabinet,
  getAiHubKpis,
  listAgentInbox,
  listRecentRuns,
} from "@/features/ai-agents/ai-hub-cabinet-queries";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS AI Hub cabinet live wiring.
 *
 * Replaces three mock arrays with live reads in
 * `src/features/ai-agents/ai-hub-cabinet-queries.ts`:
 *
 *   - AI_AGENTS → listAgentsForCabinet() (registry overlay × org_ai_agent_config)
 *   - AI_INBOX  → listAgentInbox()       (agent_invocation_log filtered for review)
 *   - RUNS      → listRecentRuns()       (agent_invocation_log audit log)
 *
 * DEMO-1 enabled 5 agents in org_ai_agent_config so the live/planned
 * mix is real. agent_invocation_log empty until first run — inbox +
 * runs render friendly empty states.
 *
 * All reads org-scoped via requireOrgId() (TENANT-1).
 */

export const metadata = { title: "AI assistants" };
export const dynamic = "force-dynamic";

const TONE_COLOR: Record<string, string> = {
  emerald: "var(--ok)",
  gold: "var(--gold)",
  sage: "var(--sage)",
  stone: "var(--ink-3)",
  terracotta: "var(--terra)",
  ink: "var(--forest)",
};

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCostUsd(minor: bigint): string {
  if (minor === 0n) return "—";
  const usd = Number(minor) / 100;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AiHubPage() {
  const [agents, kpis, inbox, runs] = await Promise.all([
    listAgentsForCabinet().catch(() => []),
    getAiHubKpis().catch(() => null),
    listAgentInbox(8).catch(() => []),
    listRecentRuns(8).catch(() => []),
  ]);

  return (
    <>
      <SectionHeading
        eyebrow={
          kpis
            ? `AI assistants · ${agents.length} agents · ${kpis.agentsLive} live`
            : "AI assistants"
        }
        title={
          <>
            One quiet team.{" "}
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>
              {agents.length}
            </em>{" "}
            specialists. One audit log.
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
        <Kpi
          label="Agents · live"
          value={kpis ? String(kpis.agentsLive) : "—"}
          sub={`of ${agents.length} in roadmap`}
          tone={kpis && kpis.agentsLive > 0 ? "success" : undefined}
        />
        <Kpi
          label="Runs · 30d"
          value={kpis && kpis.runs30d > 0 ? String(kpis.runs30d) : "—"}
          sub={kpis && kpis.runs30d > 0 ? "completed" : "no runs yet"}
        />
        <Kpi
          label="Avg latency"
          value={kpis?.avgLatencyMs ? fmtDuration(kpis.avgLatencyMs) : "—"}
          sub="across all runs"
        />
        <Kpi
          label="Token spend · MTD"
          value={kpis && kpis.tokenSpendMtdUsdMinor > 0n ? fmtCostUsd(kpis.tokenSpendMtdUsdMinor) : "—"}
          sub="agent_invocation_log"
          tone={kpis && kpis.tokenSpendMtdUsdMinor > 0n ? "gold" : undefined}
        />
        <Kpi
          label="Refusals · 30d"
          value={kpis && kpis.refusals30d > 0 ? String(kpis.refusals30d) : "—"}
          sub="safety · scope · period closed"
        />
      </div>

      {/* Agent grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {agents.map((a) => (
          <Card
            key={a.agentKey}
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
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: a.isLive ? TONE_COLOR[a.tone] : "var(--cream-deep)",
                  color: a.isLive ? "var(--cream-warm)" : "var(--ink-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
                  {a.displayName}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
                  {a.phase} · {a.isLive ? "LIVE" : "PLANNED"}
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
              {a.description}
            </p>
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
              <div className="label" style={{ fontSize: 9.5 }}>For</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{a.target}</div>
              {a.isLive && a.provider && (
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 4 }}>
                  {a.provider}
                  {a.model ? ` · ${a.model}` : ""}
                </div>
              )}
            </div>
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
        {inbox.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No agent suggestions yet. The inbox populates the first time any
            enabled agent files a run requiring operator review.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Subject</th>
                <th>Severity</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((m) => (
                <tr
                  key={m.id}
                  style={{
                    fontWeight: m.isRead ? 400 : 500,
                    background: m.isRead ? "transparent" : "var(--cream-warm)",
                  }}
                >
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {m.id.slice(0, 8)}
                  </td>
                  <td>
                    <Badge>{m.agentKey.replace(/_/g, " ")}</Badge>
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 480 }}>{m.subject}</td>
                  <td>
                    {m.severity === "warn" ? (
                      <Badge tone="warn">Warn</Badge>
                    ) : (
                      <Badge>Info</Badge>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {fmtTime(m.invokedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
        {runs.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No agent runs yet. The audit log captures every invocation
            (status, latency, tokens, cost) — first row lands the moment an
            agent fires.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Model</th>
                <th>Status</th>
                <th className="num">Latency</th>
                <th className="num">Cost</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {r.id.slice(0, 8)}
                  </td>
                  <td>
                    <span className="badge" style={{ textTransform: "capitalize" }}>
                      {r.agentKey.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {r.model ?? "—"}
                  </td>
                  <td>
                    {r.status === "completed" ? (
                      <Badge tone="ok">OK</Badge>
                    ) : r.status === "refused" || r.status === "blocked" ? (
                      <Badge tone="danger">Blocked</Badge>
                    ) : r.status === "requires_review" ? (
                      <Badge tone="warn">Review</Badge>
                    ) : (
                      <Badge>{r.status}</Badge>
                    )}
                  </td>
                  <td className="num">{fmtDuration(r.durationMs)}</td>
                  <td className="num">{fmtCostUsd(r.costMinor)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {fmtTime(r.invokedAt)}
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
