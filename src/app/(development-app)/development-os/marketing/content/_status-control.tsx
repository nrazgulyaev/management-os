"use client";

/**
 * Wire-up sweep — content pipeline status transitions.
 *
 * `transitionContentStatus` already existed (validates via
 * VALID_TRANSITIONS, sets approver/reviewer/publishedAt) but the kanban
 * was read-only. This renders the valid next-state buttons on each card.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { transitionContentStatus } from "@/lib/development/server/content/content-actions";
import { VALID_TRANSITIONS } from "@/lib/development/server/content/content-status-helpers";

type NextStatus = Parameters<typeof transitionContentStatus>[0]["newStatus"];

const LABEL: Record<string, string> = {
  draft: "Draft",
  in_production: "Production",
  pending_review: "Review",
  approved: "Approve",
  scheduled: "Schedule",
  published: "Publish",
  paused: "Pause",
  archived: "Archive",
  rejected: "Reject",
};

export function ContentStatusControl({
  contentCode,
  status,
  userId,
}: {
  contentCode: string;
  status: string;
  userId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const next = VALID_TRANSITIONS[status] ?? [];
  if (next.length === 0) return null;

  function go(newStatus: string, rejectionReason?: string) {
    setErr(null);
    start(async () => {
      const r = await transitionContentStatus({
        contentCode,
        newStatus: newStatus as NextStatus,
        userId,
        rejectionReason,
      });
      if (!r.ok) {
        setErr(r.error ?? "Transition failed.");
        return;
      }
      setRejecting(false);
      router.refresh();
    });
  }

  const chip =
    "text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const dangerChip =
    "text-[10px] px-1.5 py-0.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {next.map((s) =>
          s === "rejected" ? (
            <button
              key={s}
              type="button"
              className={dangerChip}
              disabled={pending}
              onClick={() => {
                setErr(null);
                setRejecting(true);
              }}
            >
              {LABEL[s] ?? s}
            </button>
          ) : (
            <button
              key={s}
              type="button"
              className={chip}
              disabled={pending}
              onClick={() => go(s)}
            >
              {LABEL[s] ?? s}
            </button>
          ),
        )}
      </div>
      {rejecting && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = (
              new FormData(e.currentTarget).get("reason") ?? ""
            ).toString();
            go("rejected", reason);
          }}
        >
          <input
            name="reason"
            required
            minLength={2}
            placeholder="Reason"
            className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface flex-1 min-w-0"
          />
          <button type="submit" className={dangerChip} disabled={pending}>
            OK
          </button>
        </form>
      )}
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
