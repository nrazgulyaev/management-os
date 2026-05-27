import * as React from "react";

/**
 * Phase 2.2 mgmt-01 — ChannelPill.
 *
 * 5 brand-tinted variants matching the booking channels in scope:
 * Airbnb red · Booking.com blue · Agoda red-orange · Direct ink ·
 * Travel agent gold.
 */

export type ChannelKind = "airbnb" | "bcom" | "agoda" | "direct" | "ta";

const LABEL: Record<ChannelKind, string> = {
  airbnb: "Airbnb",
  bcom: "Booking.com",
  agoda: "Agoda",
  direct: "Direct",
  ta: "Travel agent",
};

export interface ChannelPillProps {
  kind: ChannelKind;
  className?: string;
}

export function ChannelPill({ kind, className }: ChannelPillProps) {
  return (
    <span className={`channel-pill ${kind}${className ? ` ${className}` : ""}`}>
      <span className="dot" aria-hidden />
      {LABEL[kind]}
    </span>
  );
}
