"use client";

/**
 * Phase 2.4 mgmt-03 — GuestCard.
 *
 * Tile rendered in each column of the TodayBoard. Three flavours:
 *   ready   — green check, all docs verified
 *   flag    — gold warn, visa or doc gap
 *   problem — red danger, overstay / unresolved
 *
 * The card surfaces the next-action label so ops can sweep across
 * the board top-to-bottom without opening detail screens.
 */

import * as React from "react";
import Link from "next/link";

export type GuestCardFlavour = "ready" | "flag" | "problem";

export interface GuestCardProps {
  bookingId: string;
  villaCode: string;
  guestName: string;
  partySize: number;
  nights: number;
  /** Local time HH:mm */
  windowLabel: string;
  flavour: GuestCardFlavour;
  /** Optional badge ("VIP", "Repeat") */
  badge?: string;
  /** Suggested next action ("Run OCR", "Hand over keys"). */
  nextAction?: string;
  href?: string;
  className?: string;
}

export function GuestCard({
  bookingId,
  villaCode,
  guestName,
  partySize,
  nights,
  windowLabel,
  flavour,
  badge,
  nextAction,
  href,
  className,
}: GuestCardProps) {
  const Wrap = href ? Link : "div";
  const props = href ? { href } : {};
  return (
    // @ts-expect-error polymorphic Link/div
    <Wrap className={`fo-card fo-${flavour}${className ? ` ${className}` : ""}`} {...props} data-booking={bookingId}>
      <header className="fo-head">
        <span className="fo-villa mono">{villaCode}</span>
        <span className="fo-window mono">{windowLabel}</span>
      </header>
      <div className="fo-main">
        <div className="fo-name">{guestName}</div>
        <div className="fo-meta mono">
          {partySize} pax · {nights}n
        </div>
      </div>
      {(badge || nextAction) && (
        <footer className="fo-foot">
          {badge && <span className="fo-badge mono">{badge}</span>}
          {nextAction && <span className="fo-next">{nextAction}</span>}
        </footer>
      )}
    </Wrap>
  );
}
