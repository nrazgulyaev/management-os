"use client";

/**
 * Phase 2.4 dev-02 — BuyerDetail.
 *
 * Layout primitive that arranges profile / unit / activity bricks
 * for the /sales/buyer/[id] page. Bricks themselves come from the
 * Phase 2.1 DetailPage primitives; this component just composes
 * the layout + the lead-score chip.
 */

import * as React from "react";

export interface BuyerDetailProps {
  /** 0..100 — drives the lead-score chip color. */
  score: number;
  hot: boolean;
  source?: string;
  fundingKind?: string;
  /** Slot for profile fields (BrickList from Phase 2.1). */
  profile: React.ReactNode;
  /** Slot for active lead + units. */
  unitsBrick: React.ReactNode;
  /** Slot for activity feed. */
  activity: React.ReactNode;
  className?: string;
}

function toneFor(score: number): "ok" | "warn" | "danger" | "neutral" {
  if (score >= 80) return "ok";
  if (score >= 50) return "warn";
  if (score > 0) return "danger";
  return "neutral";
}

export function BuyerDetail({ score, hot, source, fundingKind, profile, unitsBrick, activity, className }: BuyerDetailProps) {
  const tone = toneFor(score);
  return (
    <div className={`buyer-detail${className ? ` ${className}` : ""}`}>
      <aside className="bd-side">
        <div className="bd-score">
          <span className={`bd-score-chip bd-score-${tone}`}>{score}</span>
          {hot && <span className="bd-hot mono">Hot</span>}
        </div>
        <dl className="bd-meta">
          {source && (
            <>
              <dt>Source</dt>
              <dd>{source}</dd>
            </>
          )}
          {fundingKind && (
            <>
              <dt>Funding</dt>
              <dd>{fundingKind}</dd>
            </>
          )}
        </dl>
        {profile}
      </aside>
      <main className="bd-main">
        <section className="bd-units">{unitsBrick}</section>
        <section className="bd-activity">{activity}</section>
      </main>
    </div>
  );
}
