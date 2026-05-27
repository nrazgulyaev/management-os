import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
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
            One quiet team. <em>{agents.length}</em> specialists. One audit log.
          </>
        }
        subtitle="Every agent reads the same data, writes to the same audit, hits the same per-tenant budget. Read-only allowlists, refusal on closed periods, escalation paths declared up front."
        actions={
          <>
            <button
              className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Token usage
            </button>
            <button
              className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Memory editor
            </button>
            <button
              className="btn btn-primary btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              New conversation +
            </button>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-[18px]">
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
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        {agents.map((a) => (
          <Card
            key={a.agentKey}
            className="p-[18px] flex flex-col gap-2.5 min-h-[220px] relative"
          >
            <div className="flex items-start gap-2.5">
              <span
                className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px]"
                style={{
                  background: a.isLive ? TONE_COLOR[a.tone] : "var(--cream-deep)",
                  color: a.isLive ? "var(--cream-warm)" : "var(--ink-3)",
                }}
              >
                ✦
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-medium font-display">
                  {a.displayName}
                </div>
                <div className="mono text-[10px] text-ink-4 mt-0.5">
                  {a.phase} · {a.isLive ? "LIVE" : "PLANNED"}
                </div>
              </div>
            </div>
            <p className="m-0 text-[12.5px] text-ink-2 leading-[1.45]">
              {a.description}
            </p>
            <div className="mt-auto pt-2.5 border-t border-dashed border-line">
              <div className="label text-[9.5px]">For</div>
              <div className="text-[11.5px] text-ink-3 mt-0.5">{a.target}</div>
              {a.isLive && a.provider && (
                <div className="mono text-[10px] text-ink-4 mt-1">
                  {a.provider}
                  {a.model ? ` · ${a.model}` : ""}
                </div>
              )}
              {a.isLive && a.platformAgentCode && (
                <a
                  href={`/development-os/agents/${a.platformAgentCode}`}
                  className="inline-block mt-2 text-[11px] underline text-ink-2"
                >
                  Open chat →
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* AI inbox */}
      <h2 id="inbox" className="display text-[30px] mb-3.5 font-normal">
        AI inbox · <em>cross-agent</em>
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {inbox.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
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
                  className={
                    m.isRead
                      ? "font-normal"
                      : "font-medium bg-cream-warm"
                  }
                >
                  <td className="mono text-[11px] text-ink-3">
                    {m.id.slice(0, 8)}
                  </td>
                  <td>
                    <HandoffBadge>{m.agentKey.replace(/_/g, " ")}</HandoffBadge>
                  </td>
                  <td className="text-[13px] max-w-[480px]">{m.subject}</td>
                  <td>
                    {m.severity === "warn" ? (
                      <HandoffBadge tone="warn">Warn</HandoffBadge>
                    ) : (
                      <HandoffBadge>Info</HandoffBadge>
                    )}
                  </td>
                  <td className="mono text-[11px]">{fmtTime(m.invokedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Runs */}
      <h2
        id="runs"
        className="display text-[30px] mt-8 mb-3.5 font-normal"
      >
        Recent runs · <em>full audit log</em>
      </h2>
      <Card padding="none" overflowHidden>
        {runs.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
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
                  <td className="mono text-[11px] text-ink-3">
                    {r.id.slice(0, 8)}
                  </td>
                  <td>
                    <span className="badge capitalize">
                      {r.agentKey.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {r.model ?? "—"}
                  </td>
                  <td>
                    {r.status === "completed" ? (
                      <HandoffBadge tone="ok">OK</HandoffBadge>
                    ) : r.status === "refused" || r.status === "blocked" ? (
                      <HandoffBadge tone="danger">Blocked</HandoffBadge>
                    ) : r.status === "requires_review" ? (
                      <HandoffBadge tone="warn">Review</HandoffBadge>
                    ) : (
                      <HandoffBadge>{r.status}</HandoffBadge>
                    )}
                  </td>
                  <td className="num">{fmtDuration(r.durationMs)}</td>
                  <td className="num">{fmtCostUsd(r.costMinor)}</td>
                  <td className="mono text-[11px]">{fmtTime(r.invokedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
