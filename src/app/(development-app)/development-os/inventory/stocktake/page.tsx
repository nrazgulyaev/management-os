import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Stocktake</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const lowStock = await safeQuery("listLowStockItems", listLowStockItems(), [], 4000);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inventory/items">Inventory</Link> /{" "}
            <span>Stocktake</span>
          </div>
          <div className="label">
            {`${lowStock.length} location-SKU pair${lowStock.length === 1 ? "" : "s"} below reorder point`}
          </div>
          <h1>Stocktake + low-stock alerts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Items at or below their reorder point. Daily cron
            `dev_os_inventory_low_stock_alert` notifies procurement when these
            grow.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/inventory/items"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Items
          </Link>
        </div>
      </div>

      {lowStock.length === 0 ? (
        <EmptyState
          title="All stock is above reorder points"
          description="Nothing to procure right now."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Reorder</div>
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
                      <HandoffBadge tone="danger">out of stock</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="warn">below reorder</HandoffBadge>
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
