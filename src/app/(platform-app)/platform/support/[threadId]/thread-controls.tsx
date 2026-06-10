"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  postPlatformSupportReplyAction,
  setSupportThreadStatusAction,
} from "../actions";

/**
 * Operator controls under the transcript: reply box (hidden when closed —
 * reopen first) + explicit lifecycle buttons. Lifecycle: open ⇄ pending,
 * open/pending → closed, closed → open (reopen).
 */
export function ThreadControls({
  threadId,
  status,
}: {
  threadId: string;
  status: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reply(formData: FormData) {
    setError(null);
    const body = String(formData.get("body") ?? "").trim();
    startTransition(async () => {
      const result = await postPlatformSupportReplyAction({ threadId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  function setStatus(next: "open" | "pending" | "closed") {
    setError(null);
    startTransition(async () => {
      const result = await setSupportThreadStatusAction({
        threadId,
        status: next,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {status !== "closed" && (
        <form ref={formRef} action={reply} className="flex flex-col gap-2">
          <label className="block text-sm">
            <span className="text-ink-secondary">Reply as platform</span>
            <textarea
              name="body"
              required
              maxLength={8000}
              rows={3}
              className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm resize-y"
              placeholder="Write a reply to the customer…"
            />
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-accent btn-sm disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send reply"}
            </button>
            {status === "open" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus("pending")}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                Mark pending
              </button>
            )}
            {status === "pending" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus("open")}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                Mark open
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus("closed")}
              className="btn btn-ghost btn-sm disabled:opacity-50"
            >
              Close thread
            </button>
          </div>
        </form>
      )}

      {status === "closed" && (
        <div className="flex items-center gap-3 border border-line-soft rounded-lg p-4">
          <p className="text-sm text-ink-tertiary flex-1">
            This thread is closed. Reopen it to reply.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("open")}
            className="btn btn-secondary btn-sm disabled:opacity-50"
          >
            {pending ? "Reopening…" : "Reopen"}
          </button>
        </div>
      )}

      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
