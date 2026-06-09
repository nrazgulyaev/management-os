"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { type RiskLevel } from "./risk-pill";

/**
 * Phase 2.2 mgmt-03 — InsightCard.
 *
 * AI-flagged retention-risk panel that surfaces above the owner
 * detail's main content. Carries the signal kind + level + a one-
 * line explanation + Schedule call + Dismiss CTAs.
 *
 * Pixel target: cabinets/mgmt-p1/owners.html `.insight-card` — warm
 * gradient panel, accent eyebrow ("Owner Intelligence · flagged Nd
 * ago"), a Newsreader headline, body copy, a mono run/confidence meta
 * line and the two CTAs. The styling lives in
 * src/styles/components/owners.css; this component owns the markup +
 * the kind→headline copy mapping.
 */

export interface OwnerInsight {
  id: string;
  kind: string;
  level: RiskLevel;
  /** Plain-English explanation. */
  message: React.ReactNode;
  /** ISO timestamp the signal fired. */
  firedAt: string;
}

export interface InsightCardProps {
  insight: OwnerInsight;
  onSchedule?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/** Maps a raw signal `kind` to the headline shown in the mock. */
const KIND_HEADLINE: Record<string, string> = {
  payout_drift: "Payout drift detected",
  occupancy_regression: "Occupancy regression detected",
  portal_disengagement: "Portal disengagement detected",
  statement_dispute: "Statement dispute open",
  maintenance: "Maintenance escalations open",
};

function headlineFor(kind: string): string {
  return (
    KIND_HEADLINE[kind] ??
    `${kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())} detected`
  );
}

/** "flagged 6d ago" / "flagged today" from the ISO fired-at date. */
function firedAgoLabel(firedAt: string): string {
  const fired = new Date(firedAt);
  if (Number.isNaN(fired.getTime())) return "flagged recently";
  const days = Math.max(
    0,
    Math.round((Date.now() - fired.getTime()) / 86_400_000),
  );
  if (days <= 0) return "flagged today";
  if (days === 1) return "flagged 1d ago";
  return `flagged ${days}d ago`;
}

export function InsightCard({ insight, onSchedule, onDismiss, className }: InsightCardProps) {
  return (
    <div className={`insight-card level-${insight.level}${className ? ` ${className}` : ""}`}>
      <div className="ic-eyebrow">
        <Sparkles className="w-3 h-3" strokeWidth={2} aria-hidden />
        Owner Intelligence · {firedAgoLabel(insight.firedAt)}
      </div>
      <h4 className="ic-head">{headlineFor(insight.kind)}</h4>
      <p className="ic-body">{insight.message}</p>
      <div className="ic-meta">
        SIGNAL <span className="mono">{insight.kind.replace(/_/g, " ")}</span> ·{" "}
        {insight.level.toUpperCase()}
      </div>
      {(onSchedule || onDismiss) && (
        <div className="ic-actions">
          {onSchedule && (
            <button type="button" className="btn btn-accent btn-sm" onClick={onSchedule}>
              Schedule call
            </button>
          )}
          {onDismiss && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
              Dismiss insight
            </button>
          )}
        </div>
      )}
    </div>
  );
}
