"use client";

/**
 * Phase 2.4 mgmt-04 — RequestInbox.
 *
 * Left rail. Filter chips (All / Urgent / Open / Mine / Agent),
 * scrollable list of stay threads ordered by latest_msg_at desc.
 * Selection drives the focused-stay pane via onSelect.
 */

import * as React from "react";

export type RequestInboxFilter = "all" | "urgent" | "open" | "mine" | "agent";

export interface RequestInboxItem {
  id: string;
  guestName: string;
  villaCode: string;
  preview: string;
  latestAtLabel: string;
  unreadCount: number;
  priority: "urgent" | "high" | "normal" | "low";
  agentHandled: boolean;
  channel: "wa" | "email" | "inapp" | "phone";
  /** Optional explicit assignee userId. */
  assigneeId?: string | null;
}

export interface RequestInboxProps {
  items: RequestInboxItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  filter?: RequestInboxFilter;
  onFilterChange?: (f: RequestInboxFilter) => void;
  currentUserId?: string;
  className?: string;
}

const FILTERS: { key: RequestInboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "agent", label: "Agent" },
];

export function RequestInbox({
  items,
  selectedId,
  onSelect,
  filter = "all",
  onFilterChange,
  currentUserId,
  className,
}: RequestInboxProps) {
  const filtered = items.filter((it) => {
    switch (filter) {
      case "urgent":
        return it.priority === "urgent";
      case "open":
        return it.unreadCount > 0;
      case "mine":
        return currentUserId && it.assigneeId === currentUserId;
      case "agent":
        return it.agentHandled;
      default:
        return true;
    }
  });

  return (
    <aside className={`request-inbox${className ? ` ${className}` : ""}`}>
      <header className="ri-head">
        <h3 className="ri-title">Inbox</h3>
        <div className="ri-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ri-chip${filter === f.key ? " is-on" : ""}`}
              onClick={() => onFilterChange?.(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>
      <div className="ri-list">
        {filtered.length === 0 && <div className="ri-empty mono">Nothing here.</div>}
        {filtered.map((it) => {
          const cls = [
            "ri-row",
            it.id === selectedId ? "is-active" : "",
            it.unreadCount > 0 ? "is-unread" : "",
            it.priority === "urgent" ? "is-urgent" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={it.id} type="button" className={cls} onClick={() => onSelect?.(it.id)}>
              <div className="ri-meta">
                <span className="ri-villa mono">{it.villaCode}</span>
                <span className="ri-when mono">{it.latestAtLabel}</span>
              </div>
              <div className="ri-name">{it.guestName}</div>
              <div className="ri-preview">{it.preview}</div>
              <div className="ri-foot">
                <span className="ri-channel mono">{it.channel}</span>
                {it.agentHandled && <span className="ri-tag mono">agent</span>}
                {it.unreadCount > 0 && <span className="ri-badge">{it.unreadCount}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
