"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-05 — ThreadList.
 *
 * Scrollable inbox list. Unread threads carry a terra left-border
 * accent + bold subject. Selection is driven by URL query; this
 * component just reports clicks via onSelect.
 */

export type ThreadKind = "statement_dispute" | "personal_stay" | "q_review" | "general";

export interface ThreadListItem {
  id: string;
  kind: ThreadKind;
  subject: string;
  preview: string;
  lastMessageLabel: string;
  unreadCount: number;
  counterpart: string;
}

export interface ThreadListProps {
  threads: ThreadListItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

const KIND_LABEL: Record<ThreadKind, string> = {
  statement_dispute: "Statement",
  personal_stay: "Stay request",
  q_review: "Quarterly",
  general: "General",
};

export function ThreadList({ threads, selectedId, onSelect, className }: ThreadListProps) {
  if (!threads.length) {
    return <div className={`thread-list tl-empty${className ? ` ${className}` : ""}`}>Inbox zero — nothing pending.</div>;
  }
  return (
    <div className={`thread-list${className ? ` ${className}` : ""}`} role="listbox">
      {threads.map((t) => {
        const isActive = t.id === selectedId;
        const isUnread = t.unreadCount > 0;
        return (
          <button
            key={t.id}
            type="button"
            className={`tl-row${isActive ? " is-active" : ""}${isUnread ? " is-unread" : ""}`}
            role="option"
            aria-selected={isActive}
            onClick={() => onSelect?.(t.id)}
          >
            <div className="tl-meta">
              <span className="tl-kind mono">{KIND_LABEL[t.kind]}</span>
              <span className="tl-when mono">{t.lastMessageLabel}</span>
            </div>
            <div className="tl-subject">{t.subject}</div>
            <div className="tl-preview">{t.preview}</div>
            <div className="tl-foot mono">
              <span>{t.counterpart}</span>
              {isUnread && <span className="tl-badge">{t.unreadCount}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
