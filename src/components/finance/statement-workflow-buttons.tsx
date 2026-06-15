"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  regenerateStatementAction,
  requestStatementChangesAction,
} from "@/features/finance/statement-actions";

interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Inline workflow affordances for an owner statement. The server actions
 * re-validate org scope + status, so these are UX affordances, not authority.
 *
 *  - Regenerate: rebuilds a draft statement's lines from source. Shown for
 *    draft / draft_revised only — the action also guards approved/sent.
 *  - Request changes: flags the statement `disputed` with operator notes.
 *    Shown for draft / approved.
 */
export function StatementWorkflowButtons({
  statementId,
  status,
}: {
  statementId: string;
  status: string;
}) {
  const router = useRouter();
  const canRegenerate = status === "draft" || status === "draft_revised";
  const canRequestChanges =
    status === "draft" || status === "draft_revised" || status === "approved";

  const [regenState, regenDispatch, regenPending] = useActionState<
    ActionResult | null,
    FormData
  >(regenerateStatementAction, null);
  const [reqState, reqDispatch, reqPending] = useActionState<
    ActionResult | null,
    FormData
  >(requestStatementChangesAction, null);

  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (regenState?.ok) router.refresh();
  }, [regenState, router]);

  useEffect(() => {
    if (reqState?.ok) {
      setShowNotes(false);
      router.refresh();
    }
  }, [reqState, router]);

  if (!canRegenerate && !canRequestChanges) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {canRegenerate && (
          <form action={regenDispatch}>
            <input type="hidden" name="statementId" value={statementId} />
            <Button type="submit" size="sm" variant="secondary" disabled={regenPending}>
              {regenPending ? "Regenerating…" : "Regenerate"}
            </Button>
          </form>
        )}
        {canRequestChanges && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowNotes((v) => !v)}
          >
            Request changes
          </Button>
        )}
      </div>

      {regenState && !regenState.ok && regenState.error && (
        <span className="text-[11px] text-danger">{regenState.error}</span>
      )}

      {canRequestChanges && showNotes && (
        <form
          action={reqDispatch}
          className="flex flex-col items-end gap-2 w-full max-w-[360px]"
        >
          <input type="hidden" name="statementId" value={statementId} />
          <textarea
            name="notes"
            required
            rows={3}
            maxLength={2000}
            placeholder="Describe the changes needed before this statement can be approved…"
            className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {reqState && !reqState.ok && reqState.error && (
            <span className="text-[11px] text-danger">{reqState.error}</span>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowNotes(false)}
              disabled={reqPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={reqPending}>
              {reqPending ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
