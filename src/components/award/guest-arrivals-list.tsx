/**
 * Mega-Sprint Phase 8 — GuestArrivalsList primitive.
 *
 * Timed list of expected guest arrivals (or departures) for a given
 * day. Each row carries the guest display name, party size, villa
 * code, channel chip, readiness pill, and an optional service-
 * request flag. Used by Front Office (today) and Concierge (today /
 * tomorrow).
 *
 * Server component. The icon column doubles as a status dot for the
 * readiness state. Empty state renders a friendly "no arrivals" line.
 */

import * as React from "react";
import Link from "next/link";
import { BellRing, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type GuestArrivalReadiness =
  | "ready"
  | "in_progress"
  | "blocked"
  | "unknown";

const READINESS_STYLE: Record<
  GuestArrivalReadiness,
  { dot: string; pill: string; label: string }
> = {
  ready: {
    dot: "bg-success",
    pill: "bg-success-weak text-success",
    label: "Ready",
  },
  in_progress: {
    dot: "bg-info",
    pill: "bg-info-weak text-info",
    label: "In progress",
  },
  blocked: {
    dot: "bg-danger",
    pill: "bg-danger-weak text-danger",
    label: "Blocked",
  },
  unknown: {
    dot: "bg-ink-tertiary",
    pill: "bg-muted text-ink-tertiary",
    label: "—",
  },
};

export interface GuestArrivalItem {
  id: string;
  /** Guest display name. */
  guestDisplay: string;
  /** Number of guests on the booking. */
  guestsCount: number;
  /** Villa label (code or name). */
  villaCode: string;
  /** Optional project / property subtitle. */
  villaSubtitle?: string;
  /** Optional channel name (Booking.com / Direct / Airbnb / etc.). */
  channelName?: string | null;
  /** Optional pre-formatted ETA chip (e.g. "14:00", "Tomorrow 16:30"). */
  timestamp?: string;
  readiness?: GuestArrivalReadiness;
  /** When true, renders a small bell icon flagging an open service request. */
  hasOpenServiceRequest?: boolean;
  /** Optional click-through (drills into the booking detail). */
  href?: string;
}

export interface GuestArrivalsListProps {
  items: GuestArrivalItem[];
  /** Optional heading rendered above the list. */
  heading?: React.ReactNode;
  /** Optional accessory rendered top-right of the header. */
  accessory?: React.ReactNode;
  /** Empty-state copy. */
  emptyMessage?: string;
  /** Max items to render; older ones get a "show more" footer link. */
  maxVisible?: number;
  /** Optional href for the "show more" footer. */
  moreHref?: string;
  className?: string;
}

export function GuestArrivalsList({
  items,
  heading,
  accessory,
  emptyMessage,
  maxVisible,
  moreHref,
  className,
}: GuestArrivalsListProps) {
  const visible =
    typeof maxVisible === "number" ? items.slice(0, maxVisible) : items;
  const hidden = items.length - visible.length;
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden",
        className,
      )}
      data-stage10="guest-arrivals-list"
    >
      {(heading || accessory) && (
        <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
          {heading ? (
            typeof heading === "string" ? (
              <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
                {heading}
              </h3>
            ) : (
              heading
            )
          ) : (
            <span />
          )}
          {accessory && <div className="shrink-0">{accessory}</div>}
        </header>
      )}
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-tertiary text-center">
          {emptyMessage ?? "No arrivals."}
        </p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {visible.map((item) => {
            const style =
              READINESS_STYLE[item.readiness ?? "unknown"];
            const body = (
              <div className="flex items-center gap-3 px-5 md:px-6 py-3.5">
                <span
                  className={cn(
                    "shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center",
                    style.dot,
                  )}
                  aria-hidden
                >
                  <span className="text-[10px] font-mono text-ink-inverse leading-none">
                    {item.guestsCount}
                  </span>
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-ink truncate">
                      {item.guestDisplay}
                    </span>
                    {item.hasOpenServiceRequest && (
                      <BellRing
                        className="w-3.5 h-3.5 text-warning shrink-0"
                        strokeWidth={1.75}
                      />
                    )}
                  </div>
                  <div className="text-[11px] text-ink-tertiary flex items-center gap-2 min-w-0">
                    <span className="font-mono">{item.villaCode}</span>
                    {item.villaSubtitle && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{item.villaSubtitle}</span>
                      </>
                    )}
                    {item.channelName && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{item.channelName}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users
                        className="w-3 h-3"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      {item.guestsCount}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  {item.timestamp && (
                    <span className="text-[11px] font-mono tabular-nums text-ink-tertiary">
                      {item.timestamp}
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      style.pill,
                    )}
                  >
                    {style.label}
                  </span>
                </div>
              </div>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="block hover:bg-muted/40 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
      {hidden > 0 && moreHref && (
        <footer className="px-5 md:px-6 py-3 border-t border-line-soft text-xs text-ink-tertiary">
          <Link
            href={moreHref}
            className="hover:text-ink hover:underline underline-offset-4"
          >
            {hidden} more arrival{hidden === 1 ? "" : "s"} →
          </Link>
        </footer>
      )}
    </section>
  );
}
