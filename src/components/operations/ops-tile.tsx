import * as React from "react";

/**
 * Phase 2.2 mgmt-04 — OpsTile.
 *
 * Polymorphic hero tile primitive. Label + big-num + context line +
 * optional footer. Used by OpsHero (3-tile arrangement) but also
 * stand-alone for cross-cabinet command-center widgets.
 */

export type OpsTileTone = "ink" | "accent" | "ok" | "warn" | "danger";

export interface OpsTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  context?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: OpsTileTone;
  /** Dark variant — inverted bg, used by the primary arrivals tile. */
  dark?: boolean;
  className?: string;
}

const TONE_CLASS: Record<OpsTileTone, string> = {
  ink: "",
  accent: "tone-accent",
  ok: "tone-ok",
  warn: "tone-warn",
  danger: "tone-danger",
};

export function OpsTile({ label, value, context, footer, tone = "ink", dark, className }: OpsTileProps) {
  return (
    <div className={`ops-tile ${TONE_CLASS[tone]}${dark ? " dark" : ""}${className ? ` ${className}` : ""}`}>
      <div className="ot-label">{label}</div>
      <div className="ot-value">{value}</div>
      {context && <div className="ot-context">{context}</div>}
      {footer && <div className="ot-footer">{footer}</div>}
    </div>
  );
}
