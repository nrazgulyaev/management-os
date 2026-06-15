import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DevelopmentShell } from "@/components/development/development-shell";
import { AgentOutputDetail } from "@/components/development/agent-output-detail";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";

export const metadata: Metadata = { title: "Weekly Construction Plan output · AI agents" };
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/ai-agents">AI agents</Link> /{" "}
            <Link href="/development-os/ai-agents/weekly-plan">
              Weekly Construction Plan
            </Link>{" "}
            / <span>{output.outputCode}</span>
          </div>
          <h1>{output.title}</h1>
        </div>
      </div>
      <AgentOutputDetail
        output={{
          ...output,
          editedActions: output.editedActions ?? null,
        }}
        backHref="/development-os/ai-agents/weekly-plan"
      />
    </DevelopmentShell>
  );
}
