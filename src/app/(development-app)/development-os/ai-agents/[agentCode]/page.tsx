import { notFound } from "next/navigation";
import { DEV_AGENT_CODES, toUnderscored } from "@/features/ai-agents/registry";
import { getDevAgentConfigs } from "@/lib/development/server/cabinets/ai-agents-cabinet-queries";
import type { AgentTranscriptMessage } from "@/components/ai-agents/agent-transcript";
import { AgentOutputCard } from "@/components/ai-agents/agent-output-card";
import { AgentRunsList } from "@/components/ai-agents/agent-runs-list";
import { AgentConfigCard } from "@/components/ai-agents/agent-config-card";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { AgentDetailClient } from "@/app/(dashboard)/dashboard/ai/[agentCode]/_detail-client";

/**
 * Phase 2.1 PR 4 — Dev OS AI agent detail.
 *
 * Sister of the Mgmt detail page. Shares the AgentDetailClient
 * wrapper (transcript + composer) — the right-rail content + the
 * page header differ per product. The dynamic [agentCode] route
 * coexists with the existing per-agent literal folders (qs-cost-
 * analyst, daily-digest, …); Next.js matches literals first so the
 * existing pages remain authoritative until 2.2 refactors them.
 */

export const metadata = { title: "AI agent" };
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return DEV_AGENT_CODES.map((agentCode) => ({ agentCode }));
}

export default async function DevAgentDetailPage({
  params,
}: {
  params: Promise<{ agentCode: string }>;
}) {
  const { agentCode } = await params;
  if (!DEV_AGENT_CODES.includes(agentCode as (typeof DEV_AGENT_CODES)[number])) {
    notFound();
  }

  const agents = await getDevAgentConfigs().catch(() => []);
  const underscored = toUnderscored(agentCode);
  const agent = agents.find((a) => a.agentKey === underscored);
  const agentName = agent?.displayName ?? agentCode.replace(/-/g, " ");

  const initialMessages: AgentTranscriptMessage[] = [];

  return (
    <DetailPage>
      <DetailHeader
        breadcrumb={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: agentName },
        ]}
        title={agentName}
        meta={
          <>
            <span>{agent?.isEnabled ? "LIVE" : "PAUSED"}</span>
            <span>·</span>
            <span>
              MODEL:{" "}
              <code style={{ background: "var(--bg-2)", padding: "1px 6px", borderRadius: 4 }}>
                {agent?.model ?? "claude-haiku-4-5"}
              </code>
            </span>
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
            title="No completed runs yet"
            rows={[
              { key: "Status", value: agent?.isEnabled ? "Live" : "Paused" },
              { key: "Provider", value: agent?.provider ?? "—" },
              { key: "Model", value: agent?.model ?? "—" },
              { key: "Key", value: agent?.hasKey ? "Set" : "Not set" },
            ]}
          />
          <AgentRunsList
            runs={[]}
            total={0}
            seeAllHref="/development-os/ai-agents"
          />
          <AgentConfigCard
            rows={[
              { key: "Auto-send", value: "Disabled" },
              { key: "Channels", value: "Internal only" },
              { key: "Knowledge", value: "Project memory" },
            ]}
            editHref={`/development-os/settings/ai-usage`}
          />
        </aside>
      </div>
    </DetailPage>
  );
}
