"use client";

/**
 * Phase 2.4 dev-01 — IncidentDetail.
 *
 * Server-rendered detail page brick. Renders the frame photo +
 * severity pill + impact JSON + decision log + linked RFI link.
 *
 * Status badges follow the open / in-progress / resolved ladder.
 */

import * as React from "react";

export type IncidentStatus = "open" | "in_progress" | "resolved";

export interface IncidentImpact {
  scheduleDays?: number;
  costIdr?: number;
  crewRedirect?: string;
}

export interface IncidentDecisionEntry {
  id: string;
  at: string;
  actorName: string;
  note: string;
}

export interface IncidentDetailProps {
  incidentId: string;
  status: IncidentStatus;
  severity: "p1" | "p2" | "p3" | "info";
  caption: string;
  narration?: string;
  photoUrl?: string;
  takenAt: string;
  reporterName: string;
  impact?: IncidentImpact;
  decisionLog: IncidentDecisionEntry[];
  linkedRfi?: { id: string; href: string; label: string };
  onResolve?: () => Promise<void> | void;
}

export function IncidentDetail({
  status,
  severity,
  caption,
  narration,
  photoUrl,
  takenAt,
  reporterName,
  impact,
  decisionLog,
  linkedRfi,
  onResolve,
}: IncidentDetailProps) {
  return (
    <article className="incident-detail">
      <header className="id-head">
        <span className={`id-severity id-sev-${severity}`}>{severity.toUpperCase()}</span>
        <span className={`id-status id-status-${status}`}>{status.replace("_", " ")}</span>
        <span className="id-meta mono">{reporterName} · {takenAt}</span>
      </header>
      <h2 className="id-title">{caption}</h2>
      {narration && <p className="id-narration">{narration}</p>}
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={caption} className="id-photo" />
      )}
      {impact && (
        <dl className="id-impact">
          {impact.scheduleDays != null && (
            <>
              <dt>Schedule</dt>
              <dd>{impact.scheduleDays}d</dd>
            </>
          )}
          {impact.costIdr != null && (
            <>
              <dt>Cost</dt>
              <dd>{impact.costIdr.toLocaleString()} IDR</dd>
            </>
          )}
          {impact.crewRedirect && (
            <>
              <dt>Crew</dt>
              <dd>{impact.crewRedirect}</dd>
            </>
          )}
        </dl>
      )}
      {linkedRfi && (
        <a className="id-rfi" href={linkedRfi.href}>
          Linked RFI · {linkedRfi.label}
        </a>
      )}
      <section className="id-log">
        <h3 className="id-log-title">Decision log</h3>
        {decisionLog.length === 0 ? (
          <div className="id-log-empty mono">No entries yet.</div>
        ) : (
          <ol className="id-log-list">
            {decisionLog.map((e) => (
              <li key={e.id} className="id-log-row">
                <span className="id-log-when mono">{e.at}</span>
                <span className="id-log-actor mono">{e.actorName}</span>
                <span className="id-log-note">{e.note}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {status !== "resolved" && onResolve && (
        <footer className="id-foot">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void onResolve()}>
            Mark resolved
          </button>
        </footer>
      )}
    </article>
  );
}
