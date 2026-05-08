/**
 * Stage 10.B — MobileTaskCard primitive.
 *
 * Phone-shaped task card. Single primary action visible at a glance,
 * thumb-zone friendly. Status surfaced as left-border color (Properly
 * pattern), photo / location stamps stack inline (Procore daily-log
 * pattern).
 *
 * Used by: 10.D Cleaner turnover list, 10.F PM site reports,
 * warehouse receive/pick (backlog).
 *
 * Reference patterns: Properly checklist task, Breezeway turnover
 * card, Turno cleaner board card (research-summary.md theme 1 +
 * reference-apps/cleaner.md).
 *
 * Server component (presentation only). Action wired by parent.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Camera, MapPin, Mic, Clock } from "lucide-react";

export type MobileTaskStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "complete";

export interface MobileTaskCardProps {
  title: string;
  subtitle?: string;
  status: MobileTaskStatus;
  /** When the task is scheduled (e.g. "11:00", "Today 14:30"). */
  when?: string;
  /** Free-form right-side meta (e.g. "2BR · 150m²"). */
  meta?: string;
  /** Photos already attached. */
  photoCount?: number;
  hasLocation?: boolean;
  hasVoiceNote?: boolean;
  /** Primary action button label, e.g. "Start", "Continue", "Done". */
  actionLabel?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}

const STATUS_BORDER: Record<MobileTaskStatus, string> = {
  pending: "border-l-line-strong",
  in_progress: "border-l-accent",
  blocked: "border-l-danger",
  complete: "border-l-success",
};

const STATUS_LABEL: Record<MobileTaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  complete: "Done",
};

const STATUS_TONE: Record<MobileTaskStatus, string> = {
  pending: "text-ink-secondary",
  in_progress: "text-accent",
  blocked: "text-danger",
  complete: "text-success",
};

export function MobileTaskCard({
  title,
  subtitle,
  status,
  when,
  meta,
  photoCount = 0,
  hasLocation = false,
  hasVoiceNote = false,
  actionLabel,
  href,
  onClick,
  className,
}: MobileTaskCardProps) {
  const interactive = Boolean(href || onClick);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs">
            {when && (
              <span className="inline-flex items-center gap-0.5 text-ink-tertiary tabular-nums">
                <Clock className="w-3 h-3" />
                {when}
              </span>
            )}
            <span
              className={cn(
                "ml-auto sm:ml-2 font-medium",
                STATUS_TONE[status],
              )}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
          <h3 className="text-base font-medium text-ink truncate mt-1">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-ink-secondary mt-0.5 truncate">
              {subtitle}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-ink-tertiary">
            {photoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="w-3.5 h-3.5" />
                {photoCount}
              </span>
            )}
            {hasLocation && <MapPin className="w-3.5 h-3.5" aria-label="GPS stamped" />}
            {hasVoiceNote && <Mic className="w-3.5 h-3.5" aria-label="Voice memo attached" />}
            {meta && <span className="truncate">{meta}</span>}
          </div>
        </div>
        {interactive && (
          <ChevronRight
            className="w-5 h-5 text-ink-tertiary shrink-0 self-center"
            aria-hidden
          />
        )}
      </div>
      {actionLabel && interactive && (
        <div className="mt-3 inline-flex items-center text-sm font-medium text-accent">
          {actionLabel} →
        </div>
      )}
    </>
  );

  const baseCls = cn(
    "block bg-surface border border-line-soft border-l-4 rounded-md p-4",
    STATUS_BORDER[status],
    interactive &&
      "active:bg-muted active:translate-y-[1px] transition-all min-h-[88px]",
    className,
  );

  if (href) {
    return (
      <a href={href} className={cn(baseCls, "no-underline text-ink")}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(baseCls, "text-left w-full")}>
        {body}
      </button>
    );
  }
  return <div className={baseCls}>{body}</div>;
}
