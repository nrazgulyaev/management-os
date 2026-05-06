import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadWarehouseCabinet } from "@/lib/development/server/cabinets/warehouse-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Warehouse manager · Cabinet" };
export const dynamic = "force-dynamic";

export default async function WarehouseCabinetPage() {
  const data = await safeQuery(
    "warehouseCabinet",
    loadWarehouseCabinet(),
    {
      totalSkuCount: 0,
      lowStockItemsCount: 0,
      zeroStockItemsCount: 0,
      todayMovementsCount: 0,
      qaqcLinkedToMaterialsCount: 0,
    },
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Warehouse manager"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "Warehouse manager" },
        ]}
        description="Stock + movements + quality alerts."
      />
      <Section title="Stock status">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total SKUs" value={String(data.totalSkuCount)} />
          <MetricCard label="Low stock" value={String(data.lowStockItemsCount)} />
          <MetricCard label="Zero stock" value={String(data.zeroStockItemsCount)} />
          <MetricCard
            label="QA/QC on materials"
            value={String(data.qaqcLinkedToMaterialsCount)}
          />
        </div>
      </Section>
      <Section title="Today's movements">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            label="Total today"
            value={String(data.todayMovementsCount)}
          />
        </div>
      </Section>
    </DevelopmentShell>
  );
}
