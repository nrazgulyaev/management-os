"use client";

/**
 * Phase 2.4 mgmt-03 — TurnoverMonitor.
 *
 * Live cleaning-vs-next-checkin progress strip. Each row =
 * (villa, checkoutAt, checkinAt, cleaningProgressPct, status).
 *
 * Status `overdue` fires when next check-in window starts and
 * cleaning < 100%; row goes red and ops gets a desktop alert.
 */

import * as React from "react";

export type TurnoverStatus = "pending" | "cleaning" | "done" | "overdue";

export interface TurnoverRow {
  id: string;
  villaCode: string;
  checkoutAt: string;
  checkinAt?: string;
  cleaningProgressPct: number;
  status: TurnoverStatus;
  assigneeName?: string;
}

export interface TurnoverMonitorProps {
  rows: TurnoverRow[];
  className?: string;
}

export function TurnoverMonitor({ rows, className }: TurnoverMonitorProps) {
  if (!rows.length) {
    return <div className={`turnover-monitor tm-empty${className ? ` ${className}` : ""}`}>No active turnovers.</div>;
  }
  return (
    <div className={`turnover-monitor${className ? ` ${className}` : ""}`}>
      {rows.map((r) => (
        <div key={r.id} className={`tm-row tm-${r.status}`}>
          <div className="tm-villa mono">{r.villaCode}</div>
          <div className="tm-times mono">
            <span>Out {r.checkoutAt}</span>
            {r.checkinAt && <span>→ In {r.checkinAt}</span>}
          </div>
          <div className="tm-track">
            <div className="tm-fill" style={{ width: `${Math.min(100, Math.max(0, r.cleaningProgressPct))}%` }} />
          </div>
          <div className="tm-pct mono">{r.cleaningProgressPct}%</div>
          <div className="tm-status mono">{r.status}</div>
          {r.assigneeName && <div className="tm-assignee">{r.assigneeName}</div>}
        </div>
      ))}
    </div>
  );
}
