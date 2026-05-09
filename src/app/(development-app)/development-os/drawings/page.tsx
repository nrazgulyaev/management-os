import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listDrawings } from "@/lib/development/server/drawings/drawing-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { projects } from "@/lib/db/schema/projects";
import { NoItemsYet } from "@/components/ui/primitives";
import { AddDrawingButton } from "@/components/development/drawings/drawings-add-buttons";

export const metadata: Metadata = { title: "Drawings · Development OS" };
export const dynamic = "force-dynamic";

export default async function DrawingsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Drawings" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery("listDrawings", listDrawings(), [], 4000);
  const projectRows = await safeQuery(
    "drawingsListProjects",
    db.select({ id: projects.id, name: projects.name }).from(projects),
    [] as Array<{ id: string; name: string }>,
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Knowledge Base" },
          { label: "Drawings" },
        ]}
        eyebrow={`${rows.length} drawing${rows.length === 1 ? "" : "s"}`}
        title="Drawings library"
        description="Drawing metadata + revision control. Each drawing carries multiple revisions (Rev A, B, …). At most one revision per drawing is 'issued_for_construction' at any time (DB-enforced)."
        actions={
          <div className="flex gap-2">
            <AddDrawingButton projects={projectRows} />
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
        <NoItemsYet
          entityLabel="drawings"
          description="Each drawing carries metadata + a revision stream. Add the first drawing here, then upload Rev A on the detail page."
          addAction={<AddDrawingButton projects={projectRows} />}
        />
      ) : (
        <Section eyebrow="Catalog" title="All drawings">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Number</TH>
                <TH>Title</TH>
                <TH>Type</TH>
                <TH>Phase</TH>
                <TH>Project</TH>
                <TH>Villa</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/drawings/${encodeURIComponent(d.drawingCode)}`}
                      className="hover:underline"
                    >
                      {d.drawingCode}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs">{d.drawingNumber}</TD>
                  <TD className="text-sm">{d.title}</TD>
                  <TD>
                    <Badge tone="neutral">{d.drawingType}</Badge>
                  </TD>
                  <TD className="text-xs">{d.drawingPhase ?? "—"}</TD>
                  <TD className="font-mono text-xs">{d.projectId.slice(0, 8)}</TD>
                  <TD className="font-mono text-xs">
                    {d.villaId?.slice(0, 8) ?? "—"}
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
