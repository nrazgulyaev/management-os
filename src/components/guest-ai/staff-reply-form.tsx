"use client";

import { useActionState, useState } from "react";
import {
  createStaffHandoffReplyAction,
  type ReplyActionState,
} from "@/features/guest-ai-concierge/replies-actions";
import { redactionWouldChange } from "@/features/guest-ai-concierge/replies-pure";
import { StaffAttachmentUploader } from "./staff-attachment-uploader";
import { MAX_ATTACHMENTS_PER_REPLY } from "@/features/guest-ai-concierge/attachments-pure";

export function StaffReplyForm({
  handoffId,
  defaultVisibility = "guest_visible",
  canAttach = true,
}: {
  handoffId: string;
  defaultVisibility?: "guest_visible" | "internal_only";
  canAttach?: boolean;
}) {
  const [state, dispatch] = useActionState(
    createStaffHandoffReplyAction,
    null as ReplyActionState,
  );
  const [visibility, setVisibility] = useState<
    "guest_visible" | "internal_only"
  >(defaultVisibility);
  const [body, setBody] = useState("");
  const [attachedCount, setAttachedCount] = useState(0);
  const replyId = state?.ok ? state.replyId : null;
  const redactionWarning =
    visibility === "guest_visible" ? redactionWouldChange(body) : null;

  return (
    <div className="rounded-md border border-line-soft bg-canvas p-4 flex flex-col gap-3">
      <form action={dispatch} className="flex flex-col gap-3">
        <input type="hidden" name="handoffId" value={handoffId} />
        <input type="hidden" name="visibility" value={visibility} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibility("guest_visible")}
            className={`text-xs px-3 py-1.5 rounded-full ${
              visibility === "guest_visible"
                ? "bg-ink text-ink-inverse"
                : "border border-line-soft text-ink-secondary"
            }`}
          >
            Reply to guest
          </button>
          <button
            type="button"
            onClick={() => setVisibility("internal_only")}
            className={`text-xs px-3 py-1.5 rounded-full ${
              visibility === "internal_only"
                ? "bg-ink text-ink-inverse"
                : "border border-line-soft text-ink-secondary"
            }`}
          >
            Internal note
          </button>
        </div>
        <textarea
          name="body"
          rows={3}
          required
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={Boolean(replyId)}
          placeholder={
            visibility === "guest_visible"
              ? "Reply the guest will see (sanitised on save)…"
              : "Internal note — never shown to guest"
          }
          className="px-3 py-2 rounded-sm border border-line-soft bg-surface text-sm resize-none"
        />
        {redactionWarning?.changed && (
          <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-3 text-[11px] text-ink-secondary">
            <strong>Heads up</strong> — redaction will change this reply
            before the guest sees it. Preview:
            <div className="mt-1 font-mono text-[11px] text-ink whitespace-pre-wrap">
              {redactionWarning.preview}
            </div>
            Use <em>Internal note</em> if you need to share raw contact details.
          </div>
        )}
        {state && !state.ok && (
          <p className="text-xs text-danger">{state.error}</p>
        )}
        {state?.ok && (
          <p className="text-xs text-success">
            Sent.{" "}
            {attachedCount > 0
              ? `${attachedCount} attached. Refresh to see in the timeline.`
              : "Refresh to see in the timeline."}
          </p>
        )}
        {!replyId && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
            >
              {visibility === "guest_visible"
                ? "Send to guest"
                : "Save note"}
            </button>
          </div>
        )}
      </form>
      {replyId && canAttach && (
        <div className="rounded-md border border-line-soft bg-surface p-3 flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Add attachments (optional)
          </span>
          <StaffAttachmentUploader
            handoffId={handoffId}
            replyId={replyId}
            visibility={visibility}
            remainingSlots={MAX_ATTACHMENTS_PER_REPLY - attachedCount}
            onUploaded={() => setAttachedCount((n) => n + 1)}
          />
        </div>
      )}
    </div>
  );
}
