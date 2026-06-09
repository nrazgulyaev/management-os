/**
 * CRM ACTIVITY TIMELINE (#169) — <RecordTimeline> primitive.
 *
 * A chronological activity feed for a single CRM subject (owner / contact /
 * lead / buyer). Renders a vertical timeline with per-kind icons + a rail,
 * newest first. This is the visual half of the relationship-layer spine; the
 * data half is `@/features/crm-activity/services`.
 *
 * Distinct from `<Timeline>` (lifecycle STAGE tracker) and `<DetailActivity>`
 * (owner-detail brick that takes pre-rendered `when`/`what` strings). This one
 * is driven directly by `CrmActivityView` rows so any surface can mount it.
 *
 * Server component — pure render, no client state. Tokens only (cream/stone/
 * ink + accent/success/danger); no raw bg-black; no inline style.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  StickyNote,
  MessageSquare,
  ArrowRightLeft,
  Phone,
  CheckSquare,
  Mail,
  Circle,
} from "lucide-react";
import type {
  CrmActivityKind,
  CrmActivityView,
} from "@/features/crm-activity/types";

const ICON_FOR: Record<CrmActivityKind, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  message: MessageSquare,
  status_change: ArrowRightLeft,
  call: Phone,
  task: CheckSquare,
  email: Mail,
};

/** Dot/icon chip color per kind — Layer-B tokens only. */
const TONE_FOR: Record<CrmActivityKind, string> = {
  note: "bg-surface text-ink-secondary border-line-soft",
  message: "bg-accent/10 text-accent border-accent/30",
  status_change: "bg-accent/10 text-accent border-accent/30",
  call: "bg-success/10 text-success border-success/30",
  task: "bg-surface text-ink-secondary border-line-soft",
  email: "bg-accent/10 text-accent border-accent/30",
};

const KIND_LABEL: Record<CrmActivityKind, string> = {
  note: "Note",
  message: "Message",
  status_change: "Status",
  call: "Call",
  task: "Task",
  email: "Email",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export interface RecordTimelineProps {
  activities: CrmActivityView[];
  className?: string;
  /** Empty-state copy. */
  emptyLabel?: string;
}

export function RecordTimeline({
  activities,
  className,
  emptyLabel = "No activity yet.",
}: RecordTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className={cn("text-sm text-ink-tertiary italic", className)} data-empty>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol className={cn("flex flex-col", className)} role="list">
      {activities.map((a, i) => {
        const last = i === activities.length - 1;
        const Icon = ICON_FOR[a.kind] ?? Circle;
        const tone = TONE_FOR[a.kind] ?? TONE_FOR.note;
        return (
          <li key={a.id} className="flex gap-3 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "w-8 h-8 rounded-full border flex items-center justify-center shrink-0",
                  tone,
                )}
                aria-hidden
              >
                <Icon className="w-4 h-4" />
              </span>
              {!last && (
                <span aria-hidden className="w-px flex-1 mt-1 bg-line-soft" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  {KIND_LABEL[a.kind] ?? "Event"}
                  {a.actorName ? ` · ${a.actorName}` : ""}
                </span>
                <span className="text-xs text-ink-tertiary tabular-nums shrink-0">
                  {relativeTime(a.occurredAt)}
                </span>
              </div>
              <div className="text-sm text-ink font-medium mt-0.5 break-words">
                {a.title}
              </div>
              {a.body && (
                <p className="text-sm text-ink-secondary mt-1 whitespace-pre-wrap break-words leading-relaxed">
                  {a.body}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
