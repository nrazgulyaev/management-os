"use client";

/**
 * Phase 2.4 dev-01 — WeeklyReportPDF (web preview).
 *
 * The final PDF is produced by @react-pdf/renderer in the data PR;
 * this component is the HTML preview shown on
 * /site/[projectId]/week/[isoWeek]. It renders the same layout the
 * PDF will use so design + content review can happen before sign-
 * off.
 *
 * Construction lead approval gates send (Critical UX rule 4) —
 * the page-level Approve button calls server actions.
 */

import * as React from "react";

export interface WeeklyReportHero {
  id: string;
  photoUrl?: string;
  caption: string;
  takenAt: string;
}

export interface WeeklyReportKpi {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
}

export interface WeeklyReportProps {
  projectName: string;
  isoWeek: string;
  heroFrames: WeeklyReportHero[];
  kpis: WeeklyReportKpi[];
  summary: string;
  approvedByName?: string | null;
  approvedAtLabel?: string;
  excludedCount?: number;
}

export function WeeklyReportPDF({
  projectName,
  isoWeek,
  heroFrames,
  kpis,
  summary,
  approvedByName,
  approvedAtLabel,
  excludedCount,
}: WeeklyReportProps) {
  return (
    <article className="weekly-report">
      <header className="wr-head">
        <div>
          <div className="wr-project">{projectName}</div>
          <h1 className="wr-title">Week {isoWeek}</h1>
        </div>
        <div className="wr-approval mono">
          {approvedByName ? `Approved by ${approvedByName} · ${approvedAtLabel}` : "Draft — pending approval"}
        </div>
      </header>

      {kpis.length > 0 && (
        <ul className="wr-kpis">
          {kpis.map((k, i) => (
            <li key={i} className={`wr-kpi wr-kpi-${k.tone ?? "neutral"}`}>
              <span className="wr-kpi-label mono">{k.label}</span>
              <span className="wr-kpi-value mono">{k.value}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="wr-summary">{summary}</p>

      {heroFrames.length > 0 && (
        <section className="wr-hero-grid">
          {heroFrames.map((f) => (
            <figure key={f.id} className="wr-hero">
              {f.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.photoUrl} alt={f.caption} />
              ) : (
                <div className="wr-hero-empty mono">No photo</div>
              )}
              <figcaption>
                <span className="wr-hero-caption">{f.caption}</span>
                <span className="wr-hero-when mono">{f.takenAt}</span>
              </figcaption>
            </figure>
          ))}
        </section>
      )}

      {excludedCount != null && excludedCount > 0 && (
        <footer className="wr-foot mono">
          {excludedCount} frame(s) excluded for missing GPS (Critical UX rule 5).
        </footer>
      )}
    </article>
  );
}
