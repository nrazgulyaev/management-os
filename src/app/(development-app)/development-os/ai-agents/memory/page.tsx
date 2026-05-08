import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projectAiMemory } from "@/lib/db/schema/ai-agents";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Project memory · AI agents" };
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Project memory" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "memory",
    db
      .select()
      .from(projectAiMemory)
      .where(eq(projectAiMemory.isActive, true))
      .orderBy(desc(projectAiMemory.lastObservedAt))
      .limit(200),
    [],
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Project memory"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: "Project memory" },
        ]}
        description={`${rows.length} active memory item(s). Memory is shared across all 12 agents.`}
      />
      <Section title={`${rows.length} item(s)`}>
        {rows.length === 0 ? (
          <EmptyState
            title="No memory yet"
            description="Memory is created via agent ingestion or manual entry. Run any agent now to seed the first memory items, or trigger the aggregator job from system jobs."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Link
                  href="/development-os/ai-agents"
                  className="rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40"
                >
                  Pick an agent to run
                </Link>
                <Link
                  href="/dashboard/jobs"
                  className="rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40"
                >
                  Configure aggregator job
                </Link>
              </div>
            }
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Type</th>
                <th>Title</th>
                <th>Confidence</th>
                <th>Observed</th>
                <th>Last seen</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-line-soft">
                  <td className="py-2 text-xs">{m.memoryType}</td>
                  <td className="truncate max-w-md">{m.title}</td>
                  <td>
                    <Badge tone="neutral">{m.confidenceLevel ?? "—"}</Badge>
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.observedCount}×
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {m.lastObservedAt ?? "—"}
                  </td>
                  <td className="text-xs">{m.sourceType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
