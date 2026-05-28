"use client";

/**
 * Phase 2.4 mgmt-04 — JourneyTimeline.
 *
 * Vertical timeline of stay moments (welcome / activity / recovery
 * / departure / custom). Agent-curated moments arrive as drafts
 * and need a staff publish-click before they show on the guest
 * portal.
 */

import * as React from "react";

export type JourneyMomentKind = "welcome" | "activity" | "recovery" | "departure" | "custom";
export type JourneyMomentStatus = "draft" | "live";

export interface JourneyMoment {
  id: string;
  at: string;
  kind: JourneyMomentKind;
  title: string;
  description?: string;
  photoUrl?: string;
  status: JourneyMomentStatus;
}

export interface JourneyTimelineProps {
  moments: JourneyMoment[];
  onPublish?: (id: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  className?: string;
}

export function JourneyTimeline({ moments, onPublish, onDelete, className }: JourneyTimelineProps) {
  if (!moments.length) {
    return (
      <div className={`journey-timeline jt-empty${className ? ` ${className}` : ""}`}>
        No moments yet. The journey curator will create drafts as the stay progresses.
      </div>
    );
  }
  return (
    <ol className={`journey-timeline${className ? ` ${className}` : ""}`}>
      {moments.map((m) => (
        <li key={m.id} className={`jt-row jt-${m.kind} jt-${m.status}`}>
          <div className="jt-rail" aria-hidden>
            <span className="jt-dot" />
          </div>
          <div className="jt-body">
            <header className="jt-head">
              <span className="jt-kind mono">{m.kind}</span>
              <span className="jt-at mono">{m.at}</span>
              {m.status === "draft" && <span className="jt-status mono">draft</span>}
            </header>
            <h4 className="jt-title">{m.title}</h4>
            {m.description && <p className="jt-desc">{m.description}</p>}
            {m.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="jt-photo" src={m.photoUrl} alt={m.title} />
            )}
            {(onPublish || onDelete) && (
              <footer className="jt-actions">
                {m.status === "draft" && onPublish && (
                  <button type="button" className="btn btn-primary btn-xs" onClick={() => void onPublish(m.id)}>
                    Publish
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => void onDelete(m.id)}>
                    Delete
                  </button>
                )}
              </footer>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
