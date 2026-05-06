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

export const metadata: Metadata = { title: "Marketing Assistant · AI agents" };
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Marketing Assistant" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "marketing_assistant_outputs",
    db
      .select()
      .from(agentOutputs)
      .where(eq(agentOutputs.agentKey, "marketing_assistant"))
      .orderBy(desc(agentOutputs.createdAt))
      .limit(100),
    [],
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Marketing Assistant"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: "Marketing Assistant" },
        ]}
        description="Captions, hashtags, broadcast templates."
      />
      <Section title={`${rows.length} output(s)`}>
        <AgentOutputsTable
          rows={rows}
          detailHrefBase="/development-os/ai-agents/marketing-assistant/outputs"
        />
      </Section>
    </DevelopmentShell>
  );
}
