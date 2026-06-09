"use client";

/**
 * Sprint MD-1 — Quotation-comparison matrix client island.
 *
 * Wraps the existing <RfqMatrix> presentational primitive (Stage
 * 10.B, previously unused on a live route) with:
 *   - radio overrides per row so the operator can pick a winner
 *     OTHER than the lowest-price default
 *   - a footer "Award split" button that calls the bulk
 *     `createPoFromQuotationComparison` server action and surfaces
 *     per-row PO creation results
 *
 * Cells render unit-price totals (in major units, divided by 100 or
 * 1_000_000 for USDT). Cents-style minor units land on the server
 * side; the matrix shows the major-unit value so the operator sees
 * the same number their spreadsheet has.
 */

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import {
  RfqMatrix,
  type RfqLineItem,
  type RfqVendorQuote,
} from "@/components/ui/primitives/rfq-matrix";
import {
  createPoFromQuotationComparison,
  type AwardSplitResult,
} from "@/lib/development/server/procurement/quotation-comparison-actions";
import { cn } from "@/lib/utils";

export interface MatrixLine {
  id: string;
  requestCode: string;
  materialName: string;
  quantity: string;
  unitOfMeasure: string;
  requiredByDate: string;
  selectedVendorId: string | null;
}

export interface MatrixVendor {
  id: string;
  name: string;
  onTimeRate: string | null;
  qualityRating: string | null;
}

export interface QuotationMatrixIslandProps {
  lines: MatrixLine[];
  vendors: MatrixVendor[];
  /** { [prId]: { [vendorId]: totalMinor (string) } } */
  cellsByPrAndVendor: Record<string, Record<string, string>>;
}

function minorToMajor(minor: string | undefined): number | null {
  if (!minor) return null;
  const n = Number(minor);
  if (!Number.isFinite(n)) return null;
  // The list page elsewhere divides by 100; we mirror that here.
  return n / 100;
}

