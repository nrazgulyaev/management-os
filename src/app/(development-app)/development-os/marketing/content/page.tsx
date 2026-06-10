import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { listContent } from "@/lib/development/server/content/content-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { ContentStatusControl } from "./_status-control";

export const metadata: Metadata = { title: "Content pipeline · Marketing" };
export const dynamic = "force-dynamic";

/**
 * Dev OS content pipeline — pixel redesign to cabinets/new/dev-marketing.html
 * (§01 right column · 3-lane content pipeline kanban). Replaces the legacy
 * PageHeader/Section/Badge shell + bg-stone grid with the handoff design
 * system (SectionHeading + .pipe lanes + .pipe-card cards), scoped to the
 * engineering palette under data-product="development". Data wiring preserved
 * verbatim:
 *   - listContent({ limit: 500 }) → cards bucketed by content_status
 *   - getCurrentAppUser()         → gate the wired ContentStatusControl
 *   - ContentStatusControl        → transitionContentStatus (unchanged)
 * The board keeps all six real workflow lanes (the mock's 3-lane sketch is a
 * subset) so no live status bucket is dropped.
 */

const KANBAN_COLUMNS: Array<{ status: string; label: string }> = [
  { status: "draft", label: "Draft" },
  { status: "in_production", label: "In production" },
  { status: "pending_review", label: "Review" },
  { status: "approved", label: "Approved" },
  { status: "scheduled", label: "Scheduled" },
  { status: "published", label: "Published" },
];

export default async function ContentPipelinePage() {
  const [rows, me] = await Promise.all([
    safeQuery("content", listContent({ limit: 500 }), []),
    getCurrentAppUser().catch(() => null),
  ]);
  const byStatus: Record<string, typeof rows> = {};
  for (const c of KANBAN_COLUMNS) byStatus[c.status] = [];
  for (const r of rows) {
    if (byStatus[r.status]) byStatus[r.status].push(r);
  }

  return (
    <>
      <SectionHeading
        eyebrow="marketing / content"
        title={
          <>
            Content pipeline{" "}
            <span className="text-amber italic">· {rows.length}</span>
          </>
        }
        subtitle={`${rows.length} content piece(s) across the pipeline.`}
        actions={
          <Link
            href="/development-os/marketing/content/new"
            prefetch={false}
            className="btn btn-amber btn-sm"
          >
            + Content
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No content yet"
          description="Briefs and content pieces will appear here as they flow through the pipeline."
          action={
            <Link
              href="/development-os/marketing/connections"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Configure connections
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {KANBAN_COLUMNS.map((col) => (
            <div
              key={col.status}
              className="bg-surface border border-line-soft rounded-lg px-3 py-2.5 min-h-[160px]"
            >
              <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary mb-2">
                <span>{col.label}</span>
                <span className="text-ink font-medium tabular-nums">
                  {byStatus[col.status].length}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {byStatus[col.status].slice(0, 20).map((c) => (
                  <div
                    key={c.id}
                    className="bg-muted rounded-[5px] px-2.5 py-2 text-[11.5px] text-ink-secondary leading-snug"
                  >
                    <Link
                      href={`/development-os/marketing/content/${c.contentCode}`}
                      prefetch={false}
                      className="block"
                    >
                      <span className="font-mono text-[9.5px] text-ink-tertiary block">
                        {c.contentCode}
                      </span>
                      <strong className="block text-ink font-medium mb-px">
                        {c.title}
                      </strong>
                      <span className="font-mono text-[9.5px] text-ink-tertiary">
                        {c.contentType}
                      </span>
                    </Link>
                    {me?.id && (
                      <ContentStatusControl
                        contentCode={c.contentCode}
                        status={c.status}
                        userId={me.id}
                      />
                    )}
                  </div>
                ))}
                {byStatus[col.status].length === 0 && (
                  <div className="text-[11px] text-ink-tertiary italic">
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
