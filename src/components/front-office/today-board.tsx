"use client";

/**
 * Phase 2.4 mgmt-03 — TodayBoard.
 *
 * 3-column responsive board (Arrivals / In-house / Departures).
 * Collapses to stacked columns ≤900px and to a single-stream
 * sorted by next-action-time at ≤600px.
 *
 * The board is structure-only — guests rendered as children
 * (GuestCard).
 */

import * as React from "react";

export interface TodayBoardColumn {
  key: "arrivals" | "in-house" | "departures";
  title: string;
  count: number;
}

export interface TodayBoardProps {
  columns: TodayBoardColumn[];
  /** Mapping: column.key → children */
  children: Partial<Record<TodayBoardColumn["key"], React.ReactNode>>;
  className?: string;
}

export function TodayBoard({ columns, children, className }: TodayBoardProps) {
  return (
    <div className={`today-board${className ? ` ${className}` : ""}`}>
      {columns.map((col) => (
        <section className={`tb-col tb-col-${col.key}`} key={col.key}>
          <header className="tb-col-head">
            <span className="tb-col-title">{col.title}</span>
            <span className="tb-col-count mono">{col.count}</span>
          </header>
          <div className="tb-col-body">{children[col.key]}</div>
        </section>
      ))}
    </div>
  );
}
