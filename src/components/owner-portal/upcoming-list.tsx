import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.3 owner-01 — UpcomingList.
 *
 * Simplified upcoming-bookings list for the owner home. Date + guest
 * + villa + nights. Click → opens /owner/bookings detail.
 */

export interface UpcomingListItem {
  id: string;
  href: string;
  /** Pretty date label (e.g. "27 May · Mon"). */
  dateLabel: string;
  guest: string;
  villaCode: string;
  nights: number;
  /** "Arriving" / "Departing" / "In stay". */
  state?: string;
}

export interface UpcomingListProps {
  items: UpcomingListItem[];
  emptyMessage?: React.ReactNode;
  className?: string;
}

/**
 * Maps the raw booking / owner-stay status to a HandoffBadge variant +
 * label, matching the mock's pill column (Arriving / Pre-arrival / …).
 */
function stateBadge(state?: string): { label: string; variant: string } | null {
  switch (state) {
    case "checked_in":
      return { label: "In stay", variant: "ub-ok" };
    case "confirmed":
      return { label: "Arriving", variant: "ub-ok" };
    case "approved":
      return { label: "Your stay", variant: "ub-info" };
    case "requested":
      return { label: "Requested", variant: "ub-gold" };
    default:
      return state ? { label: "Pre-arrival", variant: "ub-info" } : null;
  }
}

export function UpcomingList({ items, emptyMessage, className }: UpcomingListProps) {
  if (items.length === 0) {
    return (
      <div className={`upcoming-list empty${className ? ` ${className}` : ""}`}>
        {emptyMessage ?? "Nothing on the horizon."}
      </div>
    );
  }
  return (
    <ul className={`upcoming-list${className ? ` ${className}` : ""}`}>
      {items.map((it) => {
        const badge = stateBadge(it.state);
        return (
          <li key={it.id}>
            <Link href={it.href}>
              <span className="when mono">{it.dateLabel}</span>
              <span className="who">
                <span className="guest">{it.guest}</span>
                <span className="nights"> · {it.nights} night{it.nights === 1 ? "" : "s"}</span>
                <span className="where">{it.villaCode}</span>
              </span>
              {badge && <span className={`ub-badge ${badge.variant}`}>{badge.label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
