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

export const metadata: Metadata = { title: "Executive Business Analyst · AI agents" };
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Executive Business Analyst" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "executive_business_outputs",
    db
      .select()
      .from(agentOutputs)
      .where(eq(agentOutputs.agentKey, "executive_business"))
      .orderBy(desc(agentOutputs.createdAt))
      .limit(100),
    [],
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Executive Business Analyst"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: "Executive Business Analyst" },
        ]}
        description="Weekly executive synthesis + strategic recommendations."
      />
      <RunAgentButton agentKey="executive_business" />
      <Section title={`${rows.length} output(s)`}>
        <AgentOutputsTable
          rows={rows}
          detailHrefBase="/development-os/ai-agents/executive-business/outputs"
        />
      </Section>
    </DevelopmentShell>
  );
}
