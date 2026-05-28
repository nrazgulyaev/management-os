"use client";

/**
 * Phase 2.4 mgmt-03 — RegistryTable.
 *
 * ID + visa registry. One row per guest with documents on file.
 * Rendered with visa flag pills + VIP star + bookings count.
 *
 * Used on /front-office/registry. The page-level tax export
 * banner reads its blocking-flag IDs from evaluateTaxExportGate().
 */

import * as React from "react";

export type RegistryDocType = "passport" | "kitas" | "ktp";

export interface RegistryFlag {
  id: string;
  kind: "voa_expiring" | "overstay" | "kitas_check";
  severity: "warn" | "p1";
  detail?: string;
  resolved?: boolean;
}

export interface RegistryRow {
  id: string;
  guestName: string;
  nationality: string;
  documents: { type: RegistryDocType; expiresAt?: string }[];
  vip: boolean;
  flags: RegistryFlag[];
  staysCount: number;
}

export interface RegistryTableProps {
  rows: RegistryRow[];
  onSelect?: (id: string) => void;
  className?: string;
}

export function RegistryTable({ rows, onSelect, className }: RegistryTableProps) {
  return (
    <table className={`data registry-table${className ? ` ${className}` : ""}`}>
      <thead>
        <tr>
          <th>Guest</th>
          <th>Nationality</th>
          <th>Documents</th>
          <th>Visa flags</th>
          <th>Stays</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const unresolved = r.flags.filter((f) => !f.resolved);
          const worst = unresolved.some((f) => f.severity === "p1") ? "p1" : unresolved.length ? "warn" : null;
          return (
            <tr
              key={r.id}
              onClick={() => onSelect?.(r.id)}
              className={worst ? `is-${worst}` : ""}
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <td>
                {r.vip && <span className="rt-vip mono" aria-label="VIP">★</span>}
                {r.guestName}
              </td>
              <td className="mono">{r.nationality}</td>
              <td className="mono">
                {r.documents.map((d, i) => (
                  <span key={i} className={`rt-doc rt-doc-${d.type}`}>
                    {d.type}
                    {d.expiresAt && <span className="rt-doc-expires"> · exp {d.expiresAt}</span>}
                  </span>
                ))}
              </td>
              <td className="mono">
                {unresolved.length === 0 && <span className="rt-flag rt-flag-ok">clear</span>}
                {unresolved.map((f) => (
                  <span key={f.id} className={`rt-flag rt-flag-${f.severity}`}>
                    {f.kind.replace("_", " ")}
                  </span>
                ))}
              </td>
              <td className="mono">{r.staysCount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
