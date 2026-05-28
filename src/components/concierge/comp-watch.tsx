"use client";

/**
 * Phase 2.4 mgmt-04 — CompWatch.
 *
 * Side-rail tile showing running comp total for a booking + a
 * progress bar against the soft cap. Hits orange at 60% of cap
 * and red at the approval threshold.
 */

import * as React from "react";
import { COMP_APPROVAL_THRESHOLD_IDR } from "@/features/concierge/comp-policy";

export interface CompOfferedRow {
  id: string;
  at: string;
  reason: string;
  amountIdr: number;
  autoApproved: boolean;
}

export interface CompWatchProps {
  rows: CompOfferedRow[];
  /** Soft cap for this booking (typically 2_000_000 IDR / stay). */
  capIdr?: number;
  className?: string;
}

const DEFAULT_CAP = 2_000_000;

function fmtIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

export function CompWatch({ rows, capIdr = DEFAULT_CAP, className }: CompWatchProps) {
  const total = rows.reduce((n, r) => n + r.amountIdr, 0);
  const pct = Math.min(100, Math.round((total / capIdr) * 100));
  const tone =
    total >= COMP_APPROVAL_THRESHOLD_IDR && total < capIdr * 0.9
      ? "warn"
      : total >= capIdr * 0.9
        ? "danger"
        : "ok";

  return (
    <div className={`comp-watch cw-${tone}${className ? ` ${className}` : ""}`}>
      <header className="cw-head">
        <span className="cw-label mono">Comp this stay</span>
        <span className="cw-total mono">
          {fmtIdr(total)} <span className="cw-unit">IDR</span>
        </span>
      </header>
      <div className="cw-track" aria-hidden>
        <div className="cw-fill" style={{ width: `${pct}%` }} />
        <div
          className="cw-threshold"
          style={{ left: `${Math.min(100, (COMP_APPROVAL_THRESHOLD_IDR / capIdr) * 100)}%` }}
          aria-label="approval threshold"
        />
      </div>
      <div className="cw-meta mono">
        Approval threshold {fmtIdr(COMP_APPROVAL_THRESHOLD_IDR)} · soft cap {fmtIdr(capIdr)}
      </div>
      {rows.length > 0 && (
        <ul className="cw-list mono">
          {rows.slice(0, 4).map((r) => (
            <li key={r.id} className="cw-item">
              <span>{r.at}</span>
              <span>{fmtIdr(r.amountIdr)}</span>
              <span>{r.autoApproved ? "auto" : "approved"}</span>
              <span className="cw-reason">{r.reason}</span>
            </li>
          ))}
          {rows.length > 4 && <li className="cw-more">+{rows.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}
