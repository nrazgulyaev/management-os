import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  getDevAgentConfigs,
  getRecentAgentOutputs,
} from "@/lib/development/server/cabinets/ai-agents-cabinet-queries";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS AI Agents hub live wiring.
 *
 * Visual port from `_handoff/development/ai-agents.html` (TASK-7-VISUAL,
 * commit `316dc65`); this commit replaces two mock arrays with live,
 * org-scoped reads in
 * `src/lib/development/server/cabinets/ai-agents-cabinet-queries.ts`:
 *
 *   - mockAGENTS → getDevAgentConfigs() (org_ai_agent_config join over
 *     canonical agent_key set; missing rows render as "Not configured")
 *   - mockINBOX  → getRecentAgentOutputs(8) (cross-agent inbox, gated by
 *     dev-side agent_key set)
 *
 * KPI strip remains static placeholders — agent telemetry table lands in
 * TASK-7-DATA-PART-3 (runs / latency / token aggregation).
 */

export const metadata = { title: "Development OS · AI agents" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | undefined> = {
  delivered: "ok",
  reviewed: "ok",
  actioned: "ok",
  pending: "warn",
  flagged: "warn",
  failed: "danger",
};

export default async function AiAgentsPage() {
  const [agents, inbox] = await Promise.all([
    getDevAgentConfigs().catch(() => []),
    getRecentAgentOutputs(8).catch(() => []),
  ]);

  const liveCount = agents.filter((a) => a.isEnabled).length;
  const totalCount = agents.length;

  return (
    <>
      <SectionHeading
        eyebrow={`AI agents · ${totalCount} specialists · ${liveCount} live`}
        title={
          <>
            One quiet team for the{" "}
            <span style={{ color: "var(--amber)" }}>jobsite.</span>
          </>
        }
        subtitle="Read-only allowlists. Refuses to act on closed periods or beyond scope. Every reply tied to a run id and an audit row."
        actions={
          <>
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Token usage</button>
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Memory editor</button>
            <button className="btn btn-amber btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>+ Conversation</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Agents · live"
          value={String(liveCount)}
          sub={`of ${totalCount} in roadmap`}
          tone={liveCount > 0 ? "success" : undefined}
        />
        <Kpi label="Runs · 30d" value="—" sub="agent telemetry coming soon" />
        <Kpi label="Avg latency" value="—" sub="agent telemetry coming soon" />
        <Kpi label="Tokens · MTD" value="—" sub="agent cost rollup coming soon" />
        <Kpi
          label="Inbox · recent"
          value={inbox.length === 0 ? "—" : String(inbox.length)}
          sub={inbox.length === 0 ? "no outputs yet" : "across all agents"}
        />
      </div>

      {/* Agent grid — live org_ai_agent_config */}
      {agents.length === 0 ? (
        <Card style={{ padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No agent configuration available. Configure your first agent to populate this grid.
          </p>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          {agents.map((a) => (
            <Card
              key={a.agentKey}
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 180 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: a.isEnabled ? "var(--amber)" : "var(--bg-2)",
                    color: a.isEnabled ? "var(--carbon)" : "var(--ink-3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  ✦
                </span>
                <span style={{ marginLeft: "auto" }}>
                  {a.notConfigured ? (
                    <Badge>Not configured</Badge>
                  ) : a.isEnabled ? (
                    <Badge tone="ok">LIVE</Badge>
                  ) : (
                    <Badge>PAUSED</Badge>
                  )}
                </span>
              </div>
              <div className="display" style={{ fontSize: 14, fontWeight: 500 }}>
                {a.displayName}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
                {a.description}
              </p>
              {!a.notConfigured && (a.provider || a.model) && (
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: "auto" }}>
                  {a.provider ?? "—"}
                  {a.model ? ` · ${a.model}` : ""}
                  {a.hasKey ? " · KEY SET" : ""}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <h2
        id="inbox"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}
      >
        AI inbox · cross-agent
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {inbox.length === 0 ? (
          <p
            style={{
              padding: 20,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No agent outputs yet. The inbox populates the first time any
            dev-side agent files a run — anomalies, digests, weekly plans
            all surface here.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Subject</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((m) => {
                const tone = STATUS_TONE[m.status];
                return (
                  <tr key={m.outputCode}>
                    <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {m.outputCode}
                    </td>
                    <td>
                      <Badge>{m.agentKey.replace(/_/g, " ")}</Badge>
                    </td>
                    <td style={{ fontSize: 13, maxWidth: 520 }}>{m.title}</td>
                    <td>
                      {tone ? (
                        <Badge tone={tone}>{m.status.replace(/_/g, " ")}</Badge>
                      ) : (
                        <Badge>{m.status.replace(/_/g, " ")}</Badge>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <Link
                        href={`/development-os/ai-agents/${m.agentKey.replace(/_/g, "-")}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
