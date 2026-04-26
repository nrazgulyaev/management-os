import { Badge } from "@/components/ui/badge";

export function StockStatusPill({
  quantity,
  reorderPoint,
  unit = "pcs",
}: {
  quantity: number;
  reorderPoint: number | null;
  unit?: string;
}) {
  const isLow = reorderPoint !== null && quantity <= reorderPoint;
  const isOut = quantity <= 0;
  const tone = isOut ? "danger" : isLow ? "warning" : "success";
  const label = isOut ? "Out" : isLow ? "Low" : "OK";
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={tone}>{label}</Badge>
      <span className="font-mono tabular-nums text-xs text-ink-secondary">
        {quantity.toLocaleString()} {unit}
      </span>
    </span>
  );
}
