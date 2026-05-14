/**
 * Phase 1 — PatrolTimeline primitive.
 *
 * Timestamped event stream with status pills, used by Site Supervisor
 * (site reports, incidents, photo captures) and Security (patrol
 * events, camera alerts). Vertical timeline with timestamp on the
 * left, status icon in the middle, body card on the right.
 *
 * Server component. Empty state via `<EmptyState>`. Status tones map
 * to the existing semantic tokens.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PatrolEventStatus =
  | "ok"
  | "warn"
  | "alert"
  | "info"
  | "pending";

const STATUS_DOT: Record<PatrolEventStatus, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  alert: "bg-danger",
  info: "bg-info",
  pending: "bg-ink-tertiary",
};

const STATUS_PILL: Record<PatrolEventStatus, string> = {
  ok: "bg-success-weak text-success",
  warn: "bg-warning-weak text-warning",
  alert: "bg-danger-weak text-danger",
  info: "bg-info-weak text-info",
  pending: "bg-muted text-ink-tertiary",
};

const ICON_FOR_KIND: Record<string, LucideIcon> = {
  photo: Camera,
  incident: ShieldAlert,
  alert: AlertTriangle,
  check: CheckCircle2,
};

export interface PatrolEvent {
  id: string;
  /** Pre-formatted timestamp (e.g. "08:42", "Yesterday 17:10"). */
  timestamp: string;
  status: PatrolEventStatus;
  /** Short headline (1 line). */
  title: string;
  /** Optional body text (1–2 lines). */
  body?: string;
  /** Icon kind — controls the icon shown in the dot. */
  kind?: keyof typeof ICON_FOR_KIND;
  /** Optional click-through. */
  href?: string;
  /** Optional status-pill label (defaults to status). */
  statusLabel?: string;
}

export interface PatrolTimelineProps {
  events: PatrolEvent[];
  /** Heading shown above the timeline. */
  heading?: React.ReactNode;
  /** Empty-state copy. */
  emptyMessage?: string;
  /** Max events to render; older ones get a "show more" footer link. */
  maxVisible?: number;
  /** Optional href for the "show more" footer. */
  moreHref?: string;
  className?: string;
}

export function PatrolTimeline({
  events,
  heading,
  emptyMessage,
  maxVisible,
  moreHref,
  className,
}: PatrolTimelineProps) {
  const visible =
    typeof maxVisible === "number" ? events.slice(0, maxVisible) : events;
  const hidden = events.length - visible.length;
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden",
        className,
      )}
      data-stage10="patrol-timeline"
    >
      {heading && (
        <header className="px-5 md:px-6 py-4 border-b border-line-soft">
          {typeof heading === "string" ? (
            <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
              {heading}
            </h3>
          ) : (
            heading
          )}
        </header>
      )}
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-tertiary text-center">
          {emptyMessage ?? "Nothing logged yet."}
        </p>
      ) : (
        <ol className="px-5 md:px-6 py-4 flex flex-col gap-3">
          {visible.map((e) => {
            const Icon = e.kind ? ICON_FOR_KIND[e.kind] : Clock;
            const body = (
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex flex-col items-center pt-0.5">
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 text-ink-inverse",
                      STATUS_DOT[e.status],
                    )}
                    aria-hidden
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink truncate">
                      {e.title}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-ink-tertiary shrink-0">
                      {e.timestamp}
                    </span>
                  </div>
                  {e.body && (
                    <p className="text-xs text-ink-secondary leading-relaxed mt-0.5 line-clamp-2">
                      {e.body}
                    </p>
                  )}
                  {(e.statusLabel || e.status !== "info") && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-1.5",
                        STATUS_PILL[e.status],
                      )}
                    >
                      {e.statusLabel ?? e.status}
                    </span>
                  )}
                </div>
              </div>
            );
            return (
              <li key={e.id}>
                {e.href ? (
                  <Link
                    href={e.href}
                    className="block -mx-2 px-2 py-1 rounded-md hover:bg-muted/40 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="py-1">{body}</div>
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
            {hidden} more event{hidden === 1 ? "" : "s"} →
          </Link>
        </footer>
      )}
    </section>
  );
}
