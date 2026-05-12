import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ItemCard } from "@/components/inventory/item-card";
import { MovementTable } from "@/components/inventory/movement-table";
import { InventoryItemAddButton } from "@/components/inventory/inventory-item-add-button";
import { MovementAddButton } from "@/components/inventory/movement-add-button";
import {
  listInventoryCategories,
  listInventoryItems,
  listInventoryLocations,
  listInventoryMovements,
  listLowStockItems,
  listSuppliers,
} from "@/features/inventory/services";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryHomePage() {
  // 8.C.8 — wrap each query in safeList so an RLS denial / missing
  // relation on any one feed doesn't 500 the whole hub. The 500 was
  // observed authenticated only — likely an RLS policy that the
  // unauthenticated mock-fallback path skipped.
  const [itemsR, lowStockR, locationsR, recentMovementsR, categoriesR, suppliersR] = await Promise.all([
    safeList("inventory.items", () => listInventoryItems({ limit: 500 })),
    safeList("inventory.lowStock", () => listLowStockItems()),
    safeList("inventory.locations", () => listInventoryLocations()),
    safeList("inventory.movements", () => listInventoryMovements({ limit: 10 })),
    safeList("inventory.categories", () => listInventoryCategories()),
    safeList("inventory.suppliers", () => listSuppliers()),
  ]);
  const items = itemsR.value;
  const lowStock = lowStockR.value;
  const locations = locationsR.value;
  const recentMovements = recentMovementsR.value;
  const categoryOpts = categoriesR.value.map((c) => ({ id: c.id, label: c.name }));
  const supplierOpts = suppliersR.value.map((s) => ({ id: s.id, label: s.name }));
  const movementItemOpts = items.map((i) => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}`,
  }));
  const locationOpts = locations.map((l) => ({ id: l.id, label: l.name }));
  const lastScanRun = await getLastRunByJobKey("scan_low_stock").catch(
    () => null,
  );

  const totalSkus = items.length;
  const stockUnits = items.reduce((sum, i) => sum + i.totalStock, 0);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Inventory" }]}
        title="Inventory command center"
        description="Stock levels, low-stock alerts, and recent movements across warehouses, villas, and carts."
        actions={
          <div className="flex gap-2">
            <MovementAddButton items={movementItemOpts} locations={locationOpts} />
            <InventoryItemAddButton categories={categoryOpts} suppliers={supplierOpts} />
          </div>
        }
      />
      <DbStatusNotice />

      <LastRunBadge label="Last automatic low-stock scan" run={lastScanRun} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active SKUs" value={String(totalSkus)} />
        <MetricCard
          label="Total stock units"
          value={Math.round(stockUnits).toLocaleString()}
          hint="across all locations"
        />
        <MetricCard
          label="Low stock"
          value={String(lowStock.length)}
          accent={lowStock.length > 0}
          hint={lowStock.length > 0 ? "below reorder point" : undefined}
        />
        <MetricCard label="Locations" value={String(locations.length)} />
      </div>

      <Section
        eyebrow="Attention"
        title="Items below reorder point"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/inventory/items">All items</Link>
          </Button>
        }
      >
        {lowStock.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
            No items below reorder point.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lowStock.slice(0, 8).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                href={`/dashboard/inventory/items/${item.id}`}
              />
            ))}
          </div>
        )}
      </Section>

      <Section eyebrow="Recent movements" title="Stock activity">
        <MovementTable rows={recentMovements} />
      </Section>
    </div>
  );
}
