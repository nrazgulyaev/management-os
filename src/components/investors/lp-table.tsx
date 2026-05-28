"use client";

/**
 * Phase 2.4 dev-03 — LpTable.
 *
 * Sortable by commitment / contribution / DPI. Per-row drilldown
 * opens /investors/lp/[id].
 */

import * as React from "react";

export interface LpTableRow {
  id: string;
  name: string;
  className: string;
  commitmentIdr: number;
  contributedIdr: number;
  distributedIdr: number;
  dpi: number;
  irr: number | null;
}

export type LpTableSort = "commitment-desc" | "contributed-desc" | "dpi-desc";

export interface LpTableProps {
  rows: LpTableRow[];
  sort?: LpTableSort;
  onSortChange?: (next: LpTableSort) => void;
  onSelect?: (id: string) => void;
  className?: string;
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

export function LpTable({ rows, sort = "commitment-desc", onSortChange, onSelect, className }: LpTableProps) {
  const sorted = React.useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      switch (sort) {
        case "contributed-desc":
          return b.contributedIdr - a.contributedIdr;
        case "dpi-desc":
          return b.dpi - a.dpi;
        default:
          return b.commitmentIdr - a.commitmentIdr;
      }
    });
    return out;
  }, [rows, sort]);

  return (
    <table className={`data lp-table${className ? ` ${className}` : ""}`}>
      <thead>
        <tr>
          <th>LP</th>
          <th>Class</th>
          <th onClick={() => onSortChange?.("commitment-desc")} style={{ cursor: "pointer" }}>
            Commitment{sort === "commitment-desc" ? " ↓" : ""}
          </th>
          <th onClick={() => onSortChange?.("contributed-desc")} style={{ cursor: "pointer" }}>
            Contributed{sort === "contributed-desc" ? " ↓" : ""}
          </th>
          <th>Distributed</th>
          <th onClick={() => onSortChange?.("dpi-desc")} style={{ cursor: "pointer" }}>
            DPI{sort === "dpi-desc" ? " ↓" : ""}
          </th>
          <th>IRR</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} onClick={() => onSelect?.(r.id)} style={onSelect ? { cursor: "pointer" } : undefined}>
            <td>{r.name}</td>
            <td className="mono">{r.className}</td>
            <td className="mono">{fmt(r.commitmentIdr)}</td>
            <td className="mono">{fmt(r.contributedIdr)}</td>
            <td className="mono">{fmt(r.distributedIdr)}</td>
            <td className="mono">{r.dpi.toFixed(2)}</td>
            <td className="mono">{r.irr != null ? `${(r.irr * 100).toFixed(1)}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
