"use client";

/**
 * Phase 2.1 PR 2 — DetailActionBar (brick B8 · template 05).
 *
 * Bottom-sticky save bar. Renders only when `dirty` OR
 * `requiresApproval` is true; otherwise null (no DOM). Caller owns
 * onSave / onDiscard; the bar surfaces a dirty count or an approval
 * blocker on the left, with primary/secondary action buttons on the
 * right.
 */

import * as React from "react";

export interface DetailActionBarProps {
  dirty?: boolean;
  dirtyCount?: number;
  /** When true, show even with `dirty=false`. */
  requiresApproval?: boolean;
  /** Custom approval-blocker copy. Default: "Sign-off required". */
  approvalLabel?: string;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void;
  saveLabel?: string;
  discardLabel?: string;
  /** Slot for extra buttons (e.g. "Request revision"). */
  extra?: React.ReactNode;
  /** Disable save (e.g. validation pending). */
  saveDisabled?: boolean;
}

export function DetailActionBar({
  dirty,
  dirtyCount,
  requiresApproval,
  approvalLabel = "Sign-off required",
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  discardLabel = "Discard",
  extra,
  saveDisabled,
}: DetailActionBarProps) {
  const visible = dirty || requiresApproval;
  if (!visible) return null;
  const count = dirtyCount ?? 0;
  return (
    <div className="dp-actionbar" role="region" aria-label="Detail action bar">
      <div className="dirty">
        {dirty && count > 0 ? (
          <>
            <b>{count}</b> unsaved edit{count === 1 ? "" : "s"}
          </>
        ) : dirty ? (
          <b>Unsaved changes</b>
        ) : (
          <b>{approvalLabel}</b>
        )}
      </div>
      <div className="spacer" />
      {extra}
      {dirty && onDiscard && (
        <button className="btn btn-ghost btn-sm" type="button" onClick={onDiscard}>
          {discardLabel}
        </button>
      )}
      {onSave && (
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => void onSave()}
          disabled={saveDisabled}
        >
          {saveLabel}
        </button>
      )}
    </div>
  );
}
