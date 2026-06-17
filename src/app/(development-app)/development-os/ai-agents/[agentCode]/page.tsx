import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { DEV_AGENT_CODES, toUnderscored } from "@/features/ai-agents/registry";
import { getDevAgentConfigs } from "@/lib/development/server/cabinets/ai-agents-cabinet-queries";
import type { AgentTranscriptMessage } from "@/components/ai-agents/agent-transcript";
import { AgentOutputCard } from "@/components/ai-agents/agent-output-card";
import { AgentRunsList, type AgentRunRow } from "@/components/ai-agents/agent-runs-list";
import { AgentConfigCard } from "@/components/ai-agents/agent-config-card";
import { RunAgentButton } from "@/components/ai-agents/run-agent-button";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { AgentDetailClient } from "@/app/(dashboard)/dashboard/ai/[agentCode]/_detail-client";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import { RUN_NOW_AGENTS, type RunNowAgentKey } from "@/features/ai-agents/run-agent-config";

function statusToResult(status: string): AgentRunRow["result"] {
  if (status === "rejected" || status === "expired") return "error";
  if (status === "awaiting_review" || status === "partially_approved")
    return "routed";
  return "auto";
}

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

  // Real run history — this agent's outputs, org-scoped, newest first.
  const db = getDb();
  let outputs: Array<typeof agentOutputs.$inferSelect> = [];
  if (db) {
    const orgId = await requireOrgId().catch(() => null);
    outputs = await safeQuery(
      "devAgentOutputs",
      db
        .select()
        .from(agentOutputs)
        .where(
          orgId
            ? and(
                eq(agentOutputs.agentKey, underscored),
                eq(agentOutputs.organizationId, orgId),
              )
            : eq(agentOutputs.agentKey, underscored),
        )
        .orderBy(desc(agentOutputs.createdAt))
        .limit(20),
      [],
    );
  }

  const slug = underscored.replace(/_/g, "-");
  const runs: AgentRunRow[] = outputs.map((o) => ({
    id: o.id,
    result: statusToResult(o.status),
    summary: o.title,
    when: new Date(o.createdAt).toLocaleDateString(),
    href: `/development-os/ai-agents/${slug}/outputs/${o.outputCode}`,
  }));
  const latest = outputs[0];
  const canRunNow = underscored in RUN_NOW_AGENTS;

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
          {canRunNow && (
            <div style={{ marginBottom: 16 }}>
              <RunAgentButton agentKey={underscored as RunNowAgentKey} />
            </div>
          )}
          <AgentDetailClient
            agentCode={agentCode}
            agentName={agentName}
            initialMessages={initialMessages}
          />
        </div>
        <aside className="right">
          <AgentOutputCard
            eyebrow="Output · summary"
            title={latest ? latest.title : "No completed runs yet"}
            rows={
              latest
                ? [
                    { key: "Latest", value: latest.outputCode },
                    { key: "Status", value: latest.status },
                    {
                      key: "Confidence",
                      value: latest.confidenceLevel ?? "—",
                    },
                    {
                      key: "Created",
                      value: new Date(latest.createdAt).toLocaleString(),
                    },
                  ]
                : [
                    { key: "Status", value: agent?.isEnabled ? "Live" : "Paused" },
                    { key: "Provider", value: agent?.provider ?? "—" },
                    { key: "Model", value: agent?.model ?? "—" },
                    { key: "Key", value: agent?.hasKey ? "Set" : "Not set" },
                  ]
            }
            actions={
              latest ? (
                <a
                  href={`/development-os/ai-agents/${slug}/outputs/${latest.outputCode}`}
                  className="btn btn-secondary btn-sm"
                  style={{ width: "100%" }}
                >
                  Open latest output →
                </a>
              ) : undefined
            }
          />
          <AgentRunsList
            runs={runs}
            total={runs.length}
            seeAllHref="/development-os/ai-agents/inbox"
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
