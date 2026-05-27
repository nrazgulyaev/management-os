"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.3 owner-04 — PipelineList.
 *
 * Simplified booking list. Pairs with MonthCalendar above the
 * fold on /owner/calendar.
 */

export interface PipelineBooking {
  id: string;
  villaCode: string;
  dateLabel: string;
  guestOrLabel: string;
  nights: number;
  kind: "guest" | "owner_stay";
  state: "confirmed" | "requested" | "pending";
  href?: string;
}

export interface PipelineListProps {
  bookings: PipelineBooking[];
  className?: string;
  emptyLabel?: string;
}

const STATE_LABEL: Record<PipelineBooking["state"], string> = {
  confirmed: "Confirmed",
  requested: "Requested",
  pending: "Pending",
};

export function PipelineList({ bookings, className, emptyLabel = "Nothing on the books." }: PipelineListProps) {
  if (!bookings.length) {
    return <div className={`pipeline-list pl-empty${className ? ` ${className}` : ""}`}>{emptyLabel}</div>;
  }
  return (
    <div className={`pipeline-list${className ? ` ${className}` : ""}`}>
      {bookings.map((b) => {
        const Row = b.href ? Link : "div";
        const props = b.href ? { href: b.href } : {};
        return (
          // @ts-expect-error polymorphic Link/div
          <Row className={`pl-row pl-kind-${b.kind}`} key={b.id} {...props}>
            <div className="pl-villa mono">{b.villaCode}</div>
            <div className="pl-main">
              <div className="pl-guest">{b.guestOrLabel}</div>
              <div className="pl-meta mono">
                {b.dateLabel} · {b.nights}n
              </div>
            </div>
            <div className={`pl-state pl-state-${b.state}`}>{STATE_LABEL[b.state]}</div>
          </Row>
        );
      })}
    </div>
  );
}
