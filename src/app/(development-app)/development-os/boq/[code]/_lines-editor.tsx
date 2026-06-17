"use client";

/**
 * MISSING_CRUD + DEAD_END fix — inline BOQ-line CRUD + "Add section" on the
 * BOQ document detail page.
 *
 * The detail page previously rendered a read-only estimate table with the
 * only mutation path being CSV import. This island mounts:
 *   - an "Add section" control (addBoqSection) so a freshly created draft
 *     BOQ can be bootstrapped without a CSV at all;
 *   - per-section "+ Add line" inline rows (addBoqLineInline, resolving the
 *     section by its code within this document);
 *   - per-row inline edit (editBoqLine) and delete (deleteBoqLine, confirm).
 *
 * Mirrors the QsBoqLinesEditor pattern from the QS cabinet
 * (../../cabinets/qs/_boq-lines-client.tsx): same handoff `.btn` / `.boq-est`
 * styling, ConfirmModal for destructive deletes, and router.refresh() after
 * every write so the KPI strip + section subtotals re-read from the server.
 *
 * All three line actions + addBoqSection are org-scoped + audit-logged in
 * the server layer; this island never passes an organizationId.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/modal";
import {
  addBoqSection,
  addBoqLineInline,
  editBoqLine,
  deleteBoqLine,
} from "@/lib/development/server/boq/boq-actions";

export interface EditorItem {
  id: string;
  sectionId: string;
  itemCode: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  /** Unit rate in MINOR units. */
  unitRateMinor: number;
  /** Line amount in MINOR units (generated). */
  totalMinor: number;
  /** Posted actual cost in MINOR units, when present. */
  actualMinor: number | null;
}

export interface EditorSection {
  id: string;
  sectionCode: string;
  sectionName: string;
  subtotalMinor: number | null;
  items: EditorItem[];
}

const inputCls =
  "w-full rounded-md border border-line bg-panel px-2 h-8 text-[12px] text-ink";

function minorMultiplier(currency: string): number {
  return currency.toUpperCase() === "USDT" ? 1_000_000 : 100;
}

