import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listQualityStandards } from "@/lib/development/server/quality-standards/quality-standard-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { NoItemsYet } from "@/components/ui/primitives";
import { AddQualityStandardButton } from "@/components/development/quality-standards/quality-standards-add-buttons";

export const metadata: Metadata = {
  title: "Quality standards · Development OS",
};
export const dynamic = "force-dynamic";

export default async function QualityStandardsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Quality standards</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listQualityStandards",
    listQualityStandards(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Knowledge Base</span> / <span>Quality standards</span>
          </div>
          <h1>Quality standards / acceptance criteria</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Acceptance-criteria templates linked back to QA/QC inspections. QA
            inspectors can pin an inspection result against the formal standard
            that was being checked.
          </p>
        </div>
        <div className="actions">
          <div className="flex gap-2">
            <AddQualityStandardButton />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <NoItemsYet
          entityLabel="quality standards"
          description="Acceptance-criteria templates linked back to QA/QC inspections — define the first one to give inspectors a yardstick."
          addAction={<AddQualityStandardButton />}
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Active</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((q) => (
                <TR key={q.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/quality-standards/${encodeURIComponent(q.standardCode)}`}
                      className="hover:underline"
                    >
                      {q.standardCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{q.title}</TD>
                  <TD>
                    <HandoffBadge tone="soft">{q.category}</HandoffBadge>
                  </TD>
                  <TD>
                    {q.isActive ? (
                      <HandoffBadge tone="ok">active</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="soft">inactive</HandoffBadge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
