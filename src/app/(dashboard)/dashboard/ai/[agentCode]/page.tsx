import { notFound } from "next/navigation";
import { listAgentsForCabinet } from "@/features/ai-agents/ai-hub-cabinet-queries";
import { MGMT_AGENT_CODES, toUnderscored } from "@/features/ai-agents/registry";
import type { AgentTranscriptMessage } from "@/components/ai-agents/agent-transcript";
import { AgentOutputCard } from "@/components/ai-agents/agent-output-card";
import { AgentRunsList } from "@/components/ai-agents/agent-runs-list";
import { AgentConfigCard } from "@/components/ai-agents/agent-config-card";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { AgentDetailClient } from "./_detail-client";

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
 * Today only `concierge-auto-reply` ships seeded mock transcript +
 * mock runs (per spec); the other agent codes render the shell
 * with an empty transcript until 2.2 wires their data sources.
 */

export const metadata = { title: "AI agent" };
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return MGMT_AGENT_CODES.map((agentCode) => ({ agentCode }));
}

const MOCK_CONCIERGE_MESSAGES: AgentTranscriptMessage[] = [
  {
    id: "tool-1",
    actor: "tool",
    toolName: "get_booking",
    timestamp: "14:32",
    body: <span>
      <span style={{ color: "var(--ink-3)" }}>booking_id</span> = <span style={{ color: "var(--terra)" }}>&quot;BK-2148&quot;</span>
    </span>,
  },
  {
    id: "user-1",
    actor: "user",
    actorName: "Emma Whitmore",
    channel: "Airbnb",
    timestamp: "14:32",
    body: <>Hi! Just landed at DPS. What time is the breakfast at the villa?</>,
  },
  {
    id: "agent-1",
    actor: "agent",
    timestamp: "14:33",
    confidence: 92,
    body: (
      <>
        Welcome to Bali! Breakfast at Eternal Villa 07 is served 7:30–10:30 daily
        on the upper terrace. Our chef Wayan can adjust timing if you have an
        earlier morning — just let her know tonight.
      </>
    ),
  },
  {
    id: "user-2",
    actor: "user",
    actorName: "Emma Whitmore",
    channel: "Airbnb",
    timestamp: "14:38",
    body: <>Perfect, thank you. Could we extend by 2 nights — checkout on June 1 instead of May 30?</>,
  },
  {
    id: "agent-2",
    actor: "agent",
    timestamp: "14:38",
    confidence: 68,
    routedReason: "revenue-impact",
    routedTo: { name: "Nikita R." },
    body: (
      <>Of course — let me check availability and get back to you within the hour with a quote for the 2 extra nights.</>
    ),
  },
];

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentCode: string }>;
}) {
  const { agentCode } = await params;
  if (!MGMT_AGENT_CODES.includes(agentCode as (typeof MGMT_AGENT_CODES)[number])) {
    notFound();
  }

  const agents = await listAgentsForCabinet().catch(() => []);
  const underscored = toUnderscored(agentCode);
  const agent = agents.find((a) => a.agentKey === underscored);
  // When the DB isn't seeded the agent may not exist in the cabinet
  // query result; we render the shell anyway using the registry code.
  const agentName = agent?.displayName ?? agentCode.replace(/-/g, " ");

  const initialMessages: AgentTranscriptMessage[] =
    agentCode === "concierge-auto-reply" ? MOCK_CONCIERGE_MESSAGES : [];

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
          <>
            <button className="btn btn-ghost btn-sm" disabled>Logs</button>
            <button className="btn btn-secondary btn-sm" disabled>Pause agent</button>
            <button className="btn btn-primary btn-sm" disabled>▶ Test run</button>
          </>
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
          <AgentOutputCard
            eyebrow="Output · summary"
            title={`Run TR-${new Date().toISOString().slice(0, 10)}-1432`}
            rows={[
              { key: "Status", value: <span className="badge badge-warn">Routed</span> },
              { key: "Tokens in", value: "1,420" },
              { key: "Tokens out", value: "340" },
              { key: "Cost", value: "$0.0084" },
              { key: "Tool calls", value: "2" },
              { key: "Latency", value: "8.4s" },
            ]}
          />
          <AgentRunsList
            runs={[
              {
                id: "r1",
                result: "routed",
                summary: <>Whitmore · extend +2n</>,
                when: "14:38",
                href: `/dashboard/ai/${agentCode}/outputs/r1`,
              },
              {
                id: "r2",
                result: "auto",
                summary: <>Whitmore · breakfast time</>,
                when: "14:33",
                href: `/dashboard/ai/${agentCode}/outputs/r2`,
              },
              {
                id: "r3",
                result: "auto",
                summary: <>Chen · check-in time</>,
                when: "13:51",
              },
            ]}
            total={142}
            seeAllHref="/dashboard/ai/runs"
          />
          <AgentConfigCard
            rows={[
              { key: "Auto-send", value: "Confidence ≥ 85%" },
              { key: "Channels", value: "Airbnb, WhatsApp, Email" },
              { key: "Languages", value: "EN, ID, RU" },
              { key: "Knowledge base", value: "12 docs · sync 4h ago" },
            ]}
            editHref={`/dashboard/settings/ai-agents/${underscored}`}
          />
        </aside>
      </div>
    </DetailPage>
  );
}
