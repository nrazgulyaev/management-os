import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
        <PageHeader title="QS Cost Analyst" />
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
      <PageHeader
        title="QS Cost Analyst"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: "QS Cost Analyst" },
        ]}
        description="Forecast at completion + cost overrun analysis per category."
      />
      <RunAgentButton agentKey="qs_cost_analyst" />
      <Section title={`${rows.length} output(s)`}>
        <AgentOutputsTable
          rows={rows}
          detailHrefBase="/development-os/ai-agents/qs-cost-analyst/outputs"
        />
      </Section>
    </DevelopmentShell>
  );
}
