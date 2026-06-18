import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StockStatusPill } from "./stock-status-pill";
import type { InventoryItemRow } from "@/features/inventory/services";

export function ItemCard({
  item,
  href,
}: {
  item: InventoryItemRow;
  /**
   * Omit `href` to render a non-navigable card (e.g. the field PWA, where
   * a worker should NOT be bounced out into the desktop /dashboard view).
   */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-ink-tertiary">
            {item.sku ?? item.id.slice(0, 8)}
          </span>
          <Badge tone="outline">{item.itemType.replace(/_/g, " ")}</Badge>
          {item.categoryName && (
            <span className="text-[11px] text-ink-tertiary">{item.categoryName}</span>
          )}
        </div>
        <div className="text-sm text-ink font-medium mt-2">{item.name}</div>
        <div className="text-xs text-ink-secondary mt-0.5">
          {item.brand ? `${item.brand} · ` : ""}
          {item.defaultSupplierName ?? "No default supplier"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <StockStatusPill
          quantity={item.totalStock}
          reorderPoint={item.reorderPoint}
          unit={item.unit}
        />
        {href && (
          <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" strokeWidth={1.75} />
        )}
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3 hover:border-line-strong transition-colors"
    >
      {body}
    </Link>
  );
}
