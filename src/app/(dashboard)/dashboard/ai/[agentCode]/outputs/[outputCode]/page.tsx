import { notFound } from "next/navigation";
import Link from "next/link";
import { MGMT_AGENT_CODES } from "@/features/ai-agents/registry";
import { AgentOutputCard } from "@/components/ai-agents/agent-output-card";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";

/**
 * Phase 2.1 PR 4 — Agent output sub-route.
 *
 * Direct-link surface for a specific run's structured output.
 * Renders the AgentOutputCard full-width with download buttons +
 * a back-link to the parent agent detail.
 *
 * Note (spec): Statement = special-case output that ALSO lives at
 * `finance/statements/[id]`. Both URLs resolve to the same row; the
 * statement route renders the detail-page treatment (template 05),
 * this route renders the runtime view + download.
 *
 * Today the output payload is mocked — 2.2 wires the real
 * `agent_outputs` table read.
 */

export const metadata = { title: "Agent output" };
export const dynamic = "force-dynamic";

export default async function AgentOutputPage({
  params,
}: {
  params: Promise<{ agentCode: string; outputCode: string }>;
}) {
  const { agentCode, outputCode } = await params;
  if (!MGMT_AGENT_CODES.includes(agentCode as (typeof MGMT_AGENT_CODES)[number])) {
    notFound();
  }

  return (
    <DetailPage>
      <DetailHeader
        breadcrumb={[
          { label: "AI agents", href: "/dashboard/ai" },
          { label: agentCode.replace(/-/g, " "), href: `/dashboard/ai/${agentCode}` },
          { label: outputCode },
        ]}
        title={`Run ${outputCode}`}
        meta={
          <>
            <span>AGENT: {agentCode}</span>
            <span>·</span>
            <span>OUTPUT CODE: {outputCode}</span>
          </>
        }
        actions={
          <>
            <Link
              href={`/dashboard/ai/${agentCode}`}
              className="btn btn-secondary btn-sm"
            >
              ← Back to agent
            </Link>
            <button className="btn btn-secondary btn-sm" disabled>↓ JSON</button>
            <button className="btn btn-primary btn-sm" disabled>↓ PDF</button>
          </>
        }
      />

      <main style={{ padding: "24px 28px", maxWidth: 720 }}>
        <AgentOutputCard
          eyebrow={`OUTPUT · ${outputCode}`}
          title="Structured output payload"
          rows={[
            { key: "Status", value: <span className="badge badge-warn">Routed</span> },
            { key: "Confidence", value: "68%" },
            { key: "Tool calls", value: "2" },
            { key: "Tokens (in/out)", value: "1,420 / 340" },
            { key: "Cost", value: "$0.0084" },
            { key: "Latency", value: "8.4s" },
            { key: "Run id", value: outputCode },
          ]}
        >
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55 }}>
            Real output payload (transcript, attached tool results, suggested
            actions) loads from the <code>agent_outputs</code> table in Phase 2.2.
            This page is the wire-through proof-of-life — direct links from
            inbox rows and recent-runs panels resolve here.
          </p>
        </AgentOutputCard>
      </main>
    </DetailPage>
  );
}
