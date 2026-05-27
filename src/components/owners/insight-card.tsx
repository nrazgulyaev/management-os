"use client";

import * as React from "react";
import { RiskPill, type RiskLevel } from "./risk-pill";

/**
 * Phase 2.2 mgmt-03 — InsightCard.
 *
 * AI-flagged retention-risk panel that surfaces above the owner
 * detail's main content. Carries the signal kind + level + a one-
 * line explanation + Schedule call + Dismiss CTAs.
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

export function InsightCard({ insight, onSchedule, onDismiss, className }: InsightCardProps) {
  return (
    <div className={`insight-card level-${insight.level}${className ? ` ${className}` : ""}`}>
      <div className="ic-head">
        <RiskPill level={insight.level} />
        <span className="ic-kind mono">{insight.kind.replace(/_/g, " ")}</span>
        <span className="ic-when mono">{insight.firedAt}</span>
      </div>
      <div className="ic-body">{insight.message}</div>
      <div className="ic-actions">
        {onSchedule && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onSchedule}>
            Schedule call
          </button>
        )}
        {onDismiss && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss · with reason
          </button>
        )}
      </div>
    </div>
  );
}
