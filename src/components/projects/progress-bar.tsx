import * as React from "react";

/**
 * Phase 2.2 dev-01 — ProgressBar.
 *
 * Value + percentage + label combo. Used on project cards to show
 * schedule progress, budget burn, etc. Renders as a fixed-height
 * track with an inline fill bar.
 */

export interface ProgressBarProps {
  /** 0..100 — clamped. */
  pct: number;
  /** Right-aligned numeric label (e.g. "$1.42M of $2.45M"). */
  label?: React.ReactNode;
  /** Left-aligned descriptor (e.g. "Budget"). */
  caption?: React.ReactNode;
  /** Tone classifies the bar fill (default = accent). */
  tone?: "accent" | "ok" | "warn" | "danger";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  accent: "",
  ok: "ok",
  warn: "warn",
  danger: "danger",
};

export function ProgressBar({ pct, label, caption, tone = "accent", className }: ProgressBarProps) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div className={`progress-bar ${TONE_CLASS[tone]}${className ? ` ${className}` : ""}`}>
      {(caption || label) && (
        <div className="progress-bar-row">
          {caption && <span className="caption">{caption}</span>}
          {label && <span className="lbl">{label}</span>}
        </div>
      )}
      <div className="track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
