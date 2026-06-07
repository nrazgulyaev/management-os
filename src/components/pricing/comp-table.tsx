"use client";

/**
 * Phase 2.4 mgmt-02 — CompTable.
 *
 * Comp-set table on /pricing/comp. Highlights the "us" row with
 * a sticky background. Sortable by similarity, ADR, occupancy.
 */

import * as React from "react";

export interface CompRow {
  id: string;
  isUs: boolean;
  name: string;
  source: "us" | "airbnb" | "booking-com" | "peer";
  similarity: number;
  adrUsd: number;
  occupancyPct?: number;
  beds: number;
}

export type CompSort = "similarity" | "adr" | "occupancy";

export interface CompTableProps {
  rows: CompRow[];
  className?: string;
}

const HEADERS: { key: CompSort | "name" | "beds" | "source"; label: string }[] = [
  { key: "name", label: "Listing" },
  { key: "source", label: "Source" },
  { key: "beds", label: "Beds" },
  { key: "similarity", label: "Similarity" },
  { key: "adr", label: "ADR USD" },
  { key: "occupancy", label: "Occupancy" },
];

export function CompTable({ rows, className }: CompTableProps) {
  const [sort, setSort] = React.useState<CompSort>("similarity");

  const sorted = React.useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (a.isUs) return -1;
      if (b.isUs) return 1;
      switch (sort) {
        case "similarity":
          return b.similarity - a.similarity;
        case "adr":
          return b.adrUsd - a.adrUsd;
        case "occupancy":
          return (b.occupancyPct ?? 0) - (a.occupancyPct ?? 0);
      }
    });
    return out;
  }, [rows, sort]);

  return (
    <table className={`data comp-table${className ? ` ${className}` : ""}`}>
      <thead>
        <tr>
          {HEADERS.map((h) => {
            const isSortable = h.key === "similarity" || h.key === "adr" || h.key === "occupancy";
            return (
              <th
                key={h.key}
                onClick={() => isSortable && setSort(h.key as CompSort)}
                style={isSortable ? { cursor: "pointer" } : undefined}
              >
                {h.label}
                {isSortable && sort === h.key ? " ↓" : ""}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} className={r.isUs ? "is-us" : ""}>
            <td>{r.name}</td>
            <td className="mono">{r.source}</td>
            <td className="mono">{r.beds}</td>
            <td className="mono">{r.similarity}</td>
            <td className="mono">${r.adrUsd}</td>
            <td className="mono">{r.occupancyPct != null ? `${r.occupancyPct}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
