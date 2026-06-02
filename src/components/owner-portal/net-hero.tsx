import * as React from "react";

/**
 * owner-02 — NetHero (detail), markup mirrors cabinets/owner-p1/02-statement.html:
 * `.net-hero > .lhs(.label, h2, .sub) + .rhs(.pay, .when, .ref)`. Gradient card,
 * 48px serif value. Values arrive pre-formatted (the page owns money formatting).
 */
export interface NetHeroProps {
  /** e.g. "Net to you · March 2026". */
  periodLabel: string;
  /** Pre-formatted, e.g. "IDR 142.5M". */
  valueText: string;
  subText?: React.ReactNode;
  wireLabel?: string;
  wireWhen?: string;
  wireRef?: string;
  className?: string;
}

export function NetHero({
  periodLabel,
  valueText,
  subText,
  wireLabel,
  wireWhen,
  wireRef,
  className,
}: NetHeroProps) {
  return (
    <div className={`net-hero${className ? ` ${className}` : ""}`}>
      <div className="lhs">
        <div className="label">{periodLabel}</div>
        <h2>{valueText}</h2>
        {subText && <div className="sub">{subText}</div>}
      </div>
      {(wireLabel || wireWhen || wireRef) && (
        <div className="rhs">
          {wireLabel && <div className="pay">{wireLabel}</div>}
          {wireWhen && <div className="when">{wireWhen}</div>}
          {wireRef && <div className="ref">{wireRef}</div>}
        </div>
      )}
    </div>
  );
}
