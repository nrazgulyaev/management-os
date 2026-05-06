import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listQualityStandards } from "@/lib/development/server/quality-standards/quality-standard-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Quality standards · Development OS",
};
export const dynamic = "force-dynamic";

export default async function QualityStandardsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Quality standards" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Knowledge Base" },
          { label: "Quality standards" },
        ]}
        eyebrow={`${rows.length} active standard${rows.length === 1 ? "" : "s"}`}
        title="Quality standards / acceptance criteria"
        description="Acceptance-criteria templates linked back to QA/QC inspections. QA inspectors can pin an inspection result against the formal standard that was being checked."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/development-os/quality-standards/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New standard
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No quality standards yet"
          description="Add the first acceptance-criteria template."
        />
      ) : (
        <Section eyebrow="Catalog" title="All quality standards">
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
                    <Badge tone="neutral">{q.category}</Badge>
                  </TD>
                  <TD>
                    {q.isActive ? (
                      <Badge tone="success">active</Badge>
                    ) : (
                      <Badge tone="neutral">inactive</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
