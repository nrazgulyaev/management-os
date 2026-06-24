import { notFound } from "next/navigation";
import Link from "next/link";
import { listAgentsForCabinet } from "@/features/ai-agents/ai-hub-cabinet-queries";
import { MGMT_AGENT_CODES, toUnderscored } from "@/features/ai-agents/registry";
import type { AgentTranscriptMessage } from "@/components/ai-agents/agent-transcript";
import { AgentOutputCard } from "@/components/ai-agents/agent-output-card";
import { AgentRunsList } from "@/components/ai-agents/agent-runs-list";
import { AgentConfigCard } from "@/components/ai-agents/agent-config-card";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import {
  getAgentEnabledState,
  listRunsForAgent,
} from "@/features/ai-agents/agent-detail-queries";
import { AgentDetailClient } from "./_detail-client";
import { AgentHeaderActions } from "./_header-actions";

function fmtRunTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function runResult(status: string): "auto" | "routed" | "error" {
  if (status === "completed" || status === "succeeded" || status === "success") return "auto";
  if (status === "failed" || status === "blocked" || status === "refused" || status === "error") return "error";
  return "routed";
}

function statusBadge(status: string): { label: string; cls: string } {
  const r = runResult(status);
  if (r === "auto") return { label: status, cls: "badge-ok" };
  if (r === "error") return { label: status, cls: "badge-danger" };
  return { label: status, cls: "badge-warn" };
}

/**
 * Phase 2.1 PR 4 — Mgmt AI agent detail (template 07).
 *
 * Layout: page-header + 2-column agent-detail body.
 *   left  → transcript (server-loaded seed + client streaming)
 *           + composer (test runs via `useAgentStream` stub).
 *   right → output summary + recent runs + configuration.
 *
 * `generateStaticParams` returns the canonical agent codes from
 * `src/features/ai-agents/registry.ts` so build-time generation
 * stays bounded. Per-org agent visibility is enforced upstream by
 * `enforceProductAccess("mgmt")` on the `(dashboard)` layout.
 *
 * Transcript + right-rail cards are hydrated from this agent's
 * persisted `ai_assistant_runs` rows (org-scoped). When the agent has
 * never run, every surface renders an honest empty-state — no
 * fabricated conversation, run summary, or configuration values.
 */

