import * as React from "react";
import Link from "next/link";
import { OwnerStatusPill, type OwnerStatementState } from "./owner-status-pill";

/**
 * Phase 2.3 owner-02 — StatementListRow.
 *
 * One row in the owner statements list. The pending variant
 * elevates with a gold border + soft shadow so the call-to-action
 * is unmistakable. The other states are flat with status pill
 * + amount + period label.
 */

export interface StatementListRowProps {
  href: string;
  statementCode: string;
  periodLabel: string;
  netAmount: number;
  currency: string;
  state: OwnerStatementState;
  /** "Wired 01 May" / "Auto-ack in 6d" / etc. */
  rightHint?: React.ReactNode;
  className?: string;
}

function fmt(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (currency === "IDR") {
    if (abs >= 1_000_000_000) return `IDR ${(amount / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `IDR ${(amount / 1_000_000).toFixed(1)}M`;
    return `IDR ${amount.toLocaleString()}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

export function StatementListRow({
  href,
  statementCode,
  periodLabel,
  netAmount,
  currency,
  state,
  rightHint,
  className,
}: StatementListRowProps) {
  return (
    <Link
      className={`statement-row state-${state}${className ? ` ${className}` : ""}`}
      href={href}
    >
      <div className="sr-left">
        <div className="sr-period">{periodLabel}</div>
        <div className="sr-code mono">{statementCode}</div>
      </div>
      <div className="sr-mid">
        <OwnerStatusPill state={state} />
      </div>
      <div className="sr-right">
        <span className="sr-amount mono">{fmt(netAmount, currency)}</span>
        {rightHint && <span className="sr-hint mono">{rightHint}</span>}
      </div>
    </Link>
  );
}
