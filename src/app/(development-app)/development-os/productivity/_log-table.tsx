"use client";

/**
 * MISSING_CRUD — raw productivity-log list with per-row edit + delete.
 *
 * The /productivity page only showed per-trade aggregations; individual log
 * rows had no edit/delete affordance. editProductivityLog / deleteProductivityLog
 * are org-scoped "use server" actions (productivity_rate is a GENERATED column,
 * never written). Follows the project-cycle/_input-forms.tsx modal pattern.
 * No client-supplied organizationId is passed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  editProductivityLog,
  deleteProductivityLog,
} from "@/lib/development/server/productivity/productivity-actions";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

export interface LogRow {
  id: string;
  projectName: string;
  logDate: string;
  tradeCategory: string | null;
  activityDescription: string | null;
  plannedHours: string | null;
  actualHours: string;
  quantityCompleted: string | null;
  unitOfMeasure: string | null;
  productivityRate: string | null;
}

export function ProductivityLogTable({ rows }: { rows: LogRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No log entries yet. Use “Log entry” above to record time + output.
      </p>
    );
  }
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Date</th>
          <th>Project</th>
          <th>Trade</th>
          <th className="num">Actual hrs</th>
          <th className="num">Qty</th>
          <th>Unit</th>
          <th className="num">Rate</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-[11px] text-ink-tertiary">{r.logDate}</td>
            <td className="text-[13px]">{r.projectName}</td>
            <td className="text-[12px] capitalize">
              {r.tradeCategory ? r.tradeCategory.replace(/_/g, " ") : "—"}
            </td>
            <td className="num">{Number(r.actualHours).toFixed(1)}</td>
            <td className="num">
              {r.quantityCompleted != null
                ? Number(r.quantityCompleted).toFixed(2)
                : "—"}
            </td>
            <td className="text-ink-tertiary text-xs">{r.unitOfMeasure ?? "—"}</td>
            <td className="num">
              {r.productivityRate != null
                ? Number(r.productivityRate).toFixed(3)
                : "—"}
            </td>
            <td className="text-right">
              <RowActions row={r} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RowActions({ row }: { row: LogRow }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
      >
        <Pencil className="w-3 h-3" strokeWidth={1.75} />
        Edit
      </button>
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5"
      >
        <Trash2 className="w-3 h-3" strokeWidth={1.75} />
        Delete
      </button>
      {editOpen && <EditModal row={row} onClose={() => setEditOpen(false)} />}
      {deleteOpen && <DeleteModal row={row} onClose={() => setDeleteOpen(false)} />}
    </div>
  );
}

function EditModal({ row, onClose }: { row: LogRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    const numOrNull = (k: string) => {
      const v = str(k);
      return v === "" ? null : Number(v);
    };
    start(async () => {
      const r = await editProductivityLog({
        id: row.id,
        logDate: str("logDate"),
        tradeCategory: str("tradeCategory") || null,
        activityDescription: str("activityDescription") || null,
        plannedHours: numOrNull("plannedHours"),
        actualHours: Number(fd.get("actualHours") ?? 0),
        quantityCompleted: numOrNull("quantityCompleted"),
        unitOfMeasure: str("unitOfMeasure") || null,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-3">Edit log entry · {row.projectName}</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <L label="Log date">
              <input type="date" name="logDate" required defaultValue={row.logDate} className={inputCls} />
            </L>
            <L label="Trade / category">
              <input name="tradeCategory" defaultValue={row.tradeCategory ?? ""} className={inputCls} placeholder="masonry…" />
            </L>
            <L label="Planned hours">
              <input type="number" name="plannedHours" min={0} step="any" defaultValue={row.plannedHours ?? ""} className={inputCls} />
            </L>
            <L label="Actual hours">
              <input type="number" name="actualHours" min={0.01} step="any" required defaultValue={row.actualHours} className={inputCls} />
            </L>
            <L label="Quantity completed">
              <input type="number" name="quantityCompleted" min={0} step="any" defaultValue={row.quantityCompleted ?? ""} className={inputCls} />
            </L>
            <L label="Unit of measure">
              <input name="unitOfMeasure" defaultValue={row.unitOfMeasure ?? ""} className={inputCls} placeholder="m², pcs…" />
            </L>
            <L label="Activity description" span2>
              <input name="activityDescription" defaultValue={row.activityDescription ?? ""} className={inputCls} />
            </L>
          </div>
          {err && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={pending}
              className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
          <p className="text-[11px] text-ink-tertiary">
            Productivity rate recomputes automatically (quantity ÷ actual hours).
          </p>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ row, onClose }: { row: LogRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function confirm() {
    setErr(null);
    start(async () => {
      const r = await deleteProductivityLog({ id: row.id });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-2">Delete log entry</h2>
        <p className="text-sm text-ink-secondary mb-4">
          Delete the {row.logDate} entry for{" "}
          <span className="font-medium text-ink">{row.projectName}</span>? This
          cannot be undone.
        </p>
        {err && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending}
            className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={pending}
            className="text-sm px-3 py-1.5 rounded bg-danger text-white hover:opacity-90 disabled:opacity-50">
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function L({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
