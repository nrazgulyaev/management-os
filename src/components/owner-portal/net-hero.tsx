import * as React from "react";

/**
 * owner-02 — NetHero (detail). Light card, mockup-faithful: big serif net
 * number + sub line on the left, wire/payout meta on the right. Values arrive
 * pre-formatted (the page owns money formatting via compactMoney).
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
      <div>
        <div className="nh-label">{periodLabel}</div>
        <div className="nh-value">{valueText}</div>
        {subText && <div className="nh-sub">{subText}</div>}
      </div>
      {(wireLabel || wireWhen || wireRef) && (
        <div className="nh-rhs">
          {wireLabel && <div className="nh-pay">{wireLabel}</div>}
          {wireWhen && <div className="nh-when">{wireWhen}</div>}
          {wireRef && <div className="nh-ref">{wireRef}</div>}
        </div>
      )}
    </div>
  );
}
