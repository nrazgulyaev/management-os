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
import { listLowStockItems } from "@/lib/development/server/inventory/inventory-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Stocktake · Development OS" };
export const dynamic = "force-dynamic";

export default async function StocktakePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Stocktake" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const lowStock = await safeQuery("listLowStockItems", listLowStockItems(), [], 4000);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "Stocktake" },
        ]}
        eyebrow={`${lowStock.length} location-SKU pair${lowStock.length === 1 ? "" : "s"} below reorder point`}
        title="Stocktake + low-stock alerts"
        description="Items at or below their reorder point. Daily cron `dev_os_inventory_low_stock_alert` notifies procurement when these grow."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/inventory/items">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Items
            </Link>
          </Button>
        }
      />

      {lowStock.length === 0 ? (
        <EmptyState
          title="All stock is above reorder points"
          description="Nothing to procure right now."
        />
      ) : (
        <Section eyebrow="Reorder" title="Below reorder point">
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Item</TH>
                <TH>Location</TH>
                <TH>On hand</TH>
                <TH>Reorder point</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {lowStock.map((row) => (
                <TR key={`${row.item_id}:${row.location_id}`}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/inventory/items/${encodeURIComponent(row.sku)}`}
                      className="hover:underline"
                    >
                      {row.sku}
                    </Link>
                  </TD>
                  <TD className="text-sm">{row.display_name}</TD>
                  <TD className="font-mono text-xs">{row.location_code}</TD>
                  <TDNum>{Number(row.quantity_on_hand).toFixed(2)}</TDNum>
                  <TDNum>{Number(row.reorder_point).toFixed(2)}</TDNum>
                  <TD>
                    {Number(row.quantity_on_hand) <= 0 ? (
                      <Badge tone="danger">out of stock</Badge>
                    ) : (
                      <Badge tone="warning">below reorder</Badge>
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
