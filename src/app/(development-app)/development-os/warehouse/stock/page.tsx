import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireInternalUser, AuthorizationError } from "@/features/auth/permissions";
import { AccessForbidden } from "@/components/auth/access-forbidden";
import { getWarehouseStockList } from "@/lib/development/server/warehouse/warehouse-inbound-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { StockCountPanel } from "@/components/development/warehouse/stock-count-panel";

export const metadata: Metadata = { title: "Stock · Warehouse" };
export const dynamic = "force-dynamic";

const HEALTH_TONE = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
} as const;

const HEALTH_LABEL = {
  ok: "in stock",
  warn: "low",
  danger: "out",
} as const;

export default async function WarehouseStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; health?: string }>;
}) {
  try {
    await requireInternalUser();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <DevelopmentShell>
          <AccessForbidden backHref="/development-os" backLabel="Development OS" />
        </DevelopmentShell>
      );
    }
    throw err;
  }
  const params = await searchParams;

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/warehouse">Warehouse</Link> /{" "}
              <span>Stock</span>
            </div>
            <h1>Stock</h1>
          </div>
        </div>
        <EmptyState
          variant="error"
          title="Database not configured"
          body="Set DATABASE_URL to load the SKU stock list."
        />
      </DevelopmentShell>
    );
  }

  const data = await safeQuery(
    "warehouseStockList",
    getWarehouseStockList(),
    {
      rows: [],
      totalSkuCount: 0,
      lowStockCount: 0,
      zeroStockCount: 0,
      defaultLocation: null,
    },
    6000,
  );

  // GET-form filters (mock §05 stock spec: search + low-stock filter).
  // Filtering happens here over the already-loaded full SKU list — the
  // page is a server component, no client island needed.
  const searchTerm = params.q?.trim().slice(0, 80) ?? "";
  const searchLower = searchTerm.toLowerCase();
  const healthFilter =
    params.health === "low" || params.health === "out"
      ? params.health
      : undefined;
  const filteredRows = data.rows.filter((r) => {
    if (
      searchLower &&
      !`${r.sku} ${r.displayName} ${r.category}`
        .toLowerCase()
        .includes(searchLower)
    ) {
      return false;
    }
    if (healthFilter === "low" && r.health === "ok") return false;
    if (healthFilter === "out" && r.health !== "danger") return false;
    return true;
  });
  const hasFilter = Boolean(searchLower || healthFilter);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/warehouse">Warehouse</Link> /{" "}
            <span>Stock</span>
          </div>
          <h1>Stock</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Full SKU stock list aggregated across warehouse locations. Run a
            cycle count to reconcile the system against a physical count — each
            adjustment posts an audited inventory movement.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/warehouse">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Warehouse
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="SKUs · total"
          value={data.totalSkuCount || "—"}
          sub="active catalog"
          tone={data.totalSkuCount ? "accent" : undefined}
        />
        <Kpi
          label="Low stock"
          value={data.lowStockCount || "—"}
          sub="at / under reorder"
          tone={data.lowStockCount > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Out of stock"
          value={data.zeroStockCount || "—"}
          sub="zero on-hand"
          tone={data.zeroStockCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Count target"
          value={data.defaultLocation ? "1" : "—"}
          sub={
            data.defaultLocation
              ? data.defaultLocation.locationCode
              : "no warehouse location"
          }
        />
      </div>

      <div>
        <div className="label mb-2.5">Reconcile</div>
        <StockCountPanel
          items={data.rows.map((r) => ({
            itemId: r.itemId,
            sku: r.sku,
            displayName: r.displayName,
            unitOfMeasure: r.unitOfMeasure,
            onHand: r.onHand,
          }))}
          location={data.defaultLocation}
        />
      </div>

      <div>
        <div className="label mb-2.5">Catalog</div>
        <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
          <label className="field">
            <span className="field-label">Search</span>
            <input
              type="search"
              name="q"
              defaultValue={searchTerm}
              placeholder="SKU, name, category…"
              className="input"
            />
          </label>
          <label className="field">
            <span className="field-label">Health</span>
            <select
              name="health"
              defaultValue={healthFilter ?? ""}
              className="select"
            >
              <option value="">All SKUs ({data.totalSkuCount})</option>
              <option value="low">
                Low + out ({data.lowStockCount + data.zeroStockCount})
              </option>
              <option value="out">Out of stock ({data.zeroStockCount})</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              Apply
            </button>
            {hasFilter && (
              <Link
                href="/development-os/warehouse/stock"
                className="btn btn-sm"
              >
                Clear
              </Link>
            )}
          </div>
          <span className="label ml-auto">
            {filteredRows.length} of {data.totalSkuCount} shown
          </span>
        </form>
        {data.rows.length === 0 ? (
          <EmptyState
            variant="first-run"
            title="No stock yet"
            body="Receive a purchase order or add SKUs to the catalog to populate stock."
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="No SKUs match"
            body="Adjust the search or clear the health filter to see the full catalog."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Name</TH>
                    <TH>Category</TH>
                    <TH>Unit</TH>
                    <TH>On-hand</TH>
                    <TH>Reserved</TH>
                    <TH>Available</TH>
                    <TH>Reorder</TH>
                    <TH>Health</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredRows.map((r) => (
                    <TR key={r.itemId}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/inventory/items/${encodeURIComponent(r.sku)}`}
                          className="hover:underline"
                        >
                          {r.sku}
                        </Link>
                      </TD>
                      <TD className="text-sm">{r.displayName}</TD>
                      <TD className="text-xs text-ink-tertiary">{r.category}</TD>
                      <TD className="text-xs">{r.unitOfMeasure}</TD>
                      <TDNum>{r.onHand.toFixed(2)}</TDNum>
                      <TDNum>{r.reserved.toFixed(2)}</TDNum>
                      <TDNum>{r.available.toFixed(2)}</TDNum>
                      <TDNum>
                        {r.reorderPoint != null ? r.reorderPoint.toFixed(2) : "—"}
                      </TDNum>
                      <TD>
                        <HandoffBadge tone={HEALTH_TONE[r.health]}>
                          {HEALTH_LABEL[r.health]}
                        </HandoffBadge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </DevelopmentShell>
  );
}
