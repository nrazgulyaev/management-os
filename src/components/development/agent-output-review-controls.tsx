"use client";

/**
 * AI-agents cabinet — agent-output review controls.
 *
 * Mounted inside AgentOutputDetail. Lets an operator clear a queued
 * agent output: Approve, Reject, or Edit-and-approve (overriding the
 * summary / recommended actions). Calls the org-scoped + audited
 * actions in ai-outputs/output-review-actions.ts, then refreshes so the
 * inbox queue updates.
 *
 * Only rendered for outputs still status="awaiting_review"; resolved
 * outputs (approved / rejected / edited_and_approved) hide the controls.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, Pencil } from "lucide-react";
import {
  approveAgentOutput,
  rejectAgentOutput,
  editAndApproveAgentOutput,
} from "@/lib/development/server/ai-outputs/output-review-actions";

export interface AgentOutputReviewControlsProps {
  outputCode: string;
  /** Pre-fill the edit textarea with the current summary. */
  currentSummary: string;
  /** Pre-fill the edit list with the current recommended actions. */
  currentActions: string[];
}

export function AgentOutputReviewControls({
  outputCode,
  currentSummary,
  currentActions,
}: AgentOutputReviewControlsProps) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [editSummary, setEditSummary] = React.useState(currentSummary);
  const [editActions, setEditActions] = React.useState(
    currentActions.join("\n"),
  );

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Action failed.");
        return;
      }
      router.refresh();
    });
  }

  function onApprove() {
    run(() =>
      approveAgentOutput({
        outputCode,
        reviewerNotes: notes.trim() || undefined,
      }),
    );
  }

  function onReject() {
    run(() =>
      rejectAgentOutput({
        outputCode,
        reviewerNotes: notes.trim() || undefined,
      }),
    );
  }

  function onEditApprove() {
    const actions = editActions
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
    run(() =>
      editAndApproveAgentOutput({
        outputCode,
        editedSummary: editSummary.trim() || undefined,
        editedActions: actions.length > 0 ? actions : undefined,
        reviewerNotes: notes.trim() || undefined,
      }),
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-line-soft bg-surface p-4">
      <div className="label mb-2.5">Review</div>

      <label className="block text-xs text-ink-3 mb-1" htmlFor="reviewer-notes">
        Reviewer notes (optional)
      </label>
      <textarea
        id="reviewer-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={pending}
        rows={2}
        className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface mb-3 disabled:opacity-50"
        placeholder="Why you're approving / rejecting…"
      />

      {editing && (
        <div className="mb-3 space-y-3 rounded border border-line-soft p-3">
          <div>
            <label
              className="block text-xs text-ink-3 mb-1"
              htmlFor="edit-summary"
            >
              Edited summary
            </label>
            <textarea
              id="edit-summary"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              disabled={pending}
              rows={4}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
            />
          </div>
          <div>
            <label
              className="block text-xs text-ink-3 mb-1"
              htmlFor="edit-actions"
            >
              Recommended actions (one per line)
            </label>
            <textarea
              id="edit-actions"
              value={editActions}
              onChange={(e) => setEditActions(e.target.value)}
              disabled={pending}
              rows={3}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!editing ? (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={pending}
              className="btn btn-primary btn-sm"
            >
              <Check className="w-4 h-4" strokeWidth={1.75} />
              Approve
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="btn btn-secondary btn-sm"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.75} />
              Edit & approve
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={pending}
              className="btn btn-secondary btn-sm text-danger"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onEditApprove}
              disabled={pending}
              className="btn btn-primary btn-sm"
            >
              <Check className="w-4 h-4" strokeWidth={1.75} />
              Save & approve
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="btn btn-secondary btn-sm"
            >
              Cancel edit
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