export function QuotationMatrixIsland({
  lines,
  vendors,
  cellsByPrAndVendor,
}: QuotationMatrixIslandProps) {
  // Compute the lowest-price vendor per PR for the default selection.
  const defaultChoiceByPrId = React.useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const l of lines) {
      const row = cellsByPrAndVendor[l.id] ?? {};
      let best: { vendorId: string; total: bigint } | null = null;
      for (const [vendorId, raw] of Object.entries(row)) {
        try {
          const v = BigInt(raw);
          if (!best || v < best.total) best = { vendorId, total: v };
        } catch {
          // skip non-numeric
        }
      }
      m[l.id] = l.selectedVendorId ?? best?.vendorId ?? null;
    }
    return m;
  }, [lines, cellsByPrAndVendor]);

  const [choices, setChoices] = React.useState<Record<string, string | null>>(
    defaultChoiceByPrId,
  );
  const [result, setResult] = React.useState<AwardSplitResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matrixLines: RfqLineItem[] = lines.map((l) => ({
    id: l.id,
    label: `${l.requestCode} · ${l.materialName}`,
    unit: l.unitOfMeasure,
    quantity: Number(l.quantity),
  }));

  const matrixVendors: RfqVendorQuote[] = vendors.map((v) => ({
    vendorId: v.id,
    vendorName: v.name,
    prices: Object.fromEntries(
      lines.map((l) => {
        const cell = cellsByPrAndVendor[l.id]?.[v.id];
        const total = minorToMajor(cell);
        // RfqMatrix multiplies price × quantity for the footer total.
        // We pass per-unit price = total / quantity so the footer
        // rolls up correctly back to the per-vendor PR total.
        const qty = Number(l.quantity);
        return [
          l.id,
          total !== null && qty > 0 ? total / qty : null,
        ];
      }),
    ),
    scorecard: {
      onTimePct:
        v.onTimeRate !== null && Number.isFinite(Number(v.onTimeRate))
          ? Math.round(Number(v.onTimeRate))
          : undefined,
      qualityPct:
        v.qualityRating !== null && Number.isFinite(Number(v.qualityRating))
          ? Math.round(Number(v.qualityRating) * 20)
          : undefined,
    },
  }));

  function handleSubmit(): void {
    setError(null);
    setResult(null);
    const supplierChoicesByPrId: Record<string, string> = {};
    for (const [prId, vendorId] of Object.entries(choices)) {
      if (vendorId) supplierChoicesByPrId[prId] = vendorId;
    }
    if (Object.keys(supplierChoicesByPrId).length === 0) {
      setError("Pick a winning supplier on at least one row.");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createPoFromQuotationComparison({
          supplierChoicesByPrId,
        });
        setResult(out);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <RfqMatrix
        lines={matrixLines}
        vendors={matrixVendors}
        winnerStrategy="min"
      />

      <section className="rounded-[14px] border border-line-2 bg-panel shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
              Award split
            </div>
            <h3 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              Choose a supplier per row
            </h3>
            <p className="text-xs text-ink-3 leading-relaxed mt-1">
              Defaults match the lowest-price highlight; override per
              row if vendor history or lead time matters more.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber px-[18px] h-9 text-sm font-medium text-carbon hover:bg-amber-deep disabled:opacity-60 transition-colors"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create POs from choices
          </button>
        </header>

        <ul className="divide-y divide-line-soft border border-line-2 rounded-[10px] overflow-hidden">
          {lines.map((l) => {
            const row = cellsByPrAndVendor[l.id] ?? {};
            const eligibleVendors = vendors.filter(
              (v) => row[v.id] !== undefined,
            );
            const picked = choices[l.id] ?? null;
            const alreadyDecided = l.selectedVendorId !== null;
            return (
              <li key={l.id} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-ink-tertiary">
                      {l.requestCode}
                    </span>
                    <span className="text-sm text-ink">
                      {l.materialName} · {l.quantity} {l.unitOfMeasure}
                    </span>
                  </div>
                  {alreadyDecided && (
                    <span className="text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-success-weak text-success font-medium">
                      already selected
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {eligibleVendors.length === 0 ? (
                    <span className="text-xs text-ink-tertiary">
                      No quotes received yet.
                    </span>
                  ) : (
                    eligibleVendors.map((v) => {
                      const isPicked = picked === v.id;
                      const cellMajor = minorToMajor(row[v.id]);
                      return (
                        <label
                          key={v.id}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer transition-colors",
                            isPicked
                              ? "border-amber bg-amber/10 text-ink"
                              : "border-line-2 bg-bg-2 text-ink-2 hover:border-line-3",
                          )}
                        >
                          <input
                            type="radio"
                            name={`choice-${l.id}`}
                            checked={isPicked}
                            disabled={alreadyDecided}
                            onChange={() =>
                              setChoices((prev) => ({
                                ...prev,
                                [l.id]: v.id,
                              }))
                            }
                            className="accent-[var(--amber)]"
                          />
                          <span className="font-medium">{v.name}</span>
                          {cellMajor !== null && (
                            <span className="font-mono tabular-nums text-ink-tertiary">
                              {cellMajor.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-ink">
              <strong className="font-medium">{result.successCount}</strong> PO
              {result.successCount === 1 ? "" : "s"} created.
              {result.skippedCount > 0 && (
                <span className="text-ink-tertiary">
                  {" "}
                  · {result.skippedCount} row
                  {result.skippedCount === 1 ? "" : "s"} skipped (already
                  selected).
                </span>
              )}
              {result.errorCount > 0 && (
                <span className="text-danger">
                  {" "}
                  · {result.errorCount} need attention.
                </span>
              )}
            </p>
            {result.errorCount > 0 && (
              <ul className="text-xs text-ink-secondary flex flex-col gap-0.5 max-h-32 overflow-y-auto border border-line-soft rounded-md px-3 py-2 bg-canvas">
                {result.results
                  .filter((r) => !r.ok && r.error !== "already_selected")
                  .map((r) => (
                    <li key={r.prId} className="font-mono tabular-nums">
                      {r.prId}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
            {result.successCount > 0 && (
              <Link
                href="/development-os/cabinets/procurement-manager/pos"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline self-start"
              >
                Open purchase orders
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
