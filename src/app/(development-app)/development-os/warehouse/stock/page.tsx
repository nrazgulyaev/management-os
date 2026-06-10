import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { getWarehouseStockList } from "@/lib/development/server/warehouse/warehouse-inbound-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { StockCountPanel } from "@/components/development/warehouse/stock-count-panel";

export const metadata: Metadata = { title: "Stock · Warehouse" };
export const dynamic = "force-dynamic";

const HEALTH_TONE = {
  ok: "success",
  warn: "warning",
  danger: "danger",
} as const;

const HEALTH_LABEL = {
  ok: "in stock",
  warn: "low",
  danger: "out",
} as const;

export default async function WarehouseStockPage() {
  await requireInternalUser();

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Warehouse", href: "/development-os/warehouse" },
            { label: "Stock" },
          ]}
          title="Stock"
        />
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

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Warehouse", href: "/development-os/warehouse" },
          { label: "Stock" },
        ]}
        eyebrow={`${data.totalSkuCount} SKU${data.totalSkuCount === 1 ? "" : "s"} tracked`}
        title="Stock"
        description="Full SKU stock list aggregated across warehouse locations. Run a cycle count to reconcile the system against a physical count — each adjustment posts an audited inventory movement."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/warehouse">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Warehouse
            </Link>
          </Button>
        }
      />

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

      <Section
        eyebrow="Reconcile"
        title="Cycle count"
        description="Pick a SKU, enter the physical count, submit. The variance posts as an inventory movement and re-syncs on-hand."
      >
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
      </Section>

      <Section
        eyebrow="Catalog"
        title="SKU stock list"
        description="On-hand, reserved, and available per SKU. Health classifies each against its reorder point."
      >
        {data.rows.length === 0 ? (
          <EmptyState
            variant="first-run"
            title="No stock yet"
            body="Receive a purchase order or add SKUs to the catalog to populate stock."
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
                  {data.rows.map((r) => (
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
                        <Badge tone={HEALTH_TONE[r.health]}>
                          {HEALTH_LABEL[r.health]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )}
      </Section>
    </DevelopmentShell>
  );
}
