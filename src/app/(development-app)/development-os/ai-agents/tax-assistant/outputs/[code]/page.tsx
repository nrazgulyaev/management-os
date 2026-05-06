import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { DevelopmentShell } from "@/components/development/development-shell";
import { AgentOutputDetail } from "@/components/development/agent-output-detail";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";

export const metadata: Metadata = { title: "Tax Assistant output · AI agents" };
export const dynamic = "force-dynamic";

export default async function OutputDetail({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) notFound();
  const rows = await db
    .select()
    .from(agentOutputs)
    .where(eq(agentOutputs.outputCode, code))
    .limit(1);
  const output = rows[0];
  if (!output) notFound();
  return (
    <DevelopmentShell>
      <PageHeader
        title={output.title}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: "Tax Assistant", href: "/development-os/ai-agents/tax-assistant" },
          { label: output.outputCode },
        ]}
      />
      <AgentOutputDetail
        output={{
          ...output,
          editedActions: output.editedActions ?? null,
        }}
        backHref="/development-os/ai-agents/tax-assistant"
      />
    </DevelopmentShell>
  );
}
