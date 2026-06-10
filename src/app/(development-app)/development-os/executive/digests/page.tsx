import type { Metadata } from "next";
import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import { listDigests } from "@/lib/development/server/executive-digest/digest-queries";

/**
 * Dev OS Executive cabinet — digest archive.
 *
 * Mock: cc-functional-handoff/cabinets/new/dev-executive.html §05
 * (`/executive/digests`). Reuses the existing executive_digests list
 * read; rows deep-link to the existing digest detail route
 * (/development-os/digests/[code]).
 */

export const metadata: Metadata = {
  title: "Digest archive · Executive · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "info" | "soft"
> = {
  draft: "warn",
  under_review: "info",
  approved: "ok",
  distributed: "ok",
  archived: "soft",
};

export default async function ExecutiveDigestArchivePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/executive">Executive</Link> / Digests
            </div>
            <h1>Digest archive.</h1>
          </div>
        </div>
        <EmptyState
          title="Digest archive runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const digests = await safeQuery("listDigests:archive", listDigests(50), []);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/executive">Executive</Link> / Digests
          </div>
          <h1>
            Digest <span className="text-[var(--amber)]">archive.</span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Every executive summary on record — auto-drafted per period,
            operator-approved, then distributed. {digests.length} digest
            {digests.length === 1 ? "" : "s"} archived.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/executive"
            className="btn btn-secondary btn-sm"
          >
            ← Executive
          </Link>
          <Link
            href="/development-os/digests/new"
            className="btn btn-amber btn-sm"
          >
            + Compose digest
          </Link>
        </div>
      </div>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">
            {digests.length} digest{digests.length === 1 ? "" : "s"}
          </h3>
          <span className="label">newest first</span>
        </div>
        {digests.length === 0 ? (
          <EmptyState
            title="No digests yet"
            description="Run the monthly digest job to generate the first draft, or compose one manually."
            action={
              <Link
                href="/development-os/digests/new"
                className="btn btn-secondary btn-sm"
              >
                Compose digest
              </Link>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Period</th>
                <th>Summary</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {digests.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link
                      href={`/development-os/digests/${d.digestCode}`}
                      className="display font-medium text-ink hover:underline"
                    >
                      {d.periodLabel}
                    </Link>
                    <div className="mono text-[10px] text-[var(--ink-3)]">
                      {d.digestCode}
                      {d.aiGenerated ? " · AI-drafted" : ""}
                    </div>
                  </td>
                  <td className="text-[12.5px] text-[var(--ink-3)] max-w-[420px]">
                    {d.executiveSummary.length > 140
                      ? `${d.executiveSummary.slice(0, 140)}…`
                      : d.executiveSummary}
                  </td>
                  <td className="mono text-[11px] text-[var(--ink-3)]">
                    {d.digestType.replace(/_/g, " ")}
                  </td>
                  <td>
                    <HandoffBadge tone={STATUS_TONE[d.status] ?? "soft"}>
                      {d.status.replace(/_/g, " ")}
                    </HandoffBadge>
                  </td>
                  <td className="mono text-[11px] text-[var(--ink-3)]">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </DevelopmentShell>
  );
}
