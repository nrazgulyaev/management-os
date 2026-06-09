import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { InventoryItemAddButton } from "@/components/inventory/inventory-item-add-button";
import { MovementAddButton } from "@/components/inventory/movement-add-button";
import { PurchaseOrderAddButton } from "@/components/procurement/order-add-button";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import {
  listInventoryCategories,
  listInventoryItems,
  listInventoryLocations,
  listInventoryMovements,
  listLowStockItems,
  listSuppliers,
} from "@/features/inventory/services";
import { listPurchaseOrders } from "@/features/procurement/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { safeList } from "@/features/system/db-health";
import { mapPoolAll } from "@/lib/db/map-pool";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const PO_OPEN = new Set(["draft", "sent", "confirmed", "partially_received"]);

const MV_TONE: Record<string, "success" | "neutral" | "info" | "warning"> = {
  receive: "success",
  consume: "neutral",
  transfer: "info",
  adjustment: "warning",
  adjust: "warning",
  count: "neutral",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function money(minor: number, currency: string): string {
  const v = Math.round(minor / 100).toLocaleString();
  return `${currency} ${v}`.trim();
}

/** Reorder-progress bar fill ratio (0–1) for a low-stock item. The
 *  reorder point is the "par" line; stock at/above par = full bar. */
function fillRatio(stock: number, reorder: number | null): number {
  if (!reorder || reorder <= 0) return 1;
  return Math.max(0, Math.min(1, stock / reorder));
}

export default async function InventoryHomePage() {
  // safeList: an RLS denial / missing relation on any one feed must not 500
  // the whole hub.
  const [
    itemsR,
    lowStockR,
    locationsR,
    recentMovementsR,
    categoriesR,
    suppliersR,
    ordersR,
  ] = await mapPoolAll([
    () => safeList("inventory.items", () => listInventoryItems({ limit: 500 })),
    () => safeList("inventory.lowStock", () => listLowStockItems()),
    () => safeList("inventory.locations", () => listInventoryLocations()),
    () => safeList("inventory.movements", () => listInventoryMovements({ limit: 12 })),
    () => safeList("inventory.categories", () => listInventoryCategories()),
    () => safeList("inventory.suppliers", () => listSuppliers()),
    () => safeList("inventory.orders", () => listPurchaseOrders()),
  ] as const, 4);
  const items = itemsR.value;
  const lowStock = lowStockR.value;
  const locations = locationsR.value;
  const recentMovements = recentMovementsR.value;
  const suppliers = suppliersR.value;
  const orders = ordersR.value;
  const categoryOpts = categoriesR.value.map((c) => ({ id: c.id, label: c.name }));
  const supplierOpts = suppliers.map((s) => ({ id: s.id, label: s.name }));
  const movementItemOpts = items.map((i) => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}`,
  }));
  const locationOpts = locations.map((l) => ({ id: l.id, label: l.name }));

  const [projects, villas] = await Promise.all([
    listProjects().catch(() => []),
    listVillas().catch(() => []),
  ]);
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOpts = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName}`,
  }));
  const lastScanRun = await getLastRunByJobKey("scan_low_stock").catch(() => null);

  // KPI strip + 3-column body driving data.
  const openOrders = orders.filter((o) => PO_OPEN.has(o.status));
  const overdueOrders = openOrders.filter(
    (o) =>
      o.expectedDelivery !== null &&
      new Date(o.expectedDelivery) < new Date() &&
      o.status !== "received",
  );

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const spendMtdMinor = orders
    .filter((o) => new Date(o.createdAt) >= monthStart)
    .reduce((s, o) => s + Number(o.totalMinor ?? 0n), 0);
  const spendCurrency = orders.find((o) => o.currency)?.currency ?? "";
  const spendLabel = spendMtdMinor > 0 ? money(spendMtdMinor, spendCurrency) : "—";

  // Low-stock column — danger first (deepest deficit), then warn.
  const lowSorted = [...lowStock]
    .sort(
      (a, b) =>
        fillRatio(a.totalStock, a.reorderPoint) -
        fillRatio(b.totalStock, b.reorderPoint),
    )
    .slice(0, 6);
  const dangerCount = lowStock.filter(
    (i) => fillRatio(i.totalStock, i.reorderPoint) <= 0.25,
  ).length;

  // Vendor scorecard — rank by PO volume (suppliers don't carry a
  // rating column; PO count is the available signal).
  const poCountByVendor = new Map<string, number>();
  for (const o of orders) {
    if (o.supplierName) {
      poCountByVendor.set(
        o.supplierName,
        (poCountByVendor.get(o.supplierName) ?? 0) + 1,
      );
    }
  }
  const topVendors = [...suppliers]
    .map((s) => ({ ...s, poCount: poCountByVendor.get(s.name) ?? 0 }))
    .sort((a, b) => b.poCount - a.poCount)
    .slice(0, 6);

  const openOrdersShown = [...openOrders]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Workspace</Link> / <span>Inventory &amp; procurement</span>
          </div>
          <h1>
            Inventory{" "}
            <em className="text-terra italic">
              · {lowStock.length} low-stock alert{lowStock.length === 1 ? "" : "s"}
            </em>
          </h1>
          <p className="page-header-meta">
            <span>
              {items.length} SKU{items.length === 1 ? "" : "s"}
            </span>
            <span>
              {openOrders.length} open PO{openOrders.length === 1 ? "" : "s"}
            </span>
            <span>{spendLabel} spend MTD</span>
            <span>{suppliers.length} vendors</span>
          </p>
        </div>
        <div className="actions">
          <MovementAddButton items={movementItemOpts} locations={locationOpts} />
          <InventoryItemAddButton categories={categoryOpts} suppliers={supplierOpts} />
          <PurchaseOrderAddButton
            suppliers={supplierOpts}
            projects={projectOpts}
            villas={villaOpts}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="SKUs" value={String(items.length)} sub={`${locations.length} rooms`} />
        <Kpi
          label="Low stock"
          value={String(lowStock.length)}
          sub={dangerCount > 0 ? `${dangerCount} reorder` : "all stocked"}
          tone={lowStock.length > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Open POs"
          value={String(openOrders.length)}
          sub={overdueOrders.length > 0 ? `${overdueOrders.length} overdue` : "on schedule"}
        />
        <Kpi label="Spend MTD" value={spendLabel} sub="purchase orders" tone="accent" />
        <Kpi
          label="Vendors"
          value={String(suppliers.length)}
          sub={`${orders.length} POs all-time`}
        />
      </div>

      <DbStatusNotice />
      <div className="mt-[18px] mb-6">
        <LastRunBadge label="Last automatic low-stock scan" run={lastScanRun} />
      </div>

      {/* 3-column scan — low stock · open POs · top vendors */}
      <div className="card overflow-hidden grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr]">
        {/* Low stock */}
        <section className="px-[26px] py-[22px] border-b lg:border-b-0 lg:border-r border-line-soft">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="display text-[20px] font-normal">
              Low stock <em className="text-terra italic">· {lowStock.length}</em>
            </h2>
            <Link
              href="/dashboard/inventory/items"
              className="ml-auto mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink"
            >
              All items →
            </Link>
          </div>
          {lowSorted.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Everything is above its reorder point.</p>
          ) : (
            <ul className="flex flex-col gap-[7px]">
              {lowSorted.map((i) => {
                const ratio = fillRatio(i.totalStock, i.reorderPoint);
                const sev = ratio <= 0.25 ? "danger" : "warn";
                return (
                  <li
                    key={i.id}
                    className={
                      "grid grid-cols-[1fr_auto_64px] items-center gap-2.5 rounded-[10px] border border-line bg-paper px-[13px] py-[11px] border-l-[3px] " +
                      (sev === "danger"
                        ? "border-l-danger bg-danger-weak/40"
                        : "border-l-warning")
                    }
                  >
                    <Link
                      href={`/dashboard/inventory/items/${i.id}`}
                      className="min-w-0 hover:text-terra"
                    >
                      <span className="block text-[12.5px] font-medium text-ink truncate">
                        {i.name}
                      </span>
                      <span className="block mono text-[10px] text-ink-4 mt-px truncate">
                        {i.sku ?? "—"}
                        {i.categoryName ? ` · ${i.categoryName}` : ""}
                      </span>
                    </Link>
                    <span className="h-[5px] w-[60px] overflow-hidden rounded-[3px] bg-cream-deep">
                      <span
                        className={
                          "block h-full " +
                          (sev === "danger" ? "bg-danger" : "bg-warning")
                        }
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </span>
                    <span className="mono text-[11px] text-ink text-right tabular-nums">
                      {i.totalStock}/{i.reorderPoint ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Open POs */}
        <section className="px-[26px] py-[22px] border-b lg:border-b-0 lg:border-r border-line-soft">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="display text-[20px] font-normal">
              Open POs <em className="text-terra italic">· {openOrdersShown.length} shown</em>
            </h2>
            <Link
              href="/dashboard/procurement/orders"
              className="ml-auto mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink"
            >
              All POs →
            </Link>
          </div>
          {openOrdersShown.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No open purchase orders.</p>
          ) : (
            <ul className="flex flex-col gap-[7px]">
              {openOrdersShown.map((o) => {
                const overdue = overdueOrders.some((x) => x.id === o.id);
                return (
                  <li
                    key={o.id}
                    className={
                      "rounded-[10px] border border-line bg-paper px-[13px] py-[11px] " +
                      (overdue ? "border-l-[3px] border-l-danger bg-danger-weak/40" : "")
                    }
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <Link
                        href={`/dashboard/procurement/orders/${o.id}`}
                        className="mono text-[11px] text-ink-3 hover:text-terra"
                      >
                        {o.poCode}
                      </Link>
                      <span
                        className={
                          "ml-auto mono text-[9px] uppercase tracking-[0.06em] rounded-[3px] px-1.5 py-0.5 " +
                          (overdue
                            ? "text-danger bg-danger-weak"
                            : o.status === "received"
                            ? "text-ok bg-[color-mix(in_oklab,var(--ok)_14%,transparent)]"
                            : "text-terra bg-[color-mix(in_oklab,var(--terra)_14%,transparent)]")
                        }
                      >
                        {overdue ? "overdue" : o.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-[12.5px] font-medium text-ink">
                      {o.supplierName ?? "—"}
                    </div>
                    <div className="mono text-[10.5px] text-ink-3 mt-[3px]">
                      {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                      {o.totalMinor !== null && o.currency ? (
                        <>
                          {" · "}
                          <strong className="text-ink-2">
                            {money(Number(o.totalMinor), o.currency)}
                          </strong>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Top vendors */}
        <section className="px-[26px] py-[22px]">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="display text-[20px] font-normal">
              Top vendors <em className="text-terra italic">· {topVendors.length}</em>
            </h2>
            <Link
              href="/dashboard/inventory/suppliers"
              className="ml-auto mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink"
            >
              All →
            </Link>
          </div>
          {topVendors.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No vendors on file yet.</p>
          ) : (
            <ul className="flex flex-col gap-[7px]">
              {topVendors.map((v) => (
                <li
                  key={v.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-[10px] border border-line bg-paper px-[13px] py-2.5"
                >
                  <div className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-ink truncate">
                      {v.name}
                    </span>
                    <span className="block mono text-[10px] text-ink-4 mt-px truncate">
                      {v.supplierType} · {v.poCount} PO{v.poCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="mono text-[11px] text-ink-3 capitalize">{v.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent movements */}
      <div className="flex items-end justify-between mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="movements">
          Recent movements
        </h2>
        <Link
          href="/dashboard/inventory/movements"
          className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink"
        >
          All movements →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Type</th>
              <th scope="col">Item</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col" className="num">Qty</th>
              <th scope="col">Reference</th>
            </tr>
          </thead>
          <tbody>
            {recentMovements.length === 0 ? (
              <TableEmpty colSpan={7}>No inventory movements yet.</TableEmpty>
            ) : (
              recentMovements.map((mv) => (
                <tr key={mv.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(mv.createdAt)}
                  </td>
                  <td>
                    <Badge tone={MV_TONE[mv.movementType] ?? "neutral"}>
                      {mv.movementType}
                    </Badge>
                  </td>
                  <td>{mv.itemName}</td>
                  <td className="text-[12px] text-ink-3">{mv.fromLocationName ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{mv.toLocationName ?? "—"}</td>
                  <td className="num">{mv.quantity}</td>
                  <td className="mono text-[11px] text-ink-3">{mv.movementCode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