/** MINOR → MAJOR string for editing (no float math on the wire; display only). */
function minorToMajorStr(minor: number, currency: string): string {
  const div = minorMultiplier(currency);
  const major = minor / div;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

function fmtMajor(minor: number, currency: string): string {
  return (minor / minorMultiplier(currency)).toLocaleString("en-US");
}

export function BoqLinesEditor({
  boqDocumentId,
  currency,
  sections,
}: {
  boqDocumentId: string;
  currency: string;
  sections: EditorSection[];
}) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = React.useState<EditorItem | null>(
    null,
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [addingSection, setAddingSection] = React.useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError(null);
    setBusyId(deleteTarget.id);
    try {
      await deleteBoqLine({ boqItemId: deleteTarget.id });
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
      <div className="flex items-center gap-2">
        <h2 className="display text-[18px] font-medium m-0">Estimate lines</h2>
        <button
          type="button"
          className="btn btn-amber btn-sm ml-auto"
          onClick={() => {
            setError(null);
            setAddingSection(true);
          }}
          disabled={addingSection}
        >
          + Add section
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger m-0">
          {error}
        </p>
      )}

      {addingSection && (
        <AddSectionForm
          boqDocumentId={boqDocumentId}
          nextOrder={sections.length}
          onCancel={() => setAddingSection(false)}
          onSaved={() => {
            setAddingSection(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      {sections.length === 0 && !addingSection ? (
        <div className="card px-5 py-[18px]">
          <p className="text-xs text-ink-tertiary">
            No sections yet. Use &quot;+ Add section&quot; to start a section,
            then add estimate lines — or &quot;Import CSV&quot; to bulk-load.
          </p>
        </div>
      ) : (
        sections.map((s) => (
          <SectionBlock
            key={s.id}
            boqDocumentId={boqDocumentId}
            currency={currency}
            section={s}
            busyId={busyId}
            onRequestDelete={setDeleteTarget}
            onError={setError}
            onMutated={() => router.refresh()}
          />
        ))
      )}

      <ConfirmModal
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete estimate line?"
        body={
          deleteTarget
            ? `${deleteTarget.itemCode} — ${deleteTarget.description}. Section + document totals recompute. This is audit-logged.`
            : undefined
        }
        confirmLabel="Delete line"
        intent="destructive"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function SectionBlock({
  boqDocumentId,
  currency,
  section,
  busyId,
  onRequestDelete,
  onError,
  onMutated,
}: {
  boqDocumentId: string;
  currency: string;
  section: EditorSection;
  busyId: string | null;
  onRequestDelete: (it: EditorItem) => void;
  onError: (msg: string | null) => void;
  onMutated: () => void;
}) {
  const [addingLine, setAddingLine] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  return (
    <section>
      <div className="boq-cat-head">
        <span>
          <span className="mono text-ink-tertiary text-xs mr-2">
            {section.sectionCode}
          </span>
          {section.sectionName}
        </span>
        <span className="sum">
          {section.subtotalMinor != null
            ? `${fmtMajor(section.subtotalMinor, currency)} ${currency}`
            : "—"}
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="boq-est">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Unit</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
                <th className="num">Actual</th>
                <th className="num">Var.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {section.items.length === 0 && !addingLine && (
                <tr>
                  <td colSpan={9} className="text-xs text-ink-tertiary py-3">
                    No items in this section.
                  </td>
                </tr>
              )}
              {section.items.map((it) =>
                editingId === it.id ? (
                  <LineFormRow
                    key={it.id}
                    mode="edit"
                    currency={currency}
                    boqItemId={it.id}
                    initial={it}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      onMutated();
                    }}
                    onError={onError}
                  />
                ) : (
                  <tr key={it.id}>
                    <td className="code">{it.itemCode}</td>
                    <td className="desc">{it.description}</td>
                    <td className="unit">{it.unitOfMeasure}</td>
                    <td className="num">{it.quantity.toFixed(2)}</td>
                    <td className="num">
                      {minorToMajorStr(
                        it.unitRateMinor,
                        currency,
                      ).toLocaleString()}
                    </td>
                    <td className="num amount">
                      {fmtMajor(it.totalMinor, currency)}
                    </td>
                    <td className="num">
                      {it.actualMinor != null
                        ? fmtMajor(it.actualMinor, currency)
                        : "—"}
                    </td>
                    <td
                      className={
                        "num boq-var " +
                        (it.actualMinor == null
                          ? "flat"
                          : it.actualMinor - it.totalMinor > 0
                            ? "pos"
                            : it.actualMinor - it.totalMinor < 0
                              ? "neg"
                              : "flat")
                      }
                    >
                      {it.actualMinor == null
                        ? "—"
                        : `${it.actualMinor - it.totalMinor > 0 ? "+" : ""}${fmtMajor(
                            it.actualMinor - it.totalMinor,
                            currency,
                          )}`}
                    </td>
                    <td className="num">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingId(it.id)}
                          disabled={busyId === it.id}
                          title="Edit this estimate line"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onRequestDelete(it)}
                          disabled={busyId === it.id}
                          title="Delete this estimate line"
                        >
                          {busyId === it.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {addingLine && (
                <LineFormRow
                  mode="add"
                  currency={currency}
                  boqDocumentId={boqDocumentId}
                  sectionCode={section.sectionCode}
                  onCancel={() => setAddingLine(false)}
                  onSaved={() => {
                    setAddingLine(false);
                    onMutated();
                  }}
                  onError={onError}
                />
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-line">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              onError(null);
              setAddingLine(true);
            }}
            disabled={addingLine}
          >
            + Add line
          </button>
        </div>
      </div>
    </section>
  );
}

type LineFormProps =
  | {
      mode: "add";
      currency: string;
      boqDocumentId: string;
      sectionCode: string;
      onCancel: () => void;
      onSaved: () => void;
      onError: (msg: string | null) => void;
    }
  | {
      mode: "edit";
      currency: string;
      boqItemId: string;
      initial: EditorItem;
      onCancel: () => void;
      onSaved: () => void;
      onError: (msg: string | null) => void;
    };

function LineFormRow(props: LineFormProps) {
  const { mode, currency, onCancel, onSaved, onError } = props;
  const initial = mode === "edit" ? props.initial : null;
  const [itemCode, setItemCode] = React.useState(initial?.itemCode ?? "");
  const [description, setDescription] = React.useState(
    initial?.description ?? "",
  );
  const [quantity, setQuantity] = React.useState(
    initial ? String(initial.quantity) : "",
  );
  const [unit, setUnit] = React.useState(initial?.unitOfMeasure ?? "");
  const [rate, setRate] = React.useState(
    initial ? minorToMajorStr(initial.unitRateMinor, currency) : "",
  );
  const [busy, setBusy] = React.useState(false);

  async function save() {
    onError(null);
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
      if (mode === "add") {
        await addBoqLineInline({
          boqDocumentId: props.boqDocumentId,
          sectionCode: props.sectionCode,
          itemCode: itemCode.trim(),
          description: description.trim(),
          quantity,
          unitOfMeasure: unit.trim(),
          unitRateMajor: rate,
        });
      } else {
        await editBoqLine({
          boqItemId: props.boqItemId,
          itemCode: itemCode.trim(),
          description: description.trim(),
          quantity,
          unitOfMeasure: unit.trim(),
          unitRateMajor: rate,
        });
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <tr className="bg-[color-mix(in_srgb,var(--amber,#ff6b35)_6%,transparent)]">
      <td>
        <input
          className={inputCls}
          value={itemCode}
          onChange={(e) => setItemCode(e.target.value)}
          placeholder="Code"
          aria-label="Item code"
        />
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
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          inputMode="decimal"
          aria-label="Quantity"
        />
      </td>
      <td>
        <input
          className={`${inputCls} text-right`}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={`Rate (${currency})`}
          inputMode="decimal"
          aria-label="Unit rate (major units)"
        />
      </td>
      <td className="num text-ink-3 text-[11px]">auto</td>
      <td className="num text-ink-3 text-[11px]">—</td>
      <td className="num text-ink-3 text-[11px]">—</td>
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

function AddSectionForm({
  boqDocumentId,
  nextOrder,
  onCancel,
  onSaved,
  onError,
}: {
  boqDocumentId: string;
  nextOrder: number;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [sectionCode, setSectionCode] = React.useState("");
  const [sectionName, setSectionName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    onError(null);
    if (!sectionCode.trim() || !sectionName.trim()) {
      onError("Section code and name are required.");
      return;
    }
    setBusy(true);
    try {
      await addBoqSection({
        boqDocumentId,
        sectionCode: sectionCode.trim(),
        sectionName: sectionName.trim(),
        displayOrder: nextOrder,
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Add section failed");
      setBusy(false);
    }
  }

  return (
    <div className="card px-5 py-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-tertiary">Section code</span>
        <input
          className={`${inputCls} w-32`}
          value={sectionCode}
          onChange={(e) => setSectionCode(e.target.value)}
          placeholder="A"
          aria-label="Section code"
        />
      </label>
      <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
        <span className="text-[11px] text-ink-tertiary">Section name</span>
        <input
          className={inputCls}
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          placeholder="Substructure"
          aria-label="Section name"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-amber btn-sm"
          onClick={save}
          disabled={busy}
        >
          {busy ? "…" : "Save section"}
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
    </div>
  );
}
