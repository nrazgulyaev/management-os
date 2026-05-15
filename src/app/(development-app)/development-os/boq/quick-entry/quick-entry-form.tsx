"use client";

/**
 * Sprint MD-1 — BoQ quick-entry client island.
 *
 * Mounts <SpreadsheetView> with BoQ-specific columns. The target BoQ
 * document is picked once at the top (mirrors Sprint 4's bank-account
 * pattern); section codes auto-complete from the picked document.
 *
 * `onCommit` invokes `bulkInsertBoqLines` and surfaces per-row results
 * inline so the operator fixes errors without losing the grid state.
 */

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import {
  SpreadsheetView,
  type CellValue,
  type SpreadsheetColumn,
} from "@/components/ui/primitives/spreadsheet-view";
import {
  bulkInsertBoqLines,
  type BulkBoqResult,
} from "@/lib/development/server/boq/boq-bulk-actions";

interface BoqLineRow extends Record<string, CellValue> {
  sectionCode: string | null;
  itemCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  unitRate: string | null;
  category: string | null;
  supplier: string | null;
}

export interface BoqSectionHint {
  code: string;
  name: string;
}

export interface BoqDocumentOption {
  id: string;
  label: string;
  currency: string;
  versionLabel: string;
  sectionCodes: BoqSectionHint[];
}

export function BoqQuickEntryForm({
  boqDocuments,
  categoryNames,
}: {
  boqDocuments: BoqDocumentOption[];
  categoryNames: string[];
}) {
  const [boqDocumentId, setBoqDocumentId] = React.useState<string | null>(
    boqDocuments[0]?.id ?? null,
  );
  const [result, setResult] = React.useState<BulkBoqResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeDoc = boqDocuments.find((d) => d.id === boqDocumentId) ?? null;
  const sectionCodes = React.useMemo(
    () => activeDoc?.sectionCodes ?? [],
    [activeDoc],
  );

  const columns = React.useMemo<SpreadsheetColumn<BoqLineRow>[]>(
    () => [
      {
        key: "sectionCode",
        label: "Section",
        type: "text",
        width: 110,
        suggestions: () => sectionCodes.map((s) => s.code),
        validate: (v) =>
          v && String(v).trim().length > 0 ? null : v ? null : null,
      },
      {
        key: "itemCode",
        label: "Item Code",
        type: "text",
        width: 110,
        validate: (v) =>
          v && String(v).trim().length > 0 ? null : v ? null : null,
      },
      {
        key: "description",
        label: "Description",
        type: "text",
        width: 260,
      },
      {
        key: "unit",
        label: "Unit",
        type: "text",
        width: 80,
        suggestions: () => ["m²", "m³", "m", "kg", "pcs", "lot", "set"],
      },
      {
        key: "quantity",
        label: "Qty",
        type: "number",
        width: 90,
        align: "right",
        validate: (v) =>
          !v
            ? null
            : Number.isFinite(Number(v)) && Number(v) > 0
              ? null
              : "Positive number",
      },
      {
        key: "unitRate",
        label: "Unit cost",
        type: "number",
        width: 110,
        align: "right",
        validate: (v) =>
          !v
            ? null
            : Number.isFinite(Number(v)) && Number(v) >= 0
              ? null
              : "Non-negative number",
      },
      {
        key: "category",
        label: "Category",
        type: "text",
        width: 180,
        suggestions: () => categoryNames,
      },
      {
        key: "supplier",
        label: "Supplier",
        type: "text",
        width: 160,
      },
    ],
    [sectionCodes, categoryNames],
  );

  const handleCommit = (rows: BoqLineRow[]): void => {
    setError(null);
    setResult(null);
    if (!boqDocumentId) {
      setError("Pick a BoQ document first.");
      return;
    }
    const populated = rows.filter(
      (r) =>
        r.sectionCode &&
        r.itemCode &&
        r.description &&
        r.unit &&
        r.quantity &&
        r.unitRate,
    );
    if (populated.length === 0) {
      setError(
        "Fill in at least one row's required fields (section, item code, description, unit, qty, unit cost).",
      );
      return;
    }
    startTransition(async () => {
      try {
        const out = await bulkInsertBoqLines({
          boqDocumentId,
          lines: populated.map((r) => ({
            sectionCode: String(r.sectionCode),
            itemCode: String(r.itemCode),
            description: String(r.description),
            quantity: String(r.quantity),
            unitOfMeasure: String(r.unit),
            unitRateMajor: String(r.unitRate),
            categoryName: r.category ? String(r.category) : null,
            supplierHint: r.supplier ? String(r.supplier) : null,
          })),
        });
        setResult(out);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary font-medium">BoQ document</span>
          <select
            className="rounded-md border border-line-soft bg-canvas px-3 h-9 text-sm text-ink min-w-[260px]"
            value={boqDocumentId ?? ""}
            onChange={(e) => setBoqDocumentId(e.target.value || null)}
          >
            <option value="" disabled>
              Pick a BoQ document…
            </option>
            {boqDocuments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · {d.currency} · {d.versionLabel}
              </option>
            ))}
          </select>
        </label>
        {activeDoc && sectionCodes.length > 0 && (
          <span className="text-xs text-ink-tertiary">
            Sections: {sectionCodes.map((s) => s.code).join(" · ")}
          </span>
        )}
        <p className="text-xs text-ink-tertiary w-full">
          Tab/Enter to move between cells. Paste TSV/CSV from Sheets or
          Excel. Ctrl/Cmd-S saves all valid rows.
        </p>
      </header>

      <SpreadsheetView
        columns={columns}
        rows={[]}
        emptyRows={20}
        onCommit={handleCommit}
        caption="Type or paste BoQ line items. Lines are inserted into the matching section_code within the picked BoQ document."
      />

      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        {pending && (
          <p className="inline-flex items-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-ink">
              <strong className="font-medium">{result.successCount}</strong> of{" "}
              {result.totalRows} BoQ lines saved.
              {result.errorCount > 0 && (
                <>
                  {" "}
                  <span className="text-danger">
                    {result.errorCount} need attention.
                  </span>
                </>
              )}
            </p>
            {result.errorCount > 0 && (
              <ul className="text-xs text-ink-secondary flex flex-col gap-0.5 max-h-32 overflow-y-auto border border-line-soft rounded-md px-3 py-2 bg-canvas">
                {result.results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.rowIndex} className="font-mono tabular-nums">
                      Row {r.rowIndex + 1}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
            {result.successCount > 0 && (
              <Link
                href="/development-os/cabinets/qs"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline self-start"
              >
                Open QS cabinet
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
