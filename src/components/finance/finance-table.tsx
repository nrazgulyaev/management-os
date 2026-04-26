import * as React from "react";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoneyMinor } from "@/lib/money";

export interface FinanceTableRow {
  id: string;
  date: string | null;
  scope: string;
  category: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  status: string;
}

export function FinanceTable({
  rows,
  scopeLabel = "Scope",
  emptyMessage = "No entries.",
}: {
  rows: FinanceTableRow[];
  scopeLabel?: string;
  emptyMessage?: string;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Date</TH>
          <TH>{scopeLabel}</TH>
          <TH>Category</TH>
          <TH>Description</TH>
          <TH>Status</TH>
          <TH className="text-right">Amount</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={6} className="text-center py-8 text-ink-tertiary">
              {emptyMessage}
            </TD>
          </TR>
        ) : (
          rows.map((r) => (
            <TR key={r.id}>
              <TD className="text-xs text-ink-tertiary tabular-nums">{r.date ?? "—"}</TD>
              <TD className="text-ink-secondary text-sm">{r.scope}</TD>
              <TD>
                <Badge tone="outline">{r.category}</Badge>
              </TD>
              <TD className="text-ink text-sm truncate max-w-md">{r.description}</TD>
              <TD>
                <Badge tone={r.status === "posted" ? "success" : "neutral"}>{r.status}</Badge>
              </TD>
              <TDNum>{formatMoneyMinor(r.amountMinor, r.currency)}</TDNum>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
