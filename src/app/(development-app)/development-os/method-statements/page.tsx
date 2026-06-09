import type { Metadata } from "next";
import Link from "next/link";
import { Card, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { MethodStatementAddButton } from "@/components/development/method-statements/method-statement-add-button";
import { getDb } from "@/lib/db/client";
import { listMethodStatements } from "@/lib/development/server/method-statements/method-statement-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Method statements · Development OS",
};
export const dynamic = "force-dynamic";

type MsTone = "ok" | "warn" | "info" | "ink";

const STATUS_TONE: Record<string, MsTone> = {
  draft: "info",
  under_review: "info",
  approved: "ok",
  active: "ok",
  superseded: "ink",
  archived: "ink",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  under_review: "Under review",
  approved: "Approved",
  active: "Active",
  superseded: "Superseded",
  archived: "Archived",
};

export default async function MethodStatementsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listMethodStatements",
    listMethodStatements(),
    [],
    4000,
  );

  const active = rows.filter(
    (m) => m.status === "active" || m.status === "approved",
  ).length;
  const underReview = rows.filter(
    (m) => m.status === "under_review" || m.status === "draft",
  ).length;
  const categories = new Set(rows.map((m) => m.category)).size;
  const superseded = rows.filter(
    (m) => m.status === "superseded" || m.status === "archived",
  ).length;

  return (
    <DevelopmentShell>
      <div className="flex items-end gap-[18px]">
        <div className="flex-1 min-w-0">
          <div className="label text-amber">
            Knowledge · step-by-step procedures
          </div>
          <h1 className="display text-[42px] mt-1.5 mb-0 font-medium">
            Method <em>statements</em>.
          </h1>
          <p className="mt-2.5 mb-0 text-[15px] leading-[1.55] text-ink-3 max-w-[680px]">
            Procedures site staff actually follow. Tools, materials, PPE and
            hazards declared upfront; structured steps render from JSONB.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MethodStatementAddButton />
          <Link
            href="/development-os/knowledge"
            className="btn btn-dark btn-sm"
          >
            Knowledge base
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No method statements yet"
          description="Add the first SOP to start building the procedural library."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Active"
              value={String(active)}
              sub="in force"
              tone="success"
            />
            <Kpi
              label="Under review"
              value={String(underReview)}
              sub="draft → approve"
              tone="warn"
            />
            <Kpi
              label="Categories"
              value={String(categories)}
              sub="trades"
            />
            <Kpi
              label="Superseded"
              value={String(superseded)}
              sub="version history"
            />
          </div>

          <Card padding="none" overflowHidden>
            <div className="px-[22px] py-3.5 border-b border-line flex items-center">
              <h3 className="display text-[19px] font-medium m-0">
                All method statements
              </h3>
              <span className="mono ml-auto text-[11px] text-ink-3">
                {rows.length} · CATALOG
              </span>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="mono text-[11px]">
                      <Link
                        href={`/development-os/method-statements/${encodeURIComponent(m.methodCode)}`}
                        className="no-underline text-inherit hover:underline"
                      >
                        {m.methodCode}
                      </Link>
                    </td>
                    <td>{m.title}</td>
                    <td>
                      <HandoffBadge>{m.category}</HandoffBadge>
                    </td>
                    <td className="mono">v{m.versionNumber}</td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[m.status] ?? "info"}>
                        {STATUS_LABEL[m.status] ?? m.status}
                      </HandoffBadge>
                    </td>
                    <td className="mono text-[11px] text-ink-4">
                      {m.effectiveFrom ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </DevelopmentShell>
  );
}
