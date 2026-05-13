import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInventoryItems } from "@/lib/development/server/inventory/inventory-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { ExportButton } from "@/components/development/bulk-import/export-button";
import { InventoryItemDevAddButton } from "@/components/development/inventory/inventory-item-dev-add-button";

export const metadata: Metadata = {
  title: "Inventory items · Development OS",
};
export const dynamic = "force-dynamic";

export default async function InventoryItemsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Inventory items" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const items = await safeQuery("listInventoryItems", listInventoryItems(), [], 4000);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "Items" },
        ]}
        eyebrow={`${items.length} active SKU${items.length === 1 ? "" : "s"}`}
        title="Inventory items"
        description="SKU catalog. Stock balances are tracked per (item × location). Reorder points trigger the daily low-stock alert cron."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/inventory/locations">Locations</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/inventory/movements">Movements</Link>
            </Button>
            <InventoryItemDevAddButton />
            <ExportButton entity="inventory_items" />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No items in catalog"
          description="Use 'New SKU' to add the first inventory item."
        />
      ) : (
        <Section eyebrow="Catalog" title="All SKUs">
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Name</TH>
                <TH>Category</TH>
                <TH>UoM</TH>
                <TH>Reorder point</TH>
                <TH>Last cost</TH>
                <TH>Active</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/inventory/items/${encodeURIComponent(i.sku)}`}
                      className="hover:underline"
                    >
                      {i.sku}
                    </Link>
                  </TD>
                  <TD className="text-sm">{i.displayName}</TD>
                  <TD className="text-xs">{i.category}</TD>
                  <TD className="text-xs">{i.unitOfMeasure}</TD>
                  <TDNum>
                    {i.reorderPoint != null
                      ? Number(i.reorderPoint).toFixed(2)
                      : "—"}
                  </TDNum>
                  <TDNum>
                    {i.lastPurchasePriceMinor != null
                      ? `${(Number(i.lastPurchasePriceMinor) / 100).toLocaleString()} ${i.defaultCurrency}`
                      : "—"}
                  </TDNum>
                  <TD>
                    {i.isActive ? (
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
