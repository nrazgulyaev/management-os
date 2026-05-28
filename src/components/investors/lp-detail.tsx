"use client";

/**
 * Phase 2.4 dev-03 — LpDetail.
 *
 * Layout primitive for /investors/lp/[id]. KPI strip (DPI / TVPI /
 * MOIC / IRR) + slots for commitments, capital calls, distributions,
 * documents.
 */

import * as React from "react";

export interface LpDetailKpi {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
}

export interface LpDetailProps {
  name: string;
  className: string;
  kpis: LpDetailKpi[];
  commitmentsSlot: React.ReactNode;
  callsSlot: React.ReactNode;
  distributionsSlot: React.ReactNode;
  documentsSlot: React.ReactNode;
}

export function LpDetail({ name, className, kpis, commitmentsSlot, callsSlot, distributionsSlot, documentsSlot }: LpDetailProps) {
  return (
    <article className="lp-detail">
      <header className="ld-head">
        <div className="ld-class mono">{className}</div>
        <h1 className="ld-name">{name}</h1>
      </header>
      <ul className="ld-kpis">
        {kpis.map((k, i) => (
          <li key={i} className={`ld-kpi ld-kpi-${k.tone ?? "neutral"}`}>
            <span className="ld-kpi-label mono">{k.label}</span>
            <span className="ld-kpi-value mono">{k.value}</span>
          </li>
        ))}
      </ul>
      <section className="ld-section">
        <h3 className="ld-section-title mono">Commitments</h3>
        {commitmentsSlot}
      </section>
      <section className="ld-section">
        <h3 className="ld-section-title mono">Capital calls</h3>
        {callsSlot}
      </section>
      <section className="ld-section">
        <h3 className="ld-section-title mono">Distributions</h3>
        {distributionsSlot}
      </section>
      <section className="ld-section">
        <h3 className="ld-section-title mono">Documents</h3>
        {documentsSlot}
      </section>
    </article>
  );
}
