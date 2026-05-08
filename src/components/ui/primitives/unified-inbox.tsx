/**
 * Stage 10.B — UnifiedInbox primitive.
 *
 * One thread per conversation, channel-source badge per message.
 * Replaces per-channel inboxes (research-summary.md theme 7). Channel
 * resolution stays in the parent — this component renders threads.
 *
 * Used by: 10.I Marketing (5+ channels), 10.K Front Office (channel +
 * direct), 10.H Procurement vendor comms.
 *
 * Server component for the list + thread render. Reply composer stays
 * in a client wrapper consumer-side.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type InboxChannel =
  | "direct"
  | "email"
  | "whatsapp"
  | "booking"
  | "airbnb"
  | "instagram"
  | "sms"
  | "other";

export interface InboxMessage {
  id: string;
  channel: InboxChannel;
  /** Author display name. */
  from: string;
  /** ISO string. */
  at: string;
  body: string;
  /** Inbound (from contact) vs. outbound (from operator). */
  direction: "in" | "out";
  /** Optional attachment summary (e.g. "2 photos"). */
  attachment?: string;
  /** Read receipt flag. */
  read?: boolean;
}

export interface InboxThread {
  id: string;
  subjectName: string;
  subtitle?: string;
  /** Most-recent-first. */
  lastMessageAt: string;
  preview: string;
  channels: InboxChannel[];
  unreadCount?: number;
  badge?: { label: string; tone?: "neutral" | "info" | "warn" | "danger" };
}

export interface UnifiedInboxProps {
  threads: InboxThread[];
  selectedThreadId?: string | null;
  onSelectThread?: (id: string) => void;
  /** When a thread is selected, parent renders these messages in the right pane. */
  messages?: InboxMessage[];
  /** Slot for the parent's reply composer. */
  composerSlot?: React.ReactNode;
  className?: string;
}

const CHANNEL_LABEL: Record<InboxChannel, string> = {
  direct: "Direct",
  email: "Email",
  whatsapp: "WA",
  booking: "B.com",
  airbnb: "Airbnb",
  instagram: "IG",
  sms: "SMS",
  other: "Other",
};

const CHANNEL_TONE: Record<InboxChannel, string> = {
  direct: "bg-accent-weak text-accent",
  email: "bg-muted text-ink-secondary",
  whatsapp: "bg-success-weak text-success",
  booking: "bg-warning-weak text-warning",
  airbnb: "bg-danger-weak text-danger",
  instagram: "bg-accent-weak text-accent",
  sms: "bg-muted text-ink-secondary",
  other: "bg-muted text-ink-tertiary",
};

const BADGE_TONE = {
  neutral: "bg-muted text-ink-secondary",
  info: "bg-accent-weak text-accent",
  warn: "bg-warning-weak text-warning",
  danger: "bg-danger-weak text-danger",
};

export function UnifiedInbox({
  threads,
  selectedThreadId = null,
  onSelectThread,
  messages = [],
  composerSlot,
  className,
}: UnifiedInboxProps) {
  return (
    <div
      className={cn(
        "flex h-full rounded-md border border-line-soft bg-surface overflow-hidden",
        className,
      )}
    >
      <ul
        className="w-full sm:w-72 shrink-0 border-r border-line-soft overflow-y-auto"
        role="list"
        aria-label="Threads"
      >
        {threads.length === 0 ? (
          <li className="p-4 text-sm text-ink-tertiary italic">
            Inbox is empty.
          </li>
        ) : (
          threads.map((t) => {
            const selected = t.id === selectedThreadId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelectThread?.(t.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 border-b border-line-soft flex flex-col gap-1",
                    selected ? "bg-accent-weak" : "hover:bg-muted",
                  )}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-sm font-medium text-ink truncate">
                      {t.subjectName}
                    </span>
                    {(t.unreadCount ?? 0) > 0 && (
                      <span className="text-[10px] bg-accent text-accent-contrast rounded-full px-1.5 py-0.5 font-medium tabular-nums">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  {t.subtitle && (
                    <span className="text-xs text-ink-tertiary truncate">
                      {t.subtitle}
                    </span>
                  )}
                  <span className="text-xs text-ink-secondary truncate">
                    {t.preview}
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex gap-1">
                      {t.channels.map((c) => (
                        <span
                          key={c}
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded-sm font-medium",
                            CHANNEL_TONE[c],
                          )}
                        >
                          {CHANNEL_LABEL[c]}
                        </span>
                      ))}
                      {t.badge && (
                        <span
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded-sm font-medium",
                            BADGE_TONE[t.badge.tone ?? "neutral"],
                          )}
                        >
                          {t.badge.label}
                        </span>
                      )}
                    </div>
                    <time className="text-xs text-ink-tertiary">
                      {formatRelative(t.lastMessageAt)}
                    </time>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedThreadId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-tertiary italic">
            Select a thread
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={cn(
                    "max-w-[80%] rounded-md px-3 py-2 text-sm",
                    m.direction === "in"
                      ? "bg-muted self-start"
                      : "bg-accent-weak self-end",
                  )}
                  data-direction={m.direction}
                >
                  <header className="flex items-baseline gap-2 mb-1">
                    <span
                      className={cn(
                        "text-[10px] px-1 py-0.5 rounded-sm font-medium",
                        CHANNEL_TONE[m.channel],
                      )}
                    >
                      {CHANNEL_LABEL[m.channel]}
                    </span>
                    <span className="text-xs text-ink-secondary truncate">
                      {m.from}
                    </span>
                    <time className="text-xs text-ink-tertiary ml-auto">
                      {formatRelative(m.at)}
                    </time>
                  </header>
                  <div className="whitespace-pre-wrap text-ink">{m.body}</div>
                  {m.attachment && (
                    <div className="text-xs text-ink-tertiary mt-1 italic">
                      📎 {m.attachment}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {composerSlot && (
              <div className="border-t border-line-soft p-2 bg-muted/40">
                {composerSlot}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "now";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
