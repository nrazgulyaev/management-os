/**
 * Sprint 1 — CommsPanel primitive.
 *
 * Two compositions in one primitive:
 *   - variant="notifications" — vertical stack of "from + body + ts"
 *     rows (used on the dashboard apex for the top-5 notifications card)
 *   - variant="activity"      — chat-style left/right bubbles for
 *     showing an exchange (e.g. inbox preview, guest concierge thread)
 *
 * Read-only this sprint — no input area, no live messaging. The footer
 * slot is reserved for a future composer.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CommsHeader {
  title: string;
  subtitle?: string;
  avatarUrl?: string;
}

export interface CommsItem {
  /** Display name of the sender / source. */
  from: string;
  /** Body text — short. Long bodies will wrap. */
  body: string;
  /** Pre-formatted timestamp (e.g. "12:34", "2h ago"). */
  timestamp?: string;
  /** Optional avatar URL for the sender. */
  avatar?: string;
  /**
   * For "activity" variant only — controls bubble alignment.
   * "left" = counterparty, "right" = current user.
   * Ignored by the "notifications" variant.
   */
  side?: "left" | "right";
}

export interface CommsPanelProps {
  variant: "notifications" | "activity";
  header?: CommsHeader;
  items: CommsItem[];
  /** Optional read-only footer slot (future composer mount-point). */
  footer?: React.ReactNode;
  /** Optional empty-state message override. */
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

export function CommsPanel({
  variant,
  header,
  items,
  footer,
  emptyMessage,
  className,
}: CommsPanelProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card flex flex-col overflow-hidden",
        className,
      )}
      data-stage10="comms-panel"
      data-variant={variant}
    >
      {header && (
        <header className="flex items-center gap-3 px-5 py-4 border-b border-line-soft">
          {header.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={header.avatarUrl}
              alt=""
              className="w-9 h-9 rounded-full object-cover shrink-0"
            />
          ) : (
            <span className="w-9 h-9 rounded-full bg-accent-weak text-accent flex items-center justify-center text-xs font-medium shrink-0">
              {initials(header.title) || "·"}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-ink truncate">
              {header.title}
            </span>
            {header.subtitle && (
              <span className="text-[11px] text-ink-tertiary truncate">
                {header.subtitle}
              </span>
            )}
          </div>
        </header>
      )}

      <div className="flex-1 px-5 py-4 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-sm text-ink-tertiary text-center py-6">
            {emptyMessage ?? "Nothing to show yet."}
          </p>
        ) : variant === "notifications" ? (
          <ul className="flex flex-col divide-y divide-line-soft -my-3">
            {items.map((it, idx) => (
              <li
                key={`${it.from}-${idx}`}
                className="flex items-start gap-3 py-3"
              >
                {it.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.avatar}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-muted text-ink-secondary flex items-center justify-center text-[10px] font-medium shrink-0">
                    {initials(it.from) || "·"}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink truncate">
                      {it.from}
                    </span>
                    {it.timestamp && (
                      <span className="text-[11px] text-ink-tertiary shrink-0 tabular-nums">
                        {it.timestamp}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-secondary leading-snug mt-0.5">
                    {it.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((it, idx) => {
              const isRight = it.side === "right";
              return (
                <li
                  key={`${it.from}-${idx}`}
                  className={cn(
                    "flex gap-2",
                    isRight ? "justify-end" : "justify-start",
                  )}
                >
                  {!isRight &&
                    (it.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.avatar}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover shrink-0 mt-1"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-muted text-ink-secondary flex items-center justify-center text-[10px] font-medium shrink-0 mt-1">
                        {initials(it.from) || "·"}
                      </span>
                    ))}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2",
                      isRight
                        ? "bg-accent text-accent-contrast rounded-br-sm"
                        : "bg-muted text-ink rounded-bl-sm",
                    )}
                  >
                    {!isRight && (
                      <div className="text-[11px] font-medium opacity-80 mb-0.5">
                        {it.from}
                      </div>
                    )}
                    <p className="text-sm leading-snug whitespace-pre-line">
                      {it.body}
                    </p>
                    {it.timestamp && (
                      <div
                        className={cn(
                          "text-[10px] tabular-nums mt-1",
                          isRight ? "opacity-80" : "text-ink-tertiary",
                        )}
                      >
                        {it.timestamp}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {footer && (
        <footer className="border-t border-line-soft px-5 py-3 bg-canvas">
          {footer}
        </footer>
      )}
    </section>
  );
}
