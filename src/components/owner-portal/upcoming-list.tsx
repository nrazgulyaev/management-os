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
      {items.map((it) => (
        <li key={it.id}>
          <Link href={it.href}>
            <span className="when mono">{it.dateLabel}</span>
            <span className="who">{it.guest}</span>
            <span className="where mono">{it.villaCode}</span>
            <span className="nights mono">{it.nights}n</span>
            {it.state && <span className="state mono">{it.state}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
