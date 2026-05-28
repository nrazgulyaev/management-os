"use client";

/**
 * Phase 2.4 dev-02 — PaymentLadder.
 *
 * 3-stage stepper (Deposit / Progress / Completion) with status
 * pills. Read-only — Critical UX rule 5 says installments only
 * change via webhook from the bank reconciler.
 */

import * as React from "react";

export type InstallmentStatus = "pending" | "due" | "paid" | "overdue";

export interface PaymentInstallment {
  id: string;
  stage: "deposit" | "progress" | "completion" | string;
  amountIdr: number;
  dueAt?: string;
  paidAt?: string;
  status: InstallmentStatus;
  settlementRef?: string;
}

export interface PaymentLadderProps {
  installments: PaymentInstallment[];
  totalIdr: number;
  className?: string;
}

function fmtIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

export function PaymentLadder({ installments, totalIdr, className }: PaymentLadderProps) {
  const paid = installments.filter((i) => i.status === "paid").reduce((n, i) => n + i.amountIdr, 0);
  const pct = totalIdr > 0 ? Math.round((paid / totalIdr) * 100) : 0;

  return (
    <div className={`payment-ladder${className ? ` ${className}` : ""}`}>
      <header className="pl-head">
        <span className="pl-label mono">Settlement</span>
        <span className="pl-progress mono">
          {fmtIdr(paid)} / {fmtIdr(totalIdr)} IDR · {pct}%
        </span>
      </header>
      <ol className="pl-stages">
        {installments.map((i) => (
          <li key={i.id} className={`pl-row pl-status-${i.status}`}>
            <span className="pl-stage mono">{i.stage}</span>
            <span className="pl-amount mono">{fmtIdr(i.amountIdr)}</span>
            <span className="pl-when mono">
              {i.status === "paid" ? `paid ${i.paidAt}` : i.dueAt ? `due ${i.dueAt}` : "—"}
            </span>
            <span className={`pl-pill pl-pill-${i.status}`}>{i.status}</span>
          </li>
        ))}
      </ol>
      <footer className="pl-foot mono">
        Settlement is webhook-only — no manual mark-paid (Critical UX rule 5).
      </footer>
    </div>
  );
}
