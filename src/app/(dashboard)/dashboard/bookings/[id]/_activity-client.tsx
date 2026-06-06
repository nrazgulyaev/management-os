"use client";

/**
 * Activity timeline with a working source filter. The server pre-formats the
 * timestamp (avoids a tz hydration mismatch) and tags each event with a
 * `kind`; this component owns the filter state and narrows the list.
 */

import * as React from "react";

export type ActivityKind = "system" | "automated" | "manual";

export interface ActivityItem {
  id: string;
  title: string;
  detail: string | null;
  whenLabel: string;
  source: string;
  kind: ActivityKind;
  dot: string;
}

const KIND_LABEL: Record<ActivityKind, string> = {
  manual: "Manual",
  automated: "Automated",
  system: "System",
};

export function BookingActivity({ items }: { items: ActivityItem[] }) {
  const [filter, setFilter] = React.useState<"all" | ActivityKind>("all");

  // Only offer filter options for the kinds actually present.
  const kinds = React.useMemo(
    () => Array.from(new Set(items.map((i) => i.kind))),
    [items],
  );
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <div className="flex items-center justify-between">
        <span className="text-label">
          Activity <span className="text-ink-tertiary">· {shown.length} {shown.length === 1 ? "event" : "events"}</span>
        </span>
        <select
          className="select select-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | ActivityKind)}
        >
          <option value="all">All sources</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-tertiary italic">No activity recorded yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-tertiary italic">No activity from this source.</p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((t) => (
            <li
              key={t.id}
              className="grid grid-cols-[16px_1fr] gap-3 py-3 border-b border-line-soft last:border-0"
            >
              <span
                className="w-2 h-2 rounded-full mt-1.5"
                style={{ background: t.dot }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="text-sm text-ink">{t.title}</div>
                {t.detail && (
                  <div className="text-[12px] text-ink-secondary mt-0.5">{t.detail}</div>
                )}
                <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-tertiary mt-1">
                  {t.whenLabel} · {t.source}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
