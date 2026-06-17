"use client";

/**
 * Change-order lifecycle controls. Renders only the legal next states for the
 * current status (mirrors VALID_NEXT in change-order-actions.ts; the server is
 * the authority). Approve captures optional approval notes; Reject requires a
 * reason. Wires transitionChangeOrderAction.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { transitionChangeOrderAction } from "./_actions";

type Status =
  | "requested"
  | "under_review"
  | "approved"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

const VALID_NEXT: Record<Status, Status[]> = {
  requested: ["under_review", "approved", "rejected", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};

const LABEL: Record<Status, string> = {
  requested: "Reopen as requested",
  under_review: "Move to review",
  approved: "Approve",
  in_progress: "Start work",
  completed: "Mark completed",
  rejected: "Reject",
  cancelled: "Cancel",
};

const TONE: Partial<Record<Status, string>> = {
  approved: "btn-dark",
  in_progress: "btn-dark",
  completed: "btn-dark",
  rejected: "btn-secondary",
  cancelled: "btn-secondary",
};

export function ChangeOrderControls({
  changeOrderId,
  slug,
  code,
  status,
  requiredApprovalRole,
}: {
  changeOrderId: string;
  slug: string;
  code: string;
  status: string;
  requiredApprovalRole: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [collecting, setCollecting] = React.useState<Status | null>(null);
  const [note, setNote] = React.useState("");

  const next = VALID_NEXT[(status as Status)] ?? [];

  if (next.length === 0) {
    return (
      <span className="text-xs text-ink-tertiary">
        {status === "completed"
          ? "Completed — this change order is closed."
          : `Terminal status '${status}' — no further transitions.`}
      </span>
    );
  }

  function run(to: Status, withNote?: string) {
    setError(null);
    start(async () => {
      const res = await transitionChangeOrderAction({
        changeOrderId,
        slug,
        code,
        to,
        approvalNotes: to === "approved" ? withNote : undefined,
        rejectionReason: to === "rejected" ? withNote : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCollecting(null);
      setNote("");
      router.refresh();
    });
  }

  function click(to: Status) {
    // Approve + reject collect an inline note/reason first; reject requires it.
    if (to === "approved" || to === "rejected") {
      setCollecting(to);
      setNote("");
      return;
    }
    run(to);
  }

  return (
    <div className="space-y-3">
      {requiredApprovalRole && (
        <p className="text-xs text-ink-tertiary">
          Approval requires role:{" "}
          <span className="font-medium text-ink-secondary">
            {requiredApprovalRole}
          </span>
          .
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {next.map((to) => (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() => click(to)}
            className={`btn btn-sm ${TONE[to] ?? "btn-secondary"}`}
          >
            {pending && collecting === null ? "…" : LABEL[to]}
          </button>
        ))}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {collecting && (
        <div className="rounded border border-line-soft p-3 space-y-2 max-w-md">
          <p className="text-xs text-ink-secondary">
            {collecting === "approved"
              ? "Approve this change order — add approval notes (optional)."
              : "Reject this change order — a reason is required."}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={
              collecting === "approved" ? "Approval notes" : "Rejection reason"
            }
            className="w-full text-sm rounded border border-line-soft bg-surface px-2 py-1.5"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (collecting === "rejected" && !note.trim()) {
                  setError("A rejection reason is required.");
                  return;
                }
                run(collecting, note);
              }}
              className="btn btn-dark btn-sm"
            >
              {pending ? "Saving…" : collecting === "approved" ? "Confirm approve" : "Confirm reject"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setCollecting(null);
                setNote("");
                setError(null);
              }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
