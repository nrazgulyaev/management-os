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
import { listAssets } from "@/lib/development/server/assets/asset-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Assets · Development OS" };
export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; type?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Assets" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const assets = await safeQuery(
    "listAssets",
    listAssets({ category: params.category, typeKey: params.type }),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Assets" },
        ]}
        eyebrow={`${assets.length} units · Stage 5.B.1`}
        title="Assets"
        description="Every saleable / rentable / revenue-generating unit in the portfolio. Backed by the `villas` table — the name is preserved for FK compatibility (60+ FKs) but the table is now multi-asset."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/asset-types">Manage types</Link>
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

      {assets.length === 0 ? (
        <EmptyState
          title="No assets match this filter"
          description="Drop the filter or seed data via scripts/seed-dev-os.mjs."
        />
      ) : (
        <Section eyebrow="Inventory" title="Assets (sorted by unit code)">
          <Table>
            <THead>
              <TR>
                <TH>Unit code</TH>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Project</TH>
              </TR>
            </THead>
            <TBody>
              {assets.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">{a.unitCode}</TD>
                  <TD className="text-sm">{a.name}</TD>
                  <TD className="text-xs">{a.assetTypeDisplayName}</TD>
                  <TD>
                    <Badge tone="info">{a.assetCategory}</Badge>
                  </TD>
                  <TD>
                    <Badge tone="neutral">{a.status}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">
                    {a.projectId.slice(0, 8)}
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
