import * as React from "react";

/**
 * Phase 2.2 dev-04 — AgentRecommendBanner.
 *
 * Green strip rendered below the quote-compare grid by the
 * `vendor-matcher` agent. Carries the recommended winner + a
 * one-line rationale (e.g. "saves $24k vs runner-up").
 */

export interface AgentRecommendBannerProps {
  winner: string;
  rationale: string;
  /** 0..100. */
  confidence?: number;
  onAward?: () => void;
}

export function AgentRecommendBanner({
  winner,
  rationale,
  confidence,
  onAward,
}: AgentRecommendBannerProps) {
  return (
    <div className="agent-recommend-banner">
      <div className="arb-glyph" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </div>
      <div className="arb-body">
        <div className="arb-title">
          vendor-matcher · award to <b>{winner}</b>
        </div>
        <div className="arb-rationale">{rationale}</div>
      </div>
      {confidence !== undefined && (
        <span className="arb-confidence mono">CONFIDENCE {Math.round(confidence)}%</span>
      )}
      {onAward && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onAward}>
          Award PO →
        </button>
      )}
    </div>
  );
}
