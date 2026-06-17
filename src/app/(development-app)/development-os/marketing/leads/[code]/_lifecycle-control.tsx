"use client";

/**
 * Lifecycle-advance control for a marketing lead. Mirrors the content
 * `_status-control` pattern: renders the valid next-state chips for the
 * current lifecycle status and calls the org-scoped, FSM-guarded
 * `advanceLeadLifecycle` action, then router.refresh on success.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { advanceLeadLifecycle } from "@/lib/development/server/marketing/lead-lifecycle-actions";
import { nextLifecycleStatuses } from "@/lib/development/server/marketing/lead-lifecycle-helpers";

const LABEL: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualify",
  hot: "Mark hot",
  reservation: "Reservation",
  contract: "Contract",
  lost: "Lost",
  disqualified: "Disqualify",
};

export function LeadLifecycleControl({
  leadCode,
  status,
}: {
  leadCode: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  const next = nextLifecycleStatuses(status);
  if (next.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        This lead is in a terminal stage. No further transitions.
      </p>
    );
  }

  function go(newStatus: string) {
    setErr(null);
    start(async () => {
      const r = await advanceLeadLifecycle({ leadCode, newStatus });
      if (!r.ok) {
        setErr(r.error ?? "Transition failed.");
        return;
      }
      router.refresh();
    });
  }

  const chip =
    "font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-1 rounded border border-line-soft bg-surface text-ink-secondary hover:border-line hover:text-ink disabled:opacity-50";
  const dangerChip =
    "font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-1 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {next.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => go(s)}
            className={s === "lost" || s === "disqualified" ? dangerChip : chip}
          >
            {LABEL[s] ?? s}
          </button>
        ))}
      </div>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
