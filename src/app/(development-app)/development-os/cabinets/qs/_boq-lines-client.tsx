"use client";

/**
 * P1 — QS-desk inline BOQ-line CRUD.
 *
 * Renders the top-N BOQ lines table with two new affordances:
 *   - "New estimate line" inline add row (pick revision → section →
 *     code/desc/qty/unit/rate → addBoqLineInline()).
 *   - per-row delete (deleteBoqLine() with a confirm).
 *
 * Both server actions are org-scoped + audit-logged. After a successful
 * write we router.refresh() so the rollup strip + totals re-read.
 * Styling stays on the handoff `.btn` / `.data` system to match the
 * surrounding cabinet.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/modal";
import {
  addBoqLineInline,
  deleteBoqLine,
} from "@/lib/development/server/boq/boq-actions";

export interface QsBoqLine {
  lineId: string;
  itemCode: string;
  sectionCode: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitRateMinor: number;
  totalMinor: number;
  currency: string;
}

export interface QsRevisionForAdd {
  documentId: string;
  boqCode: string;
  versionLabel: string;
  currency: string;
  sectionCodes: string[];
}

const IDR_M = 10_000_000_000;
const IDR_K = 1_000_000;
const USD_M = 100_000_000;
const USD_K = 100_000;

function fmtMinor(minor: number, currency: string): string {
  const abs = Math.abs(minor);
  if (currency === "IDR") {
    if (abs >= IDR_M) return `IDR ${(minor / IDR_M).toFixed(1)}M`;
    if (abs >= IDR_K) return `IDR ${Math.round(minor / IDR_K)}K`;
    return `IDR ${Math.round(minor / 100).toLocaleString()}`;
  }
  if (abs >= USD_M) return `${currency} ${(minor / USD_M).toFixed(1)}M`;
  if (abs >= USD_K) return `${currency} ${Math.round(minor / USD_K)}K`;
  return `${currency} ${Math.round(minor / 100).toLocaleString()}`;
}

function fmtQuantity(q: number): string {
  return Number.isInteger(q) ? q.toLocaleString() : q.toFixed(2);
}

export function QsBoqLinesEditor({
  lines,
  revisions,
}: {
  lines: QsBoqLine[];
  revisions: QsRevisionForAdd[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<QsBoqLine | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const canAdd = revisions.some((r) => r.sectionCodes.length > 0);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError(null);
    setBusyId(deleteTarget.lineId);
    try {
      await deleteBoqLine({ boqItemId: deleteTarget.lineId });
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="px-[22px] py-3.5 border-b border-line flex items-center gap-2">
        <h2 className="display text-[18px] font-medium m-0">
          BOQ · top {lines.length === 0 ? "7" : lines.length} lines by total
        </h2>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className={
              "btn btn-amber btn-sm" +
              (canAdd ? "" : " opacity-55 cursor-not-allowed")
            }
            disabled={!canAdd || adding}
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            title={
              canAdd
                ? "Add an estimate line to a revision"
                : "Create a BOQ revision with at least one section first"
            }
          >
            + New estimate line
          </button>
          <Link href="/development-os/boq" className="btn btn-dark btn-sm">
            Filter / full BOQ
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-[22px] pt-3 text-[13px] text-danger m-0">
          {error}
        </p>
      )}

      {lines.length === 0 && !adding ? (
        <p className="p-5 text-[13px] text-ink-3 italic">
          No BOQ items yet for this org. Import a BOQ XLSX or add an estimate
          line to populate.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Rate</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {adding && (
              <NewLineRow
                revisions={revisions}
                onCancel={() => setAdding(false)}
                onSaved={() => {
                  setAdding(false);
                  router.refresh();
                }}
                onError={setError}
              />
            )}
            {lines.map((r) => (
              <tr key={r.lineId}>
                <td className="mono text-[11px] text-ink-3">
                  {r.sectionCode}.{r.itemCode}
                </td>
                <td className="text-[13px]">{r.description}</td>
                <td className="num">{fmtQuantity(r.quantity)}</td>
                <td className="mono text-[11px] text-ink-3">
                  {r.unitOfMeasure}
                </td>
                <td className="num">{fmtMinor(r.unitRateMinor, r.currency)}</td>
                <td className="num text-ink font-medium">
                  {fmtMinor(r.totalMinor, r.currency)}
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === r.lineId}
                    onClick={() => setDeleteTarget(r)}
                    title="Delete this estimate line"
                  >
                    {busyId === r.lineId ? "…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmModal
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete estimate line?"
        body={
          deleteTarget
            ? `${deleteTarget.sectionCode}.${deleteTarget.itemCode} — ${deleteTarget.description}. Section + document totals recompute. This is audit-logged.`
            : undefined
        }
        confirmLabel="Delete line"
        intent="destructive"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function NewLineRow({
  revisions,
  onCancel,
  onSaved,
  onError,
}: {
  revisions: QsRevisionForAdd[];
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const firstWithSection =
    revisions.find((r) => r.sectionCodes.length > 0) ?? revisions[0];
  const [docId, setDocId] = React.useState(firstWithSection?.documentId ?? "");
  const rev = revisions.find((r) => r.documentId === docId) ?? null;
  const [sectionCode, setSectionCode] = React.useState(
    firstWithSection?.sectionCodes[0] ?? "",
  );
  const [itemCode, setItemCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    // Reset section when the revision changes.
    setSectionCode(rev?.sectionCodes[0] ?? "");
  }, [docId, rev?.sectionCodes]);

  async function save() {
    onError(null);
    if (!docId || !sectionCode) {
      onError("Pick a revision + section.");
      return;
    }
    if (!itemCode.trim() || !description.trim() || !unit.trim()) {
      onError("Item code, description, and unit are required.");
      return;
    }
    if (!(Number(quantity) > 0)) {
      onError("Quantity must be greater than 0.");
      return;
    }
    if (!(Number(rate) >= 0)) {
      onError("Rate must be 0 or greater.");
      return;
    }
    setBusy(true);
    try {
      await addBoqLineInline({
        boqDocumentId: docId,
        sectionCode,
        itemCode: itemCode.trim(),
        description: description.trim(),
        quantity,
        unitOfMeasure: unit.trim(),
        unitRateMajor: rate,
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Add failed");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-line bg-panel px-2 h-8 text-[12px] text-ink";

  return (
    <tr className="bg-[color-mix(in_srgb,var(--amber,#ff6b35)_6%,transparent)]">
      <td>
        <div className="flex flex-col gap-1">
          <select
            className={inputCls}
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            aria-label="Revision"
          >
            {revisions.map((r) => (
              <option key={r.documentId} value={r.documentId}>
                {r.boqCode} · {r.versionLabel}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={sectionCode}
            onChange={(e) => setSectionCode(e.target.value)}
            aria-label="Section"
            disabled={!rev || rev.sectionCodes.length === 0}
          >
            {(rev?.sectionCodes ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            placeholder="Item code"
            aria-label="Item code"
          />
        </div>
      </td>
      <td>
        <input
          className={inputCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          aria-label="Description"
        />
      </td>
      <td>
        <input
          className={`${inputCls} text-right`}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          inputMode="decimal"
          aria-label="Quantity"
        />
      </td>
      <td>
        <input
          className={inputCls}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="m²"
          aria-label="Unit"
        />
      </td>
      <td>
        <input
          className={`${inputCls} text-right`}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={`Rate (${rev?.currency ?? "IDR"})`}
          inputMode="decimal"
          aria-label="Unit rate (major units)"
        />
      </td>
      <td className="num text-ink-3 text-[11px]">auto</td>
      <td className="num">
        <div className="flex gap-1 justify-end">
          <button
            type="button"
            className="btn btn-amber btn-sm"
            onClick={save}
            disabled={busy}
          >
            {busy ? "…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
