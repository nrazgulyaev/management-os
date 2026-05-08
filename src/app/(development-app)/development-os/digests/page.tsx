import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
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
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "warning",
  under_review: "info",
  approved: "success",
  distributed: "success",
  archived: "neutral",
};

export default async function DigestsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Executive digests" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const digests = await safeQuery("listDigests", listDigests(50), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Executive digests"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Digests" },
        ]}
        description="Monthly executive summaries — auto-drafted, operator-approved, then distributed."
      />
      <Section title={`${digests.length} digest${digests.length === 1 ? "" : "s"}`}>
        {digests.length === 0 ? (
          <EmptyState
            title="No digests yet"
            description="Run the monthly digest job from Jobs to generate the first draft."
          
          action={
            <Link href="/dashboard/jobs" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View jobs</Link>
          }
        />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Period</th>
                <th>Type</th>
                <th>Status</th>
                <th>AI</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {digests.map((d) => (
                <tr key={d.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link href={`/development-os/digests/${d.digestCode}`} className="hover:underline">
                      {d.digestCode}
                    </Link>
                  </td>
                  <td>{d.periodLabel}</td>
                  <td className="text-xs">{d.digestType}</td>
                  <td>
                    <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>
                      {d.status}
                    </Badge>
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
      </Section>
    </DevelopmentShell>
  );
}
