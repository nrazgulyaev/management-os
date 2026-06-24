import Link from "next/link";
import { ItemCard } from "@/components/inventory/item-card";
import { listInventoryItems } from "@/features/inventory/services";

export const metadata = { title: "Inventory — Field" };
export const dynamic = "force-dynamic";

export default async function FieldInventoryPage() {
  const items = await listInventoryItems({ status: "active" });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-tertiary">
          <Link href="/field" className="hover:text-ink">
            Field
          </Link>{" "}
          / Inventory
        </div>
        <h1 className="text-display text-[28px] leading-tight font-medium text-ink mt-2">
          Inventory
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Active items and live stock — usage is logged from the task screen.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No items in catalog yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Non-navigable in the field PWA: item detail lives in the
              desktop /dashboard and would bounce a worker out of the app.
              Stock usage is logged from the task screen, not here. */}
          {items.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </div>
  );
}
