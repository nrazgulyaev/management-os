import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq} from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
        {rows.length === 0 ? (
          <EmptyState
            title="No memory yet"
            description="Memory is created via agent ingestion or manual entry. Run any agent now to seed the first memory items, or trigger the aggregator job from system jobs."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Link
                  href="/development-os/ai-agents"
                  className="btn btn-secondary btn-sm"
                >
                  Pick an agent to run
                </Link>
                <Link
                  href="/dashboard/jobs"
                  className="btn btn-secondary btn-sm"
                >
                  Configure aggregator job
                </Link>
              </div>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Title</th>
                <th scope="col">Confidence</th>
                <th scope="col">Observed</th>
                <th scope="col">Last seen</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs">{m.memoryType}</td>
                  <td className="row-title truncate max-w-md">{m.title}</td>
                  <td>
                    <HandoffBadge tone="soft">
                      {m.confidenceLevel ?? "—"}
                    </HandoffBadge>
                  </td>
                  <td className="mono tabular-nums text-xs">
                    {m.observedCount}×
                  </td>
                  <td className="text-xs text-ink-3">
                    {m.lastObservedAt ?? "—"}
                  </td>
                  <td className="text-xs">{m.sourceType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DevelopmentShell>
  );
}
