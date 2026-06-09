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
import { AgentCatalog, type AgentCatalogItem, type AgentCategory } from "@/components/ai-agents/agent-catalog";
import type { AgentTone } from "@/components/ai-agents/agent-card";
import { toHyphenated } from "@/features/ai-agents/registry";
import { HubHeaderActions, type HubAgentOption } from "./_hub-header-actions";

/**
 * Phase 2.1 PR 4 — Mgmt AI Hub catalog refactor.
 *
 * The hub now opens with the template-07 chip strip + 3-up
 * `<AgentCatalog>`; the inbox + audit-log tables stay below as
 * cabinet chrome (KPIs collapse into the SectionHeading meta line).
 *
 * Each catalog card links to the new agent detail route
 * (`/dashboard/ai/[agentCode]`). Phase 2.2 wires real run + auto-
 * resolved telemetry into the card stats; today the cards show "—"
 * for runs/24h since the audit log is empty in dev.
 */

export const metadata = { title: "AI assistants" };
export const dynamic = "force-dynamic";

const TONE_MAP: Record<string, AgentTone> = {
  emerald: "accent",
  gold: "gold",
  sage: "neutral",
  stone: "neutral",
  terracotta: "accent",
  ink: "steel",
};

const CATEGORIES: AgentCategory[] = [
  { key: "concierge", label: "Concierge" },
  { key: "statements", label: "Statements" },
  { key: "operations", label: "Operations" },
  { key: "owner-intel", label: "Owner intelligence" },
];

const CATEGORY_BY_KEY: Record<string, string> = {
  executive_business: "owner-intel",
  tax_assistant: "statements",
  daily_digest: "operations",
  weekly_plan: "operations",
  marketing_assistant: "operations",
  procurement_analyst: "operations",
  inbox: "concierge",
  memory: "owner-intel",
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

  // Runnable agents for the "New conversation" picker — prefer the
  // configurable/runnable set so the chat actually fires a real run.
  const chatAgents: HubAgentOption[] = agents.map((a) => ({
    code: toHyphenated(a.agentKey),
    name: a.displayName,
  }));

  const items: AgentCatalogItem[] = agents.map((a) => ({
    code: toHyphenated(a.agentKey),
    name: a.displayName,
    description: a.description,
    category: CATEGORY_BY_KEY[a.agentKey] ?? "operations",
    tone: TONE_MAP[a.tone] ?? "accent",
    isLive: a.isLive,
    runs24h: undefined, // empty until agent_invocation_log seeds
    autoResolvedPct: undefined,
    schedule: a.isLive ? undefined : "PLANNED",
    href: `/dashboard/ai/${toHyphenated(a.agentKey)}`,
  }));

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
        actions={<HubHeaderActions agents={chatAgents} />}
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

      {/* PR 4 — template-07 catalog. Chip strip filters the grid. */}
      <AgentCatalog agents={items} categories={CATEGORIES} />

      {/* AI inbox */}
      <h2 id="inbox" className="display text-[30px] mb-3.5 font-normal mt-8">
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
                <th scope="col">Run</th>
                <th scope="col">Agent</th>
                <th scope="col">Subject</th>
                <th scope="col">Severity</th>
                <th scope="col">Time</th>
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
                <th scope="col">Run</th>
                <th scope="col">Agent</th>
                <th scope="col">Model</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Latency</th>
                <th scope="col" className="num">Cost</th>
                <th scope="col">Time</th>
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
