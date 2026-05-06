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
import { listAssetTypes } from "@/lib/development/server/assets/asset-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { AssetTypeModalForm } from "@/components/development/assets/asset-type-modal-form";

export const metadata: Metadata = { title: "Asset types · Development OS" };
export const dynamic = "force-dynamic";

export default async function AssetTypesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Asset types" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const types = await safeQuery(
    "listAssetTypes",
    listAssetTypes({ activeOnly: false }),
    [],
    4000,
  );
  const activeCount = types.filter((t) => t.isActive).length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Asset types" },
        ]}
        eyebrow={`${activeCount} active / ${types.length} total · Stage 5.B.1`}
        title="Asset type registry"
        description="Strategy B for the multi-asset refactor: every entry in `villas` (now semantically the assets table) carries an asset_type_id pointing here. Seeded with 12 defaults — operators may add more, never delete in-use rows."
        actions={
          <div className="flex items-center gap-2">
            <AssetTypeModalForm />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {types.length === 0 ? (
        <EmptyState
          title="No asset types loaded"
          description="The migration seeds 12 defaults — re-run drizzle migrations."
        />
      ) : (
        <Section eyebrow="Registry" title="Asset types">
          <Table>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>Display name</TH>
                <TH>Category</TH>
                <TH>Saleable</TH>
                <TH>Rentable</TH>
                <TH>Revenue</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {types.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs">{t.typeKey}</TD>
                  <TD className="text-sm">{t.displayName}</TD>
                  <TD>
                    <Badge tone="info">{t.assetCategory}</Badge>
                  </TD>
                  <TD className="text-xs">{t.isSaleable ? "yes" : "—"}</TD>
                  <TD className="text-xs">{t.isRentable ? "yes" : "—"}</TD>
                  <TD className="text-xs">
                    {t.isRevenueGenerating ? "yes" : "—"}
                  </TD>
                  <TD>
                    <Badge tone={t.isActive ? "success" : "neutral"}>
                      {t.isActive ? "active" : "inactive"}
                    </Badge>
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
