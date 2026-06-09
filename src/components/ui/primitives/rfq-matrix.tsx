/**
 * Stage 10.B — RFQMatrix primitive.
 *
 * Side-by-side bid comparison: line items × vendors. Auto-highlights
 * the per-row winner (lowest unit price, configurable to lead-time
 * or composite score). Footer rolls up totals + per-vendor lead time.
 *
 * Used by: 10.H Procurement RFQ vendor selection.
 *
 * Reference patterns: Coupa source-to-contract matrix, Procurify
 * award flow, Tradogram strategic-sourcing scoreboard
 * (research-summary.md theme 2 + reference-apps/procurement.md).
 *
 * Server component — purely presentational. Award action delegated
 * via `awardHref` per cell or footer button.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

export interface RfqLineItem {
  id: string;
  label: string;
  unit?: string;
  quantity?: number;
}

export interface RfqVendorQuote {
  vendorId: string;
  vendorName: string;
  /** Per-line-item unit price, keyed by line.id. Missing = "no quote". */
  prices: Record<string, number | null>;
  leadTimeDays?: number;
  totalCurrency?: string;
  scorecard?: {
    onTimePct?: number;
    qualityPct?: number;
  };
}

export interface RfqMatrixProps {
  lines: RfqLineItem[];
  vendors: RfqVendorQuote[];
  /** "min" picks lowest price; "lead" picks shortest lead time. */
  winnerStrategy?: "min" | "lead";
  className?: string;
  /** Callback for "Award split" footer button; pass per-line winners. */
  onAwardSplit?: (winners: Record<string, string>) => void;
}

function findWinnerForLine(
  lineId: string,
  vendors: RfqVendorQuote[],
  strategy: NonNullable<RfqMatrixProps["winnerStrategy"]>,
): string | null {
  if (strategy === "lead") {
    const v = vendors
      .filter((v) => typeof v.leadTimeDays === "number")
      .sort(
        (a, b) =>
          (a.leadTimeDays ?? Number.POSITIVE_INFINITY) -
          (b.leadTimeDays ?? Number.POSITIVE_INFINITY),
      )[0];
    return v?.vendorId ?? null;
  }
  const candidates = vendors
    .map((v) => ({ id: v.vendorId, p: v.prices[lineId] }))
    .filter((x): x is { id: string; p: number } => typeof x.p === "number");
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.p - b.p);
  return candidates[0]?.id ?? null;
}

function totalForVendor(lines: RfqLineItem[], v: RfqVendorQuote): number {
  let sum = 0;
  for (const l of lines) {
    const p = v.prices[l.id];
    if (typeof p === "number") sum += p * (l.quantity ?? 1);
  }
  return sum;
}

export function RfqMatrix({
  lines,
  vendors,
  winnerStrategy = "min",
  className,
  onAwardSplit,
}: RfqMatrixProps) {
  if (lines.length === 0 || vendors.length === 0) {
    return (
      <div
        className={cn("text-sm text-ink-tertiary italic p-4", className)}
        data-empty
      >
        No quotes to compare yet.
      </div>
    );
  }

  const winners: Record<string, string> = {};
  for (const l of lines) {
    const w = findWinnerForLine(l.id, vendors, winnerStrategy);
    if (w) winners[l.id] = w;
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-line-soft bg-surface",
        className,
      )}
    >
      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted">
          <tr>
            <th className="text-left p-3 font-medium text-ink-secondary sticky left-0 bg-muted z-10 min-w-[180px]">
              Line item
            </th>
            {vendors.map((v) => (
              <th
                key={v.vendorId}
                className="text-right p-3 font-medium text-ink-secondary min-w-[140px]"
              >
                <div className="flex flex-col items-end gap-0.5">
                  <span>{v.vendorName}</span>
                  {v.scorecard?.onTimePct != null && (
                    <span className="text-xs text-ink-tertiary font-normal">
                      OnTime {v.scorecard.onTimePct}%
                      {v.scorecard.qualityPct != null && (
                        <> · Q {v.scorecard.qualityPct}%</>
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={l.id}
              className="border-t border-line-soft hover:bg-muted/40"
            >
              <td className="p-3 sticky left-0 bg-surface z-10">
                <div className="text-ink">{l.label}</div>
                {(l.quantity != null || l.unit) && (
                  <div className="text-xs text-ink-tertiary">
                    {l.quantity ?? ""} {l.unit ?? ""}
                  </div>
                )}
              </td>
              {vendors.map((v) => {
                const p = v.prices[l.id];
                const isWinner = winners[l.id] === v.vendorId;
                return (
                  <td
                    key={v.vendorId}
                    className={cn(
                      "p-3 text-right font-mono tabular-nums",
                      isWinner &&
                        "bg-amber/15 text-amber-deep font-medium ring-1 ring-inset ring-amber/40",
                      typeof p !== "number" && "text-ink-tertiary",
                    )}
                  >
                    {typeof p === "number" ? (
                      <div className="inline-flex items-center justify-end gap-1">
                        {isWinner && (
                          <Trophy
                            className="w-3 h-3"
                            aria-label="best price"
                          />
                        )}
                        {p.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-line-strong bg-muted">
          <tr>
            <th className="text-left p-3 sticky left-0 bg-muted z-10">Total</th>
            {vendors.map((v) => {
              const t = totalForVendor(lines, v);
              return (
                <th
                  key={v.vendorId}
                  className="p-3 text-right font-mono tabular-nums text-ink"
                >
                  {t.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </th>
              );
            })}
          </tr>
          <tr>
            <th className="text-left p-3 sticky left-0 bg-muted z-10 text-ink-secondary font-normal">
              Lead time
            </th>
            {vendors.map((v) => (
              <th
                key={v.vendorId}
                className="p-3 text-right text-ink-secondary font-normal"
              >
                {v.leadTimeDays != null ? `${v.leadTimeDays} d` : "—"}
              </th>
            ))}
          </tr>
        </tfoot>
      </table>
      {onAwardSplit && (
        <div className="flex justify-end p-3 border-t border-line-soft bg-muted/40">
          <button
            type="button"
            onClick={() => onAwardSplit(winners)}
            className="text-sm font-medium text-accent hover:opacity-90"
          >
            Award split → {Object.keys(winners).length} vendor(s)
          </button>
        </div>
      )}
    </div>
  );
}
