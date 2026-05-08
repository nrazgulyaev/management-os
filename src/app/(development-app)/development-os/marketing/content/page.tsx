import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listContent } from "@/lib/development/server/content/content-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Content pipeline · Marketing" };
export const dynamic = "force-dynamic";

const KANBAN_COLUMNS: Array<{ status: string; label: string }> = [
  { status: "draft", label: "Draft" },
  { status: "in_production", label: "In production" },
  { status: "pending_review", label: "Review" },
  { status: "approved", label: "Approved" },
  { status: "scheduled", label: "Scheduled" },
  { status: "published", label: "Published" },
];

export default async function ContentPipelinePage() {
  const rows = await safeQuery("content", listContent({ limit: 500 }), []);
  const byStatus: Record<string, typeof rows> = {};
  for (const c of KANBAN_COLUMNS) byStatus[c.status] = [];
  for (const r of rows) {
    if (byStatus[r.status]) byStatus[r.status].push(r);
  }

  return (
    <DevelopmentShell>
      <PageHeader
        title="Content pipeline"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Content" },
        ]}
        description={`${rows.length} content piece(s) across the pipeline.`}
      />
      <Section title="Kanban board">
        {rows.length === 0 ? (
          <EmptyState
            title="No content yet"
            description="Briefs and content pieces will appear here as they flow through the pipeline."
          
          action={
            <Link href="/development-os/marketing/connections" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">Configure connections</Link>
          }
        />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {KANBAN_COLUMNS.map((col) => (
              <div
                key={col.status}
                className="rounded-md border border-line-soft bg-surface p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-label">{col.label}</span>
                  <Badge tone="neutral">{byStatus[col.status].length}</Badge>
                </div>
                <ul className="space-y-2">
                  {byStatus[col.status].slice(0, 20).map((c) => (
                    <li key={c.id} className="text-xs">
                      <Link
                        href={`/development-os/marketing/content/${c.contentCode}`}
                        className="hover:underline block py-1"
                      >
                        <span className="font-mono text-[10px] text-ink-tertiary block">
                          {c.contentCode}
                        </span>
                        <span className="block">{c.title}</span>
                        <span className="text-ink-tertiary text-[10px]">
                          {c.contentType}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </DevelopmentShell>
  );
}
