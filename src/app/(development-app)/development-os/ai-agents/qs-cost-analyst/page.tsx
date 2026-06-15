import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { AgentOutputsTable } from "@/components/development/agent-outputs-table";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { safeQuery } from "@/lib/development/safe-query";
import { RunAgentButton } from "@/components/ai-agents/run-agent-button";

export const metadata: Metadata = { title: "QS Cost Analyst · AI agents" };
export const dynamic = "force-dynamic";

export default async function QsCostAnalystPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>QS Cost Analyst</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "qsOutputs",
    db
      .select()
      .from(agentOutputs)
      .where(eq(agentOutputs.agentKey, "qs_cost_analyst"))
      .orderBy(desc(agentOutputs.createdAt))
      .limit(100),
    [],
  );
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/ai-agents">AI agents</Link> /{" "}
            <span>QS Cost Analyst</span>
          </div>
          <h1>QS Cost Analyst</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Forecast at completion + cost overrun analysis per category.
          </p>
        </div>
      </div>
      <RunAgentButton agentKey="qs_cost_analyst" />
      <div>
        <div className="label mb-2.5">{`${rows.length} output(s)`}</div>
        <AgentOutputsTable
          rows={rows}
          detailHrefBase="/development-os/ai-agents/qs-cost-analyst/outputs"
        />
      </div>
    </DevelopmentShell>
  );
}
