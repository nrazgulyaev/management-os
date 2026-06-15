import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listDigests } from "@/lib/development/server/executive-digest/digest-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Executive digests · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  draft: "warn",
  under_review: "info",
  approved: "ok",
  distributed: "ok",
  archived: "soft",
};

export default async function DigestsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Digests</span>
            </div>
            <h1>Executive digests</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const digests = await safeQuery("listDigests", listDigests(50), []);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Digests</span>
          </div>
          <h1>Executive digests</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Monthly executive summaries — auto-drafted, operator-approved, then distributed.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${digests.length} digest${digests.length === 1 ? "" : "s"}`}</div>
        {digests.length === 0 ? (
          <EmptyState
            title="No digests yet"
            description="Run the monthly digest job from Jobs to generate the first draft."

          action={
            <Link href="/dashboard/jobs" className="btn btn-secondary btn-sm">View jobs</Link>
          }
        />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Period</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">AI</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {digests.map((d) => (
                <tr key={d.id}>
                  <td className="mono text-[12px]">
                    <Link href={`/development-os/digests/${d.digestCode}`} className="hover:underline">
                      {d.digestCode}
                    </Link>
                  </td>
                  <td className="row-title">{d.periodLabel}</td>
                  <td className="text-xs">{d.digestType}</td>
                  <td>
                    <HandoffBadge tone={STATUS_TONE[d.status] ?? "soft"}>
                      {d.status}
                    </HandoffBadge>
                  </td>
                  <td className="text-xs">{d.aiGenerated ? "✓" : "—"}</td>
                  <td className="text-xs text-ink-tertiary">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DevelopmentShell>
  );
}
