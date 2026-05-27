import * as React from "react";
import { VendorScore } from "./vendor-score";

/**
 * Phase 2.2 dev-04 — QuoteCompare.
 *
 * 3-column side-by-side comparison of vendor quotes. The winner
 * column is tinted ok-green. Each column shows total, lead time,
 * warranty, and the per-line break-down (compact).
 */

export interface QuoteCompareColumn {
  vendorId: string;
  vendorName: string;
  vendorScore?: number;
  /** USD minor (cents). */
  totalUsdMinor: bigint | number;
  leadTimeDays: number;
  warrantyMonths: number;
  /** Optional per-line break-down. */
  lines?: { code: string; description: string; total: number }[];
  /** Set on the winning column. */
  isWinner?: boolean;
  /** Optional savings hint vs the next-best (used inside the
   *  recommendation banner; surfaced on the winning column footer). */
  savingsLabel?: string;
}

export interface QuoteCompareProps {
  columns: QuoteCompareColumn[];
  className?: string;
}

function fmt(value: bigint | number): string {
  const usd = typeof value === "bigint" ? Number(value) / 100 : value / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

export function QuoteCompare({ columns, className }: QuoteCompareProps) {
  return (
    <div className={`quote-compare cols-${columns.length}${className ? ` ${className}` : ""}`}>
      {columns.map((c) => (
        <div className={`qc-col${c.isWinner ? " winner" : ""}`} key={c.vendorId}>
          {c.isWinner && <span className="qc-winner-tag mono">RECOMMENDED</span>}
          <div className="qc-head">
            <span className="qc-vendor">{c.vendorName}</span>
            {c.vendorScore !== undefined && <VendorScore score={c.vendorScore} compact />}
          </div>
          <div className="qc-total mono">{fmt(c.totalUsdMinor)}</div>
          <div className="qc-meta mono">
            {c.leadTimeDays}d lead · {c.warrantyMonths}mo warranty
          </div>
          {c.lines && c.lines.length > 0 && (
            <ul className="qc-lines">
              {c.lines.slice(0, 6).map((l) => (
                <li key={l.code}>
                  <span className="mono">{l.code}</span>
                  <span className="qc-desc">{l.description}</span>
                  <span className="num mono">${l.total.toLocaleString()}</span>
                </li>
              ))}
              {c.lines.length > 6 && (
                <li className="qc-more mono">+{c.lines.length - 6} more lines</li>
              )}
            </ul>
          )}
          {c.savingsLabel && <div className="qc-savings mono">{c.savingsLabel}</div>}
        </div>
      ))}
    </div>
  );
}
