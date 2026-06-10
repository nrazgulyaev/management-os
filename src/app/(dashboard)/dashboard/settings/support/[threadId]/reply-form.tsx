"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postSupportReplyAction } from "../actions";

export function ReplyForm({
  threadId,
  threadStatus,
}: {
  threadId: string;
  threadStatus: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const body = String(formData.get("body") ?? "").trim();

    startTransition(async () => {
      const result = await postSupportReplyAction({ threadId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-2">
      <label className="block text-sm">
        <span className="text-ink-secondary">Reply</span>
        <textarea
          name="body"
          required
          maxLength={8000}
          rows={3}
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm resize-y"
          placeholder="Write a reply to the platform team…"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-accent btn-sm disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
        {threadStatus === "pending" && (
          <span className="text-[12px] text-ink-tertiary">
            Replying moves the thread back into the platform queue.
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}
