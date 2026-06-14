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

export const metadata: Metadata = { title: "Procurement Analyst · AI agents" };
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Procurement Analyst</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "procurement_analyst_outputs",
    db
      .select()
      .from(agentOutputs)
      .where(eq(agentOutputs.agentKey, "procurement_analyst"))
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
            <span>Procurement Analyst</span>
          </div>
          <h1>Procurement Analyst</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Vendor reliability + lead-time analysis.
          </p>
        </div>
      </div>
      <RunAgentButton agentKey="procurement_analyst" />
      <div>
        <div className="label mb-2.5">{`${rows.length} output(s)`}</div>
        <AgentOutputsTable
          rows={rows}
          detailHrefBase="/development-os/ai-agents/procurement-analyst/outputs"
        />
      </div>
    </DevelopmentShell>
  );
}
