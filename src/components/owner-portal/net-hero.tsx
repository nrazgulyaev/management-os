import * as React from "react";

/**
 * Phase 2.3 owner-02 — NetHero.
 *
 * Statement-page hero card: large display number (USD or IDR) +
 * wire-status sub line. The owner's eye lands here first.
 */

export interface NetHeroProps {
  amount: number;
  currency: string;
  /** Wire status (e.g. "Wired 01 May · ANZ ending 8842"). */
  wire?: React.ReactNode;
  /** Optional small period chip ("MARCH 2026"). */
  periodLabel?: React.ReactNode;
  className?: string;
}

function fmt(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (currency === "IDR") {
    if (abs >= 1_000_000_000) return `${currency} ${(amount / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(1)}M`;
    return `${currency} ${amount.toLocaleString()}`;
  }
  if (abs >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${currency} ${(amount / 1_000).toFixed(0)}K`;
  return `${currency} ${amount.toLocaleString()}`;
}

export function NetHero({ amount, currency, wire, periodLabel, className }: NetHeroProps) {
  return (
    <div className={`net-hero${className ? ` ${className}` : ""}`}>
      {periodLabel && <div className="nh-period mono">{periodLabel}</div>}
      <div className="nh-label mono">Net to you</div>
      <div className="nh-value">{fmt(amount, currency)}</div>
      {wire && <div className="nh-wire">{wire}</div>}
    </div>
  );
}
