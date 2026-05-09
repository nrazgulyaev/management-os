import type { Metadata } from "next";
import Link from "next/link";
import {
  DashboardKpi,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadWarehouseCabinet } from "@/lib/development/server/cabinets/warehouse-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.3.2 — Warehouse Manager cabinet (replatformed).
 *
 * KPI mapping:
 *   - Total SKUs            → totalSkuCount
 *   - Low stock             → lowStockItemsCount  (status warn when > 0)
 *   - Zero stock            → zeroStockItemsCount (status bad when > 0)
 *   - QA on materials       → qaqcLinkedToMaterialsCount
 *
 * Today's movements section + cross-link side panel for inventory,
 * receiving, deliveries surfaces.
 */

export const metadata: Metadata = { title: "Warehouse manager · Cabinet" };
export const dynamic = "force-dynamic";

export default async function WarehouseCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("warehouse-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("warehouseCabinet", loadWarehouseCabinet(), {
    totalSkuCount: 0,
    lowStockItemsCount: 0,
    zeroStockItemsCount: 0,
    todayMovementsCount: 0,
    qaqcLinkedToMaterialsCount: 0,
  });

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8">
        <PageHeaderHero
          firstName={firstName ?? undefined}
          eyebrow="Warehouse manager"
          title="Stock overview"
          description="Inventory levels, today's movements, and material quality alerts."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardKpi
            label="Total SKUs"
            value={String(data.totalSkuCount)}
            status="neutral"
            drillHref="/development-os/inventory"
            hint="Active items"
          />
          <DashboardKpi
            label="Low stock"
            value={String(data.lowStockItemsCount)}
            status={
              data.lowStockItemsCount === 0
                ? "good"
                : data.lowStockItemsCount > 10
                  ? "bad"
                  : "warn"
            }
            drillHref="/development-os/inventory?filter=low-stock"
            hint="At or below reorder point"
          />
          <DashboardKpi
            label="Zero stock"
            value={String(data.zeroStockItemsCount)}
            status={
              data.zeroStockItemsCount === 0
                ? "good"
                : data.zeroStockItemsCount > 5
                  ? "bad"
                  : "warn"
            }
            drillHref="/development-os/inventory?filter=zero-stock"
            hint="Out of stock right now"
          />
          <DashboardKpi
            label="QA on materials"
            value={String(data.qaqcLinkedToMaterialsCount)}
            status={
              data.qaqcLinkedToMaterialsCount === 0 ? "good" : "warn"
            }
            drillHref="/development-os/qa-qc?entity=material"
            hint="Material-linked issues"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Section eyebrow="Today" title="Movements">
              <DashboardKpi
                label="Movements today"
                value={String(data.todayMovementsCount)}
                status={data.todayMovementsCount === 0 ? "neutral" : "good"}
                drillHref="/development-os/inventory/movements"
                hint="Inflows + outflows + transfers"
              />
            </Section>
          </div>

          <aside className="flex flex-col gap-4">
            <Section eyebrow="Surfaces" title="Jump to">
              <ul className="grid grid-cols-1 gap-2">
                <CrossLink
                  href="/development-os/inventory"
                  label="Inventory & SKUs"
                />
                <CrossLink
                  href="/development-os/inventory/movements"
                  label="Movements log"
                />
                <CrossLink
                  href="/development-os/inventory/receiving"
                  label="Receiving"
                />
                <CrossLink
                  href="/development-os/qa-qc?entity=material"
                  label="Material QA/QC"
                />
                <CrossLink
                  href="/development-os/procurement/purchase-orders"
                  label="Open POs"
                />
              </ul>
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}

function CrossLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-md border border-line-soft bg-surface px-4 py-3 text-sm text-ink hover:border-line-strong transition-colors"
      >
        {label} <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