export const metadata = { title: "AI agent" };
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return MGMT_AGENT_CODES.map((agentCode) => ({ agentCode }));
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentCode: string }>;
}) {
  const { agentCode } = await params;
  if (!MGMT_AGENT_CODES.includes(agentCode as (typeof MGMT_AGENT_CODES)[number])) {
    notFound();
  }

  const [agents, enabledState, runHistory] = await Promise.all([
    listAgentsForCabinet().catch(() => []),
    getAgentEnabledState(agentCode).catch(() => null),
    listRunsForAgent(agentCode, 6).catch(() => ({ runs: [], total: 0 })),
  ]);
  const underscored = toUnderscored(agentCode);
  const agent = agents.find((a) => a.agentKey === underscored);
  // When the DB isn't seeded the agent may not exist in the cabinet
  // query result; we render the shell anyway using the registry code.
  const agentName = agent?.displayName ?? agentCode.replace(/-/g, " ");

  // Hydrate the seeded transcript from this agent's persisted runs
  // (oldest first). Each run contributes the operator/input turn (when an
  // input summary was captured) followed by the agent's output turn. A
  // failed/blocked run surfaces its errorMessage-less output as a routed /
  // error agent turn. No runs → empty transcript (honest empty-state).
  const initialMessages: AgentTranscriptMessage[] = [...runHistory.runs]
    .reverse()
    .flatMap((r) => {
      const when = fmtRunTime(r.createdAt);
      const result = runResult(r.status);
      const turns: AgentTranscriptMessage[] = [];
      if (r.inputSummary) {
        turns.push({
          id: `run-${r.id}-in`,
          actor: "user",
          actorName: "Operator",
          timestamp: when,
          body: r.inputSummary,
        });
      }
      turns.push({
        id: `run-${r.id}-out`,
        actor: "agent",
        timestamp: when,
        body: r.outputSummary ?? `(${r.status})`,
        // Non-auto runs (routed / error / blocked) surface their status as
        // the routed-reason chip rather than inventing a confidence score.
        ...(result === "auto" ? {} : { routedReason: r.status }),
      });
      return turns;
    });

  // Real recent runs from ai_assistant_runs (org-scoped). Empty when the
  // agent has never run — AgentRunsList renders its own empty-state.
  const realRunRows = runHistory.runs.map((r) => ({
    id: r.id,
    result: runResult(r.status),
    summary: <>{r.outputSummary?.slice(0, 60) ?? r.status}</>,
    when: fmtRunTime(r.createdAt),
    href: `/dashboard/ai/${agentCode}/outputs/${r.id}`,
  }));

  // Output · summary — most recent run for this agent (or empty-state).
  const latestRun = runHistory.runs[0] ?? null;

  return (
    <DetailPage>
      <DetailHeader
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "AI agents", href: "/dashboard/ai" },
          { label: agentName },
        ]}
        title={agentName}
        meta={
          <>
            <span className="pulse-dot ok" aria-hidden />
            <span>{agent?.isLive ? "LIVE" : "PLANNED"}</span>
            <span>·</span>
            <span>
              MODEL:{" "}
              <code style={{ background: "var(--cream-deep)", padding: "1px 6px", borderRadius: 4 }}>
                {agent?.model ?? "claude-haiku-4-5"}
              </code>
            </span>
          </>
        }
        actions={
          <AgentHeaderActions
            agentCode={agentCode}
            assistantKey={enabledState?.assistantKey ?? underscored}
            configurable={enabledState?.configurable ?? false}
            initialEnabled={enabledState?.enabled ?? false}
            logsHref={`/dashboard/ai/runs?agent=${underscored}`}
          />
        }
      />

      <div className="agent-detail">
        <div className="left">
          <AgentDetailClient
            agentCode={agentCode}
            agentName={agentName}
            initialMessages={initialMessages}
          />
        </div>
        <aside className="right">
          {latestRun ? (
            <AgentOutputCard
              eyebrow="Output · summary"
              title={`Run ${latestRun.id.slice(0, 8)} · ${fmtRunTime(latestRun.createdAt)}`}
              rows={[
                {
                  key: "Status",
                  value: (
                    <span className={`badge ${statusBadge(latestRun.status).cls}`}>
                      {statusBadge(latestRun.status).label}
                    </span>
                  ),
                },
                {
                  key: "Total tokens",
                  value:
                    latestRun.totalTokens != null
                      ? latestRun.totalTokens.toLocaleString("en-US")
                      : "—",
                },
                {
                  key: "Cost",
                  value: latestRun.totalCostUsd != null ? `$${latestRun.totalCostUsd}` : "—",
                },
                {
                  key: "Latency",
                  value: latestRun.latencyMs != null ? `${latestRun.latencyMs} ms` : "—",
                },
                { key: "Model", value: latestRun.model ?? "—" },
              ]}
              actions={
                <Link
                  href={`/dashboard/ai/${agentCode}/outputs/${latestRun.id}`}
                  className="btn btn-secondary btn-sm"
                  style={{ width: "100%" }}
                >
                  View output →
                </Link>
              }
            >
              {latestRun.outputSummary && (
                <p
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    color: "var(--ink-3)",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {latestRun.outputSummary.length > 280
                    ? `${latestRun.outputSummary.slice(0, 280)}…`
                    : latestRun.outputSummary}
                </p>
              )}
            </AgentOutputCard>
          ) : (
            <AgentOutputCard
              eyebrow="Output · summary"
              title="No runs yet"
            >
              <p style={{ marginTop: 8, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55 }}>
                This agent has not run for your workspace yet. Trigger a test run
                from the composer to generate an output summary.
              </p>
            </AgentOutputCard>
          )}
          <AgentRunsList
            runs={realRunRows}
            total={runHistory.total > 0 ? runHistory.total : undefined}
            seeAllHref={`/dashboard/ai/runs?agent=${underscored}`}
          />
          <AgentConfigCard
            rows={[
              {
                key: "Status",
                value: enabledState?.configurable ? (
                  enabledState.enabled ? (
                    <span className="badge badge-ok">Enabled</span>
                  ) : (
                    <span className="badge badge-warn">
                      {enabledState.reason ?? "Disabled"}
                    </span>
                  )
                ) : (
                  <span className="badge">{agent?.isLive ? "Live" : "Planned"}</span>
                ),
              },
              { key: "Provider", value: agent?.provider ?? "—" },
              { key: "Model", value: agent?.model ?? "—" },
              {
                key: "Runtime key",
                value: (
                  <code style={{ fontSize: 12 }}>
                    {enabledState?.assistantKey ?? underscored}
                  </code>
                ),
              },
            ]}
            editHref={`/dashboard/settings/ai-agents/${underscored}`}
          />
        </aside>
      </div>
    </DetailPage>
  );
}
