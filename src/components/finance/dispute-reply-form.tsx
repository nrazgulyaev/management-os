"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { postDisputeReplyAction } from "@/features/finance/dispute-mgmt-actions";

/**
 * Mgmt/Director reply box inside a dispute thread. Posts to
 * postDisputeReplyAction (actor_kind='mgmt_staff'); the owner sees it in their
 * inbox.
 */
export function DisputeReplyForm({ threadId }: { threadId: string }) {
  const [state, action, pending] = useActionState(postDisputeReplyAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Reply to the owner…"
        className="w-full min-h-[80px] rounded-md border border-line-soft bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-line-strong transition-colors"
      />
      {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
