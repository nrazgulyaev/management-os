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
import { listSpecifications } from "@/lib/development/server/specifications/specification-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Specifications · Development OS",
};
export const dynamic = "force-dynamic";

export default async function SpecificationsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Specifications" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listSpecifications",
    listSpecifications(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Knowledge Base" },
          { label: "Specifications" },
        ]}
        eyebrow={`${rows.length} active spec${rows.length === 1 ? "" : "s"}`}
        title="Specifications library"
        description="Material/finish specifications. Linked to BOQ items for material selections, and to quality standards for acceptance-criteria templates."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/development-os/specifications/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New spec
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
          title="No specifications yet"
          description="Add the first material/finish specification."
        />
      ) : (
        <Section eyebrow="Catalog" title="All specifications">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Category</TH>
                <TH>Brand</TH>
                <TH>Model</TH>
                <TH>Color</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/specifications/${encodeURIComponent(s.specCode)}`}
                      className="hover:underline"
                    >
                      {s.specCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{s.specName}</TD>
                  <TD>
                    <Badge tone="neutral">{s.specCategory}</Badge>
                  </TD>
                  <TD className="text-xs">{s.brand ?? "—"}</TD>
                  <TD className="font-mono text-xs">{s.modelNumber ?? "—"}</TD>
                  <TD className="text-xs">{s.colorCode ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
