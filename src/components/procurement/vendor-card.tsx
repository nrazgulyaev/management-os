import * as React from "react";
import Link from "next/link";
import { VendorScore } from "./vendor-score";

/**
 * Phase 2.2 dev-04 — VendorCard.
 *
 * Directory list-row. Vendor name + category + score badge + open
 * POs + total spend YTD. Click → vendor scorecard.
 */

export interface VendorCardProps {
  href: string;
  name: string;
  category: string;
  /** Composite vendor score 0..100. */
  score: number;
  /** Number of open purchase orders. */
  openPos: number;
  /** Total YTD spend with this vendor (USD minor). */
  ytdSpendUsdMinor: bigint | number;
  /** Optional flag chip (e.g. "Preferred", "On hold"). */
  flag?: { label: string; tone: "ok" | "warn" | "danger" };
}

function fmtSpend(value: bigint | number): string {
  const usd = typeof value === "bigint" ? Number(value) / 100 : value / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

export function VendorCard({
  href,
  name,
  category,
  score,
  openPos,
  ytdSpendUsdMinor,
  flag,
}: VendorCardProps) {
  return (
    <Link className="vendor-card" href={href}>
      <div className="vc-head">
        <span className="vc-name">{name}</span>
        <VendorScore score={score} />
      </div>
      <div className="vc-cat mono">{category}</div>
      <div className="vc-stats">
        <div className="vc-stat">
          <span className="value mono">{openPos}</span>
          <span className="label">Open POs</span>
        </div>
        <div className="vc-stat">
          <span className="value mono">{fmtSpend(ytdSpendUsdMinor)}</span>
          <span className="label">YTD spend</span>
        </div>
      </div>
      {flag && (
        <span className={`vc-flag tone-${flag.tone}`}>{flag.label}</span>
      )}
    </Link>
  );
}
