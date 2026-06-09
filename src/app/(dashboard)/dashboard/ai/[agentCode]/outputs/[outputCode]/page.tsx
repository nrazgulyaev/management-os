import { notFound } from "next/navigation";
import Link from "next/link";
import { MGMT_AGENT_CODES } from "@/features/ai-agents/registry";
import { getRunPayload } from "@/features/ai-agents/agent-detail-queries";
import { AgentOutputCard } from "@/components/ai-agents/agent-output-card";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";

/**
 * AI Cabinet depth pass — agent output sub-route.
 *
 * `outputCode` is the ai_assistant_runs row id. We load the real run
 * payload and render it; the JSON / PDF buttons are now live download
 * links to /api/ai/output/[runId]/{json,pdf}. When the id doesn't
 * resolve (legacy mock links like "r1"), we fall back to the
 * wire-through proof-of-life card.
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

  // outputCode is a run id; resolve the real payload when possible.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    outputCode,
  );
  const payload = isUuid ? await getRunPayload(outputCode).catch(() => null) : null;
  const hasRealPayload = payload !== null;

  return (
    <DetailPage>
      <DetailHeader
        breadcrumb={[
          { label: "AI agents", href: "/dashboard/ai" },
          { label: agentCode.replace(/-/g, " "), href: `/dashboard/ai/${agentCode}` },
          { label: outputCode.slice(0, 8) },
        ]}
        title={`Run ${outputCode.slice(0, 8)}`}
        meta={
          <>
            <span>AGENT: {payload?.assistantKey ?? agentCode}</span>
            <span>·</span>
            <span>RUN: {outputCode.slice(0, 8)}</span>
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
            {hasRealPayload ? (
              <>
                <a
                  href={`/api/ai/output/${outputCode}/json`}
                  className="btn btn-secondary btn-sm"
                >
                  ↓ JSON
                </a>
                <a
                  href={`/api/ai/output/${outputCode}/pdf`}
                  className="btn btn-primary btn-sm"
                >
                  ↓ PDF
                </a>
              </>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" disabled title="No payload for this run">
                  ↓ JSON
                </button>
                <button className="btn btn-primary btn-sm" disabled title="No payload for this run">
                  ↓ PDF
                </button>
              </>
            )}
          </>
        }
      />

      <main style={{ padding: "24px 28px", maxWidth: 720 }}>
        <AgentOutputCard
          eyebrow={`OUTPUT · ${outputCode.slice(0, 8)}`}
          title={hasRealPayload ? "Structured output payload" : "Output not found"}
          rows={
            hasRealPayload && payload
              ? [
                  {
                    key: "Status",
                    value: <span className="badge badge-ok">{payload.status}</span>,
                  },
                  { key: "Model", value: payload.model ?? "—" },
                  {
                    key: "Tokens (in/out)",
                    value: `${payload.promptTokens ?? 0} / ${payload.completionTokens ?? 0}`,
                  },
                  {
                    key: "Cost",
                    value: payload.totalCostUsd != null ? `$${payload.totalCostUsd}` : "—",
                  },
                  {
                    key: "Latency",
                    value: payload.latencyMs != null ? `${payload.latencyMs} ms` : "—",
                  },
                  { key: "Run id", value: payload.id.slice(0, 8) },
                ]
              : [{ key: "Run id", value: outputCode }]
          }
        >
          {hasRealPayload && payload ? (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {payload.outputSummary ?? payload.errorMessage ?? "(no output text)"}
            </p>
          ) : (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55 }}>
              No persisted run matched this id. Trigger a{" "}
              <Link href={`/dashboard/ai/${agentCode}`} className="underline underline-offset-2">
                test run
              </Link>{" "}
              to generate a downloadable output.
            </p>
          )}
        </AgentOutputCard>
      </main>
    </DetailPage>
  );
}
