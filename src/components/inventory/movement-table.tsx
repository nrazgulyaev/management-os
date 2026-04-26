import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import type { MovementRow } from "@/features/inventory/services";

const MOVEMENT_TONE: Record<
  string,
  "success" | "warning" | "info" | "danger" | "neutral" | "accent"
> = {
  receive: "success",
  consume: "info",
  transfer: "info",
  adjust: "neutral",
  count_correction: "neutral",
  damage: "danger",
  write_off: "danger",
  return_to_supplier: "warning",
};

export function MovementTable({ rows }: { rows: MovementRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        No inventory movements yet.
      </p>
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Code</TH>
          <TH>Type</TH>
          <TH>Item</TH>
          <TH>From → To</TH>
          <TH className="text-right">Quantity</TH>
          <TH>By</TH>
          <TH>When</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((m) => (
          <TR key={m.id}>
            <TD className="font-mono text-[11px] text-ink-tertiary">{m.movementCode}</TD>
            <TD>
              <Badge tone={MOVEMENT_TONE[m.movementType] ?? "neutral"}>
                {m.movementType.replace(/_/g, " ")}
              </Badge>
            </TD>
            <TD>{m.itemName}</TD>
            <TD className="text-xs text-ink-secondary">
              {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}
            </TD>
            <TDNum>{m.quantity.toLocaleString()}</TDNum>
            <TD className="text-xs text-ink-secondary">{m.createdByName ?? "—"}</TD>
            <TD className="text-xs text-ink-tertiary tabular-nums">
              {m.createdAt.slice(0, 16).replace("T", " ")}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
