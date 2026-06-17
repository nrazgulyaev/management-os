import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  getDevAgentConfigs,
  getDevAiKpis,
  getRecentAgentOutputs,
} from "@/lib/development/server/cabinets/ai-agents-cabinet-queries";
import { AgentCatalog, type AgentCategory } from "@/components/ai-agents/agent-catalog";

const DEV_CATEGORIES: AgentCategory[] = [
  { key: "construction", label: "Construction" },
  { key: "cost", label: "Cost & finance" },
  { key: "operations", label: "Operations" },
  { key: "knowledge", label: "Knowledge" },
];

const DEV_CATEGORY_BY_KEY: Record<string, string> = {
  qs_cost_analyst: "cost",
  procurement_analyst: "cost",
  tax_assistant: "cost",
  daily_digest: "operations",
  weekly_plan: "operations",
  marketing_assistant: "operations",
  executive_business: "operations",
  memory: "knowledge",
};

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
  const [agents, inbox, kpis] = await Promise.all([
    getDevAgentConfigs().catch(() => []),
    getRecentAgentOutputs(8).catch(() => []),
    getDevAiKpis().catch(() => ({
      runsLast24h: 0,
      avgLatencyMs: 0,
      totalTokensMtd: 0,
      errorRatePct: 0,
    })),
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
            <span className="text-amber">jobsite.</span>
          </>
        }
        subtitle="Read-only allowlists. Refuses to act on closed periods or beyond scope. Every reply tied to a run id and an audit row."
        actions={
          <>
            <Link
              href="/development-os/settings/ai-usage"
              className="btn btn-dark btn-sm"
              title="Token & cost usage across agents"
            >
              Token usage
            </Link>
            <Link
              href="/development-os/ai-agents/memory"
              className="btn btn-dark btn-sm"
              title="Add and curate project-memory items"
            >
              Memory editor
            </Link>
            <Link
              href="/development-os/ai-agents/executive-business"
              className="btn btn-amber btn-sm"
              title="Open a conversational thread with the business agent"
            >
              + Conversation
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-[18px]">
        <Kpi
          label="Agents · live"
          value={String(liveCount)}
          sub={`of ${totalCount} in roadmap`}
          tone={liveCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Runs · 24h"
          value={kpis.runsLast24h > 0 ? String(kpis.runsLast24h) : "—"}
          sub={
            kpis.runsLast24h > 0
              ? `${kpis.errorRatePct}% error rate`
              : "no runs in the last 24h"
          }
          tone={kpis.runsLast24h > 0 ? "success" : undefined}
        />
        <Kpi
          label="Avg latency"
          value={kpis.avgLatencyMs > 0 ? `${kpis.avgLatencyMs}ms` : "—"}
          sub="across 24h runs"
        />
        <Kpi
          label="Tokens · MTD"
          value={
            kpis.totalTokensMtd > 0
              ? kpis.totalTokensMtd >= 1000
                ? `${(kpis.totalTokensMtd / 1000).toFixed(1)}K`
                : String(kpis.totalTokensMtd)
              : "—"
          }
          sub="month-to-date"
        />
        <Kpi
          label="Inbox · recent"
          value={inbox.length === 0 ? "—" : String(inbox.length)}
          sub={inbox.length === 0 ? "no outputs yet" : "across all agents"}
        />
      </div>

      {/* PR 4 — template-07 catalog (chip strip + 3-up grid). */}
      <AgentCatalog
        agents={agents.map((a) => ({
          code: a.agentKey.replace(/_/g, "-"),
          name: a.displayName,
          description: a.description,
          category: DEV_CATEGORY_BY_KEY[a.agentKey] ?? "construction",
          tone: a.isEnabled ? "accent" : "neutral",
          isLive: a.isEnabled && !a.notConfigured,
          schedule: a.notConfigured ? "NOT CONFIGURED" : (!a.isEnabled ? "PAUSED" : undefined),
          href: `/development-os/ai-agents/${a.agentKey.replace(/_/g, "-")}`,
        }))}
        categories={DEV_CATEGORIES}
      />

      <h2
        id="inbox"
        className="display text-[22px] mb-3.5 font-medium"
      >
        AI inbox · cross-agent
      </h2>
      <Card padding="none" overflowHidden>
        {inbox.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic">
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
                    <td className="mono text-[11px] text-ink-3">
                      {m.outputCode}
                    </td>
                    <td>
                      <HandoffBadge>{m.agentKey.replace(/_/g, " ")}</HandoffBadge>
                    </td>
                    <td className="text-[13px] max-w-[520px]">{m.title}</td>
                    <td>
                      {tone ? (
                        <HandoffBadge tone={tone}>{m.status.replace(/_/g, " ")}</HandoffBadge>
                      ) : (
                        <HandoffBadge>{m.status.replace(/_/g, " ")}</HandoffBadge>
                      )}
                    </td>
                    <td className="mono text-[11px]">
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
