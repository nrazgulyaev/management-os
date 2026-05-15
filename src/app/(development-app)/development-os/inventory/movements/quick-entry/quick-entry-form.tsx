"use client";

/**
 * Sprint MD-1 — Movements quick-entry client island.
 *
 * Mirrors the Sprint-4 bookkeeper QuickEntryForm. SpreadsheetView
 * with 7 columns: Date · Item · Type · Qty · From · To · Reference ·
 * Note. Item + location columns get suggestions from the catalogue
 * lists handed in from the server page. The "default receiving
 * location" picker is shown at the top — `received` rows without an
 * explicit `to` use it; transfers always require both sides.
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
  bulkInsertMovements,
  type BulkMovementResult,
} from "@/lib/development/server/inventory/inventory-bulk-actions";

const MOVEMENT_TYPES = [
  "received",
  "issued_to_site",
  "transferred",
  "damaged",
  "lost",
  "returned",
  "written_off",
  "adjusted",
] as const;

interface MovementRow extends Record<string, CellValue> {
  date: string | null;
  item: string | null;
  movementType: string | null;
  quantity: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  reference: string | null;
  note: string | null;
}

export interface InventoryLocationOption {
  id: string;
  label: string;
  code: string;
}

export function MovementsQuickEntryForm({
  itemSkus,
  itemNames,
  locations,
}: {
  itemSkus: string[];
  itemNames: string[];
  locations: InventoryLocationOption[];
}) {
  const [defaultToLocationId, setDefaultToLocationId] = React.useState<
    string | null
  >(locations[0]?.id ?? null);
  const [result, setResult] = React.useState<BulkMovementResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locationCodes = React.useMemo(
    () => locations.map((l) => l.code),
    [locations],
  );

  const itemSuggestions = React.useMemo(
    () => [...itemSkus, ...itemNames],
    [itemSkus, itemNames],
  );

  const columns = React.useMemo<SpreadsheetColumn<MovementRow>[]>(
    () => [
      {
        key: "date",
        label: "Date",
        type: "date",
        width: 130,
        validate: (v) =>
          v && /^\d{4}-\d{2}-\d{2}$/.test(String(v))
            ? null
            : v
              ? "YYYY-MM-DD"
              : null,
      },
      {
        key: "item",
        label: "Item",
        type: "text",
        width: 220,
        suggestions: () => itemSuggestions,
      },
      {
        key: "movementType",
        label: "Type",
        type: "text",
        width: 130,
        suggestions: () => [...MOVEMENT_TYPES],
        validate: (v) =>
          !v ||
          MOVEMENT_TYPES.includes(
            String(v).toLowerCase() as (typeof MOVEMENT_TYPES)[number],
          )
            ? null
            : `One of ${MOVEMENT_TYPES.join(", ")}`,
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
        key: "fromLocation",
        label: "From",
        type: "text",
        width: 140,
        suggestions: () => locationCodes,
      },
      {
        key: "toLocation",
        label: "To",
        type: "text",
        width: 140,
        suggestions: () => locationCodes,
      },
      {
        key: "reference",
        label: "Reference",
        type: "text",
        width: 140,
      },
      {
        key: "note",
        label: "Note",
        type: "text",
        width: 200,
      },
    ],
    [itemSuggestions, locationCodes],
  );

  const handleCommit = (rows: MovementRow[]): void => {
    setError(null);
    setResult(null);
    const populated = rows.filter(
      (r) => r.date && r.item && r.movementType && r.quantity,
    );
    if (populated.length === 0) {
      setError(
        "Fill in at least one row's required fields (date, item, type, qty).",
      );
      return;
    }
    startTransition(async () => {
      try {
        const out = await bulkInsertMovements({
          defaultToLocationId: defaultToLocationId ?? null,
          movements: populated.map((r) => ({
            date: String(r.date),
            itemSku: String(r.item),
            movementType: String(r.movementType).toLowerCase() as
              | "received"
              | "issued_to_site"
              | "transferred"
              | "damaged"
              | "lost"
              | "returned"
              | "written_off"
              | "adjusted",
            quantity: String(r.quantity),
            fromLocation: r.fromLocation ? String(r.fromLocation) : null,
            toLocation: r.toLocation ? String(r.toLocation) : null,
            reference: r.reference ? String(r.reference) : null,
            note: r.note ? String(r.note) : null,
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
          <span className="text-ink-secondary font-medium">
            Default receiving location
          </span>
          <select
            className="rounded-md border border-line-soft bg-canvas px-3 h-9 text-sm text-ink min-w-[240px]"
            value={defaultToLocationId ?? ""}
            onChange={(e) =>
              setDefaultToLocationId(e.target.value || null)
            }
          >
            <option value="">No default — set per row</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink-tertiary w-full">
          Used when a <code className="font-mono">received</code> row
          has no <code className="font-mono">to</code> location.
          Transfers and outflows must set locations explicitly.
        </p>
      </header>

      <SpreadsheetView
        columns={columns}
        rows={[]}
        emptyRows={15}
        onCommit={handleCommit}
        caption="Type or paste inventory movements. SKU + type + qty required; locations match by code or display name."
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
              {result.totalRows} movements saved.
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
                href="/development-os/cabinets/warehouse-manager"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline self-start"
              >
                Open warehouse cabinet
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
