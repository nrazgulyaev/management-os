"use client";

/**
 * Wire-up — record-material-consumption island. Posts to
 * recordMaterialConsumptionAction (the "use server" adapter), which calls the
 * org-scoped + atomic recordMaterialConsumption action. The action inserts a
 * consumption log and bumps material_po_lines.quantity_consumed in one tx, so
 * the PO utilization reconciles. Without this surface consumption could never
 * be recorded from the UI, breaking the site -> material-usage -> finance
 * bridge.
 *
 * Per-zone capture: the operator selects a zone, a PO line, and a quantity.
 * Each line shows its live ordered / delivered / consumed utilization so the
 * operator can see the delivered-but-unconsumed headroom (the action rejects
 * consuming more than has been delivered).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { recordMaterialConsumptionAction } from "../_actions";

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm";

export interface ConsumptionZoneOption {
  id: string;
  zoneCode: string;
  zoneName: string;
}

export interface ConsumptionPoLineOption {
  id: string;
  poCode: string;
  lineNumber: number;
  materialName: string;
  unitOfMeasure: string;
  quantityOrdered: number;
  quantityDelivered: number;
  quantityConsumed: number;
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

export function RecordMaterialConsumptionForm({
  reportId,
  zones,
  poLines,
}: {
  reportId: string;
  zones: ConsumptionZoneOption[];
  poLines: ConsumptionPoLineOption[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [zoneId, setZoneId] = React.useState("");
  const [poLineId, setPoLineId] = React.useState("");
  const [qty, setQty] = React.useState("");

  const selectedLine = poLines.find((l) => l.id === poLineId) ?? null;
  const remaining = selectedLine
    ? selectedLine.quantityDelivered - selectedLine.quantityConsumed
    : null;

  if (zones.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        Define at least one zone for this project before recording material
        consumption.
      </p>
    );
  }

  if (poLines.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No purchase-order lines exist for this project yet. Create a material PO
        (with delivered quantity) before recording consumption.
      </p>
    );
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    const quantity = Number(qty);
    if (!zoneId) {
      setErr("Pick a zone.");
      return;
    }
    if (!poLineId) {
      setErr("Pick a PO line.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErr("Quantity must be a positive number.");
      return;
    }
    start(async () => {
      const r = await recordMaterialConsumptionAction({
        reportId,
        zoneId,
        poLineId,
        quantityConsumed: quantity,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed to record consumption.");
        return;
      }
      setOk(true);
      setQty("");
      setPoLineId("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end max-w-4xl"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Zone
        </span>
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className={inputCls}
        >
          <option value="">Select zone…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.zoneCode} — {z.zoneName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          PO line
        </span>
        <select
          value={poLineId}
          onChange={(e) => {
            setPoLineId(e.target.value);
            setOk(false);
          }}
          className={inputCls}
        >
          <option value="">Select material…</option>
          {poLines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.poCode} · L{l.lineNumber} · {l.materialName} (
              {fmtQty(l.quantityDelivered - l.quantityConsumed)} {l.unitOfMeasure}{" "}
              left)
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Quantity{selectedLine ? ` (${selectedLine.unitOfMeasure})` : ""}
        </span>
        <input
          type="number"
          step="any"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={inputCls}
          placeholder="0"
        />
      </label>

      {selectedLine && (
        <div className="md:col-span-4 text-xs text-ink-secondary">
          <span className="font-medium">{selectedLine.materialName}</span>{" "}
          utilization: {fmtQty(selectedLine.quantityConsumed)} consumed /{" "}
          {fmtQty(selectedLine.quantityDelivered)} delivered /{" "}
          {fmtQty(selectedLine.quantityOrdered)} ordered{" "}
          {selectedLine.unitOfMeasure}
          {remaining != null && (
            <span>
              {" "}
              · <strong>{fmtQty(remaining)}</strong> delivered-but-unconsumed
              available
            </span>
          )}
        </div>
      )}

      {err && (
        <div className="md:col-span-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}
      {ok && !err && (
        <div className="md:col-span-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Consumption recorded.
        </div>
      )}

      <div className="md:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-accent disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record consumption"}
        </button>
      </div>
    </form>
  );
}
