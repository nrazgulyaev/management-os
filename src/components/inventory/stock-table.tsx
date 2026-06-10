import { HandoffBadge } from "@/components/dashboard/primitives";
import { TableEmpty } from "@/components/ui/table-empty";
import type { StockLevelRow } from "@/features/inventory/services";

/** Bar fill ratio (0–1) against par/reorder point. No par = full. */
function fillRatio(stock: number, reorder: number | null): number {
  if (!reorder || reorder <= 0) return 1;
  return Math.max(0, Math.min(1, stock / reorder));
}

export function StockTable({ rows }: { rows: StockLevelRow[] }) {
  return (
    <div className="card p-0 overflow-hidden">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Location</th>
            <th scope="col" className="num">Par</th>
            <th scope="col" className="num">Stock</th>
            <th scope="col" className="num">Reserved</th>
            <th scope="col" className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={6}>
              No stock at any location yet. Receive inventory to populate.
            </TableEmpty>
          ) : (
            rows.map((r, i) => {
              const isOut = r.quantity <= 0;
              const isLow =
                r.reorderPoint !== null && r.quantity <= r.reorderPoint;
              const sev = isOut ? "danger" : isLow ? "warn" : null;
              const ratio = fillRatio(r.quantity, r.reorderPoint);
              return (
                <tr
                  key={`${r.itemId}-${r.locationId}-${i}`}
                  className={
                    sev === "danger"
                      ? "border-l-[3px] border-l-danger"
                      : sev === "warn"
                        ? "border-l-[3px] border-l-warning"
                        : ""
                  }
                >
                  <td>
                    <span className="block text-[13px] font-medium text-ink">
                      {r.itemName}
                    </span>
                    <span className="block mono text-[10px] text-ink-4 mt-px">
                      {r.itemSku ?? "—"}
                    </span>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {r.locationName}
                    {r.villaCode && (
                      <span className="mono text-[10px] text-ink-4 ml-2">
                        {r.villaCode}
                      </span>
                    )}
                  </td>
                  <td className="num text-ink-3">
                    {r.reorderPoint ?? "—"}
                  </td>
                  <td className="num">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="h-[5px] w-[44px] overflow-hidden rounded-[3px] bg-cream-deep">
                        <span
                          className={
                            "block h-full " +
                            (sev === "danger"
                              ? "bg-danger"
                              : sev === "warn"
                                ? "bg-warning"
                                : "bg-ok")
                          }
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </span>
                      <span
                        className={
                          "tabular-nums " +
                          (sev === "danger"
                            ? "text-danger font-medium"
                            : sev === "warn"
                              ? "text-warning font-medium"
                              : "text-ink")
                        }
                      >
                        {r.quantity.toLocaleString()}
                      </span>
                      <span className="mono text-[10px] text-ink-4">{r.itemUnit}</span>
                    </span>
                  </td>
                  <td className="num text-ink-3">
                    {r.reservedQuantity.toLocaleString()}
                  </td>
                  <td className="num">
                    <HandoffBadge tone={isOut ? "danger" : isLow ? "warn" : "ok"}>
                      {isOut ? "Out" : isLow ? "Low" : "OK"}
                    </HandoffBadge>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
