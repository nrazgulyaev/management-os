import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { StockTable } from "@/components/inventory/stock-table";
import { MovementTable } from "@/components/inventory/movement-table";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  getInventoryItemById,
  listInventoryMovements,
  listStockLevels,
} from "@/features/inventory/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Inventory item" };
export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getInventoryItemById(id);
  if (!item) notFound();
  const [stock, movements] = await Promise.all([
    listStockLevels({ itemId: id }),
    listInventoryMovements({ itemId: id, limit: 50 }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Items", href: "/dashboard/inventory/items" },
          { label: item.sku ?? item.name },
        ]}
        title={item.name}
        description={`${item.itemType.replace(/_/g, " ")}${item.brand ? ` · ${item.brand}` : ""}`}
      />
      <DbStatusNotice />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="SKU" value={<span className="font-mono">{item.sku ?? "—"}</span>} />
        <Stat label="Unit" value={item.unit} />
        <Stat
          label="Reorder"
          value={item.reorderPoint !== null ? `${item.reorderPoint} ${item.unit}` : "—"}
        />
        <Stat
          label="Default supplier"
          value={item.defaultSupplierName ?? <span className="text-ink-tertiary">—</span>}
        />
        <Stat
          label="Total stock"
          value={
            <span className="font-mono tabular-nums">
              {item.totalStock} {item.unit}
            </span>
          }
        />
        <Stat
          label="Unit cost"
          value={
            item.unitCostMinor !== null && item.currency
              ? formatMoneyMinor(item.unitCostMinor, item.currency)
              : "—"
          }
        />
        <Stat
          label="Owner chargeable"
          value={item.ownerChargeable ? "Yes" : "No"}
        />
        <Stat
          label="Status"
          value={<Badge tone="outline">{item.status}</Badge>}
        />
      </div>

      <Section eyebrow="Stock" title="Per-location stock">
        <StockTable rows={stock} />
      </Section>

      <Section eyebrow="History" title="Recent movements">
        <MovementTable rows={movements} />
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
