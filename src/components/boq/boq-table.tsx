"use client";

/**
 * Phase 2.2 dev-03 — Virtualized BOQ table.
 *
 * Built on `@tanstack/react-virtual`. The table is rendered as a
 * fixed-height scrollable container; only the visible rows mount.
 * Sticky header. Optional click handler per row drops the user
 * into the line detail page.
 *
 * The full BOQ for a project tops out around 142 lines × 6 projects
 * = ~850 rows portfolio-wide; per-project tables stay well under
 * 200 rows, well within virtualization's sweet spot.
 */

import * as React from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DeltaPill } from "./delta-pill";
import { computeVariance } from "@/features/boq/variance";

export interface BoqTableLine {
  id: string;
  code: string;
  description: string;
  wpCode: string;
  unit: string;
  qtyPlanned: number;
  ratePlanned: number;
  qtyActual: number;
  rateActual: number;
  /** href to the line detail page. */
  href?: string;
}

export interface BoqTableProps {
  lines: BoqTableLine[];
  /** Optional WP filter (matches `wpCode.startsWith(filter)`). */
  wpFilter?: string | null;
  className?: string;
}

const ROW_HEIGHT = 44;

export function BoqTable({ lines, wpFilter, className }: BoqTableProps) {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const filtered = React.useMemo(
    () => (wpFilter ? lines.filter((l) => l.wpCode.startsWith(wpFilter)) : lines),
    [lines, wpFilter],
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div className={`boq-table${className ? ` ${className}` : ""}`}>
      <div className="boq-head">
        <div className="cell code">Code</div>
        <div className="cell desc">Description</div>
        <div className="cell wp">WP</div>
        <div className="cell qty">Qty</div>
        <div className="cell unit">Unit</div>
        <div className="cell rate">Rate</div>
        <div className="cell total">Planned</div>
        <div className="cell delta">Δ</div>
      </div>
      <div ref={parentRef} className="boq-scroll" style={{ height: 520 }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const line = filtered[v.index];
            const variance = computeVariance(
              { qty: line.qtyPlanned, rate: line.ratePlanned },
              line.qtyActual > 0 ? { qty: line.qtyActual, rate: line.rateActual } : null,
            );
            const planned = line.qtyPlanned * line.ratePlanned;
            const actual = line.qtyActual * line.rateActual;
            const RowInner = (
              <>
                <div className="cell code mono">{line.code}</div>
                <div className="cell desc">{line.description}</div>
                <div className="cell wp mono">{line.wpCode}</div>
                <div className="cell qty mono num">{line.qtyPlanned.toLocaleString()}</div>
                <div className="cell unit mono">{line.unit}</div>
                <div className="cell rate mono num">{line.ratePlanned.toFixed(2)}</div>
                <div className="cell total mono num">{planned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="cell delta">
                  {variance.flagged || actual > 0 ? (
                    <DeltaPill value={actual} baseline={planned} tone={variance.tone} kind="cost" />
                  ) : (
                    <span className="delta-pill neutral">—</span>
                  )}
                </div>
              </>
            );
            const rowStyle: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${v.start}px)`,
              height: ROW_HEIGHT,
            };
            return line.href ? (
              <Link key={v.key} href={line.href} className="boq-row" style={rowStyle}>
                {RowInner}
              </Link>
            ) : (
              <div key={v.key} className="boq-row" style={rowStyle}>
                {RowInner}
              </div>
            );
          })}
        </div>
      </div>
      <div className="boq-foot mono">
        {filtered.length} line{filtered.length === 1 ? "" : "s"}
        {wpFilter && <> · filtered by {wpFilter}.*</>}
      </div>
    </div>
  );
}
