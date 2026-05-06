"use client";

import { useActionState, useState } from "react";
import {
  createGuestHandoffReplyAction,
  type ReplyActionState,
} from "@/features/guest-ai-concierge/replies-actions";
import { GuestAttachmentUploader } from "./guest-attachment-uploader";
import { MAX_ATTACHMENTS_PER_REPLY } from "@/features/guest-ai-concierge/attachments-pure";

export function GuestReplyForm({
  token,
  handoffId,
}: {
  token: string;
  handoffId: string;
}) {
  const [state, dispatch] = useActionState(
    createGuestHandoffReplyAction,
    null as ReplyActionState,
  );
  const [attachedCount, setAttachedCount] = useState(0);
  const replyId = state?.ok ? state.replyId : null;
  return (
    <form
      action={dispatch}
      className="rounded-xl border border-line-soft bg-surface p-5 flex flex-col gap-3"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="handoffId" value={handoffId} />
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        Add a follow-up
      </span>
      <textarea
        name="body"
        rows={3}
        required
        maxLength={2000}
        placeholder="More details, context, or a thank-you…"
        disabled={Boolean(replyId)}
        className="px-3 py-2 rounded-sm border border-line-soft bg-canvas text-sm resize-none"
      />
      <p className="text-[10px] text-ink-tertiary">
        Don&apos;t share passwords, codes, emails, or phone numbers — they&apos;re scrubbed before our team sees them.
      </p>
      {state && !state.ok && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-success">
          Sent. {attachedCount > 0 ? `${attachedCount} file${attachedCount === 1 ? "" : "s"} attached.` : ""} Refresh to see your message in the timeline.
        </p>
      )}
      {!replyId ? (
        <button
          type="submit"
          className="self-start h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
        >
          Send to team
        </button>
      ) : (
        <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Add attachments (optional)
          </span>
          <GuestAttachmentUploader
            token={token}
            replyId={replyId}
            remainingSlots={MAX_ATTACHMENTS_PER_REPLY - attachedCount}
            onUploaded={() => setAttachedCount((n) => n + 1)}
          />
        </div>
      )}
    </form>
  );
}
