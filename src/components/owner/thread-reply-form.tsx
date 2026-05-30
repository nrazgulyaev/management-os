"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { postOwnerThreadReplyAction } from "@/features/owner-portal/thread-actions";
import type { OwnerActionState } from "@/features/owner-portal/notification-prefs-types";

const initial: OwnerActionState | null = null;

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send reply"}
    </button>
  );
}

export function ThreadReplyForm({ threadId }: { threadId: string }) {
  const [state, dispatch] = useActionState(postOwnerThreadReplyAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the textarea after a successful send (the page revalidates and
  // the new message renders server-side).
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={dispatch} className="flex flex-col gap-2">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Write a reply…"
        className="w-full px-3 py-2 rounded-md border border-line-soft bg-canvas text-sm text-ink resize-y"
      />
      <div className="flex items-center gap-3">
        <SendButton />
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
