import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projectAiMemory } from "@/lib/db/schema/ai-agents";
import { safeQuery } from "@/lib/development/safe-query";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { MemoryManager } from "./_memory-client";

export const metadata: Metadata = { title: "Project memory · AI agents" };
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Project memory</h1>
          </div>
        </div>
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
  const projects = await getDevelopmentProjects().catch(() => []);
  const projectOptions = projects.map((p) => ({
    id: p.realProjectId,
    name: p.name,
  }));
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/ai-agents">AI agents</Link> /{" "}
            <span>Project memory</span>
          </div>
          <h1>Project memory</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${rows.length} active memory item(s). Memory is shared across all 12 agents.`}
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${rows.length} item(s)`}</div>
        <MemoryManager
          rows={rows.map((m) => ({
            id: m.id,
            memoryType: m.memoryType,
            title: m.title,
            summary: m.summary,
            confidenceLevel: m.confidenceLevel,
            observedCount: m.observedCount,
            lastObservedAt: m.lastObservedAt,
            sourceType: m.sourceType,
          }))}
          projects={projectOptions}
        />
      </div>
    </DevelopmentShell>
  );
}
