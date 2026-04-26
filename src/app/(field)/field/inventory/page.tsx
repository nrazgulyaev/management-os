import { PageHeader } from "@/components/ui/page-header";
import { ItemCard } from "@/components/inventory/item-card";
import { listInventoryItems } from "@/features/inventory/services";

export const metadata = { title: "Inventory — Field" };
export const dynamic = "force-dynamic";

export default async function FieldInventoryPage() {
  const items = await listInventoryItems({ status: "active" });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        breadcrumbs={[{ label: "Field", href: "/field" }, { label: "Inventory" }]}
        title="Inventory"
        description="Active items and live stock — usage is logged from the task screen."
      />
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No items in catalog yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} href={`/dashboard/inventory/items/${i.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
