"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { receivePurchaseOrder } from "@/lib/development/server/warehouse/warehouse-receipt-actions";

export interface ReceiveFormLine {
  id: string;
  lineNumber: number;
  materialName: string;
  unitOfMeasure: string;
  quantityOrdered: number;
  quantityDelivered: number;
  outstanding: number;
  matchedSku: string | null;
}

interface LineState {
  receivedQty: string;
  qc: "pass" | "fail";
}

/**
 * At-dock receiving form (dev-warehouse mock §03). Line-by-line received
 * qty + a QC pass/fail chain. QC-passed lines that match a Dev OS SKU
 * write a `received` stock movement on submit; everything updates the PO
 * delivered totals + status. Reuses the Button / Badge / Table primitives
 * and Layer-B tokens (no raw hex / bg-black).
 */
export function ReceivePoForm({
  poId,
  poCode,
  lines,
  locations,
  disabled,
}: {
  poId: string;
  poCode: string;
  lines: ReceiveFormLine[];
  locations: Array<{ id: string; locationCode: string; displayName: string }>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [state, setState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        { receivedQty: l.outstanding > 0 ? String(l.outstanding) : "", qc: "pass" as const },
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const anyMatchedReceiving = useMemo(
    () =>
      lines.some((l) => {
        const s = state[l.id];
        return (
          l.matchedSku != null &&
          s?.qc === "pass" &&
          Number(s?.receivedQty || "0") > 0
        );
      }),
    [lines, state],
  );

  function setLine(id: string, patch: Partial<LineState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function submit() {
    setError(null);
    setDone(null);

    const payloadLines = lines
      .map((l) => {
        const s = state[l.id];
        const qty = Number(s?.receivedQty || "0");
        return { lineId: l.id, receivedQty: qty, qcStatus: s?.qc ?? "pass" };
      })
      .filter((l) => l.receivedQty > 0);

    if (payloadLines.length === 0) {
      setError("Enter a received quantity on at least one line.");
      return;
    }
    if (anyMatchedReceiving && !locationId) {
      setError("Select a warehouse location for the received stock.");
      return;
    }
    for (const l of payloadLines) {
      if (Number.isNaN(l.receivedQty) || l.receivedQty < 0) {
        setError("Received quantities must be 0 or more.");
        return;
      }
    }

    startTransition(async () => {
      try {
        const res = await receivePurchaseOrder({
          poId,
          locationId: anyMatchedReceiving ? locationId : null,
          lines: payloadLines,
          note: note.trim() || null,
        });
        setDone(
          `Received ${poCode} — status ${res.status.replaceAll("_", " ")} · ${res.movementsWritten} stock movement${res.movementsWritten === 1 ? "" : "s"}${res.unmatchedPassed > 0 ? ` · ${res.unmatchedPassed} line(s) had no SKU match` : ""}.`,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to receive PO.");
      }
    });
  }

  if (disabled) {
    return (
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
        This purchase order is {poCode ? "" : ""}closed or cancelled — nothing
        left to receive at the dock.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Material · SKU</TH>
              <TH>Unit</TH>
              <TH>Ordered</TH>
              <TH>Delivered</TH>
              <TH>Outstanding</TH>
              <TH>Receive now</TH>
              <TH>QC</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const s = state[l.id];
              return (
                <TR key={l.id}>
                  <TD className="text-xs text-ink-tertiary">{l.lineNumber}</TD>
                  <TD className="text-sm">
                    <span className="block font-medium text-ink">
                      {l.materialName}
                    </span>
                    {l.matchedSku ? (
                      <span className="block font-mono text-xs text-success">
                        SKU {l.matchedSku} · stock
                      </span>
                    ) : (
                      <span className="block font-mono text-xs text-ink-tertiary">
                        no SKU match · delivery only
                      </span>
                    )}
                  </TD>
                  <TD className="text-xs">{l.unitOfMeasure}</TD>
                  <TDNum>{l.quantityOrdered.toFixed(2)}</TDNum>
                  <TDNum>{l.quantityDelivered.toFixed(2)}</TDNum>
                  <TDNum
                    className={l.outstanding > 0 ? "text-warning" : "text-success"}
                  >
                    {l.outstanding.toFixed(2)}
                  </TDNum>
                  <TD>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={s?.receivedQty ?? ""}
                      onChange={(e) => setLine(l.id, { receivedQty: e.target.value })}
                      className="block w-24 rounded border border-line-soft p-2 text-sm font-mono min-h-[40px]"
                      aria-label={`Received quantity for ${l.materialName}`}
                    />
                  </TD>
                  <TD>
                    <div className="inline-flex rounded-full border border-line-soft overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setLine(l.id, { qc: "pass" })}
                        aria-pressed={s?.qc === "pass"}
                        className={
                          "px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 transition-colors " +
                          (s?.qc === "pass"
                            ? "bg-success/15 text-success"
                            : "text-ink-tertiary hover:bg-muted/40")
                        }
                      >
                        <Check className="w-3 h-3" strokeWidth={2} />
                        pass
                      </button>
                      <button
                        type="button"
                        onClick={() => setLine(l.id, { qc: "fail" })}
                        aria-pressed={s?.qc === "fail"}
                        className={
                          "px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 border-l border-line-soft transition-colors " +
                          (s?.qc === "fail"
                            ? "bg-danger/15 text-danger"
                            : "text-ink-tertiary hover:bg-muted/40")
                        }
                      >
                        <X className="w-3 h-3" strokeWidth={2} />
                        hold
                      </button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">
            Warehouse location {anyMatchedReceiving ? "" : "(optional)"}
          </span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={locations.length === 0}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          >
            {locations.length === 0 ? (
              <option value="">No warehouse locations configured</option>
            ) : (
              locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.locationCode} · {loc.displayName}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Receipt note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Driver, delivery-note no, damage…"
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={pending} className="min-h-[44px]">
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Receive into stock
        </Button>
        {done && !pending && (
          <Badge tone="success">{done}</Badge>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-ink-tertiary leading-relaxed">
        QC-passed lines with a matching SKU post a <span className="font-mono">received</span>{" "}
        stock movement and credit on-hand at the chosen location. Lines marked{" "}
        <span className="font-mono">hold</span> still record what arrived (the PO
        delivered total updates) but write no stock. Receiving is audit-logged;
        payment stays in its own manual flow.
      </p>
    </div>
  );
}
