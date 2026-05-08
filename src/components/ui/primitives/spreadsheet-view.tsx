/**
 * Stage 10.B — SpreadsheetView primitive.
 *
 * Excel-shaped editor: Tab moves across cells, Enter advances to the
 * next row, Shift+Tab / Shift+Enter reverse. Validation shows inline
 * (red border + tooltip) without losing the row. Autocomplete is
 * delegated via a per-column `suggestions` resolver.
 *
 * Used by: 10.C Bookkeeper rapid invoice entry, 10.E QS BoQ editing,
 * 10.H Procurement RFQ entry.
 *
 * Reference patterns: QuickBooks/Xero rapid entry, Buildxact BoQ
 * grid (research-summary.md theme 6 + reference-apps/bookkeeper.md).
 *
 * Client component — keyboard nav state. Persistence delegated via
 * `onCommit(rows)` so parents control debouncing + server actions.
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type CellValue = string | number | null;

export interface SpreadsheetColumn<R extends Record<string, CellValue>> {
  key: keyof R & string;
  label: string;
  type?: "text" | "number" | "date";
  width?: number;
  /** Inline validation. Returns null when valid, error message otherwise. */
  validate?: (value: CellValue, row: R) => string | null;
  /** Sync suggestion list (e.g. cached vendor history). */
  suggestions?: (row: R) => string[];
  align?: "left" | "right";
}

export interface SpreadsheetViewProps<R extends Record<string, CellValue>> {
  columns: SpreadsheetColumn<R>[];
  rows: R[];
  /** Number of blank rows appended at the bottom. */
  emptyRows?: number;
  /** Called when user presses Save (Ctrl/Cmd + S) or blurs after a change. */
  onCommit?: (rows: R[]) => void;
  className?: string;
  caption?: string;
}

interface RowState<R> {
  data: R;
  errors: Record<string, string | null>;
}

export function SpreadsheetView<R extends Record<string, CellValue>>({
  columns,
  rows: initialRows,
  emptyRows = 5,
  onCommit,
  className,
  caption,
}: SpreadsheetViewProps<R>) {
  const blankRow = React.useMemo<R>(() => {
    const r = {} as R;
    for (const c of columns) (r as Record<string, CellValue>)[c.key] = null;
    return r;
  }, [columns]);

  const [rows, setRows] = React.useState<RowState<R>[]>(() => [
    ...initialRows.map((d) => ({ data: d, errors: {} })),
    ...Array.from({ length: emptyRows }, () => ({
      data: { ...blankRow },
      errors: {},
    })),
  ]);

  const inputs = React.useRef(new Map<string, HTMLInputElement>());

  function focusCell(rowIdx: number, colIdx: number) {
    const key = `${rowIdx}:${columns[colIdx]?.key}`;
    inputs.current.get(key)?.focus();
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
  ) {
    const lastCol = columns.length - 1;
    if (e.key === "Tab" && !e.shiftKey) {
      if (colIdx < lastCol) {
        e.preventDefault();
        focusCell(rowIdx, colIdx + 1);
      } else if (rowIdx < rows.length - 1) {
        e.preventDefault();
        focusCell(rowIdx + 1, 0);
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      if (colIdx > 0) {
        e.preventDefault();
        focusCell(rowIdx, colIdx - 1);
      } else if (rowIdx > 0) {
        e.preventDefault();
        focusCell(rowIdx - 1, lastCol);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey && rowIdx > 0) focusCell(rowIdx - 1, colIdx);
      else if (rowIdx < rows.length - 1) focusCell(rowIdx + 1, colIdx);
    } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      commit();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      // Duplicate row above
      e.preventDefault();
      if (rowIdx > 0) {
        const above = rows[rowIdx - 1];
        if (above) {
          setRows((rs) => {
            const next = [...rs];
            next[rowIdx] = { data: { ...above.data }, errors: {} };
            return next;
          });
        }
      }
    }
  }

  function setCell(
    rowIdx: number,
    col: SpreadsheetColumn<R>,
    raw: string,
  ) {
    setRows((rs) => {
      const next = [...rs];
      const row = next[rowIdx];
      if (!row) return rs;
      let val: CellValue = raw === "" ? null : raw;
      if (col.type === "number" && val !== null) {
        const n = Number(val);
        val = Number.isFinite(n) ? n : raw;
      }
      const newData = { ...row.data, [col.key]: val } as R;
      const err = col.validate ? col.validate(val, newData) : null;
      next[rowIdx] = {
        data: newData,
        errors: { ...row.errors, [col.key]: err },
      };
      return next;
    });
  }

  function commit() {
    const validRows = rows
      .filter((r) => Object.values(r.errors).every((e) => !e))
      .map((r) => r.data)
      .filter((d) =>
        Object.values(d as Record<string, CellValue>).some((v) => v != null && v !== ""),
      );
    onCommit?.(validRows);
  }

  return (
    <div className={cn("rounded-md border border-line-soft bg-surface", className)}>
      {caption && (
        <div className="px-3 py-2 border-b border-line-soft bg-muted text-xs text-ink-secondary">
          {caption}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "p-2 text-xs font-medium text-ink-secondary border-b border-line-soft",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rowIdx) => {
              const isEmpty = Object.values(
                r.data as Record<string, CellValue>,
              ).every((v) => v == null || v === "");
              const hasError = Object.values(r.errors).some((e) => !!e);
              return (
                <tr
                  key={rowIdx}
                  className={cn(
                    "border-t border-line-soft",
                    !isEmpty && !hasError && "bg-success-weak/30",
                    hasError && "bg-danger-weak/30",
                  )}
                >
                  {columns.map((col, colIdx) => {
                    const v = r.data[col.key];
                    const err = r.errors[col.key];
                    const id = `${rowIdx}:${col.key}`;
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "p-0 border-r border-line-soft last:border-r-0 relative",
                        )}
                      >
                        <input
                          ref={(el) => {
                            if (el) inputs.current.set(id, el);
                            else inputs.current.delete(id);
                          }}
                          type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
                          value={v == null ? "" : String(v)}
                          onChange={(e) => setCell(rowIdx, col, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          onBlur={() => commit()}
                          aria-invalid={Boolean(err)}
                          aria-describedby={err ? `${id}-err` : undefined}
                          list={col.suggestions ? `${id}-sug` : undefined}
                          className={cn(
                            "w-full bg-transparent px-2 py-1.5 text-sm font-mono tabular-nums focus:outline-2 focus:outline-accent",
                            col.align === "right" && "text-right",
                            err && "outline outline-1 outline-danger",
                          )}
                        />
                        {col.suggestions && (
                          <datalist id={`${id}-sug`}>
                            {col.suggestions(r.data).map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        )}
                        {err && (
                          <div
                            id={`${id}-err`}
                            role="alert"
                            className="absolute z-10 left-0 top-full mt-0.5 px-2 py-0.5 bg-danger text-white text-xs rounded-sm whitespace-nowrap"
                          >
                            {err}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-line-soft bg-muted/40 text-xs text-ink-tertiary">
        <span>
          {rows.filter((r) => !Object.values(r.errors).some((e) => !!e)).length}
          {" / "}
          {rows.length} valid · Tab → next cell · Enter → next row · Ctrl+D
          duplicate
        </span>
        <button
          type="button"
          onClick={commit}
          className="text-accent hover:opacity-90 font-medium"
        >
          Save (Ctrl+S)
        </button>
      </div>
    </div>
  );
}
