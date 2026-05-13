/**
 * Sprint 4 — TeamRowList primitive.
 *
 * Reference 2 "Team Collaboration" pattern: avatar + name + secondary
 * line ("Working on Github Project Repository") + status pill on the
 * right (Completed / In Progress / Pending).
 *
 * Server component. Items render as <Link>s when `href` is set, or
 * plain rows otherwise. Avatars fall back to initials when no URL is
 * supplied.
 *
 * Status-pill tones reuse the Stage 10.6.C.1 semantic tokens.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type TeamRowStatus =
  | "completed"
  | "in_progress"
  | "pending"
  | "blocked"
  | "neutral";

const STATUS_LABEL: Record<TeamRowStatus, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  pending: "Pending",
  blocked: "Blocked",
  neutral: "—",
};

const STATUS_TONE: Record<TeamRowStatus, string> = {
  completed: "bg-success-weak text-success border border-success/30",
  in_progress: "bg-info-weak text-info border border-info/30",
  pending: "bg-warning-weak text-warning border border-warning/30",
  blocked: "bg-danger-weak text-danger border border-danger/30",
  neutral: "bg-muted text-ink-tertiary border border-line-soft",
};

export interface TeamRowItem {
  /** Display name (used for initials fallback if avatar absent). */
  name: string;
  /** Optional avatar URL. Falls back to initials chip. */
  avatarUrl?: string;
  /** Secondary line ("Working on Github Project Repository"). */
  workingOn?: React.ReactNode;
  /** Status pill on the right. */
  status?: TeamRowStatus;
  /** Optional override for the status label (e.g. "Working on tax review"). */
  statusLabel?: string;
  /** Optional href — renders the row as a clickable Link. */
  href?: string;
}

export interface TeamRowListProps {
  items: TeamRowItem[];
  /** Optional heading row "Team Collaboration" + accessory action. */
  heading?: React.ReactNode;
  /** Optional right-aligned accessory in the header (e.g. Add Member button). */
  accessory?: React.ReactNode;
  /** Empty-state copy when items is []. */
  emptyMessage?: string;
  className?: string;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function RowBody({ item }: { item: TeamRowItem }) {
  const status = item.status ?? "neutral";
  const tone = STATUS_TONE[status];
  const label = item.statusLabel ?? STATUS_LABEL[status];
  return (
    <span className="flex items-center gap-3 min-w-0">
      {item.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.avatarUrl}
          alt=""
          className="w-9 h-9 rounded-full object-cover shrink-0"
        />
      ) : (
        <span className="w-9 h-9 rounded-full bg-accent-weak text-accent flex items-center justify-center text-xs font-medium shrink-0">
          {initials(item.name) || "·"}
        </span>
      )}
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium text-ink truncate">
          {item.name}
        </span>
        {item.workingOn && (
          <span className="text-xs text-ink-tertiary truncate">
            {item.workingOn}
          </span>
        )}
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium tabular-nums shrink-0",
          tone,
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function TeamRowList({
  items,
  heading,
  accessory,
  emptyMessage,
  className,
}: TeamRowListProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card",
        className,
      )}
      data-stage10="team-row-list"
    >
      {(heading || accessory) && (
        <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
          {heading ? (
            typeof heading === "string" ? (
              <h3 className="text-display text-[20px] md:text-[22px] leading-tight font-medium text-ink">
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
      {items.length === 0 ? (
        <p className="px-6 py-8 text-sm text-ink-tertiary text-center">
          {emptyMessage ?? "Nothing here yet."}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((item, idx) => (
            <li key={`${item.name}-${idx}`}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="block px-5 md:px-6 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <RowBody item={item} />
                </Link>
              ) : (
                <div className="px-5 md:px-6 py-3.5">
                  <RowBody item={item} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
