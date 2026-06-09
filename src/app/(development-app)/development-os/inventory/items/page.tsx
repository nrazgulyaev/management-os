import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
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
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · stock</div>
            <h1>Inventory items</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const items = await safeQuery("listInventoryItems", listInventoryItems(), [], 4000);

  // KPI strip — derived from the rows already fetched (no extra read).
  const activeCount = items.filter((i) => i.isActive).length;
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter(Boolean)),
  );
  const reorderTracked = items.filter((i) => i.reorderPoint != null).length;
  const missingCost = items.filter(
    (i) => i.lastPurchasePriceMinor == null,
  ).length;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · stock</div>
          <h1>
            Inventory <em>· {items.length} SKUs</em>
          </h1>
          <div className="page-header-meta">
            <span>{activeCount} active</span>
            <span>·</span>
            <span>{categories.length} categories</span>
            <span>·</span>
            <span>{reorderTracked} with reorder point</span>
          </div>
        </div>
        <div className="actions">
          <InventoryItemDevAddButton />
          <ExportButton entity="inventory_items" />
          <Link
            href="/development-os/inventory/locations"
            className="btn btn-dark btn-sm"
          >
            Locations
          </Link>
          <Link
            href="/development-os/inventory/movements"
            className="btn btn-dark btn-sm"
          >
            Movements
          </Link>
          <Link href="/development-os" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        SKU catalog. Stock balances are tracked per (item × location). Reorder
        points trigger the daily low-stock alert cron.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="SKUs · total"
          value={items.length || "—"}
          sub="in catalog"
          tone={items.length ? "accent" : undefined}
        />
        <Kpi label="Active" value={activeCount || "—"} sub="orderable" />
        <Kpi
          label="Reorder tracked"
          value={reorderTracked || "—"}
          sub={`${items.length - reorderTracked} untracked`}
          tone={
            reorderTracked < items.length && items.length > 0
              ? "warn"
              : undefined
          }
        />
        <Kpi
          label="Categories"
          value={categories.length || "—"}
          sub={categories.slice(0, 3).join(" · ") || "none yet"}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No items in catalog"
          description="Use 'New SKU' to add the first inventory item."
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Catalog · all SKUs</span>
            <span className="label">
              {missingCost > 0 ? `${missingCost} missing cost` : "costed"}
            </span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>UoM</th>
                    <th className="num">Reorder point</th>
                    <th className="num">Last cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs">
                        <Link
                          href={`/development-os/inventory/items/${encodeURIComponent(i.sku)}`}
                          className="hover:underline"
                        >
                          {i.sku}
                        </Link>
                      </td>
                      <td className="row-title">{i.displayName}</td>
                      <td className="text-xs text-ink-tertiary">{i.category}</td>
                      <td className="text-xs">{i.unitOfMeasure}</td>
                      <td className="num">
                        {i.reorderPoint != null
                          ? Number(i.reorderPoint).toFixed(2)
                          : "—"}
                      </td>
                      <td className="num">
                        {i.lastPurchasePriceMinor != null
                          ? `${(Number(i.lastPurchasePriceMinor) / 100).toLocaleString()} ${i.defaultCurrency}`
                          : "—"}
                      </td>
                      <td>
                        {i.isActive ? (
                          <HandoffBadge tone="ok">active</HandoffBadge>
                        ) : (
                          <HandoffBadge>inactive</HandoffBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DevelopmentShell>
  );
}
