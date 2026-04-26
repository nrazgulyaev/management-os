import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { StockStatusPill } from "./stock-status-pill";
import type { StockLevelRow } from "@/features/inventory/services";

export function StockTable({ rows }: { rows: StockLevelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        No stock at any location yet. Receive inventory to populate.
      </p>
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Item</TH>
          <TH>Location</TH>
          <TH className="text-right">Quantity</TH>
          <TH className="text-right">Reserved</TH>
          <TH className="text-right">Status</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={`${r.itemId}-${r.locationId}-${i}`}>
            <TD>
              <div className="text-ink">{r.itemName}</div>
              <div className="text-[11px] text-ink-tertiary font-mono">
                {r.itemSku ?? "—"}
              </div>
            </TD>
            <TD>
              {r.locationName}
              {r.villaCode && (
                <span className="text-[11px] text-ink-tertiary ml-2">{r.villaCode}</span>
              )}
            </TD>
            <TDNum>
              {r.quantity.toLocaleString()} <span className="text-ink-tertiary">{r.itemUnit}</span>
            </TDNum>
            <TDNum>{r.reservedQuantity.toLocaleString()}</TDNum>
            <TD className="text-right">
              <StockStatusPill
                quantity={r.quantity}
                reorderPoint={r.reorderPoint}
                unit={r.itemUnit}
              />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
