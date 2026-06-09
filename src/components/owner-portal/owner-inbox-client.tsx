"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ThreadList, type ThreadListItem } from "@/components/owner-portal/thread-list";
import { ThreadView, type ThreadMessage } from "@/components/owner-portal/thread-view";
import { postOwnerThreadReplyAction } from "@/features/owner-portal/thread-actions";
import {
  attachFileToThreadAction,
  respondToSchedulingAction,
} from "@/features/owner-portal/engagement-actions";

/**
 * redesign owner-05 — inbox master-detail wrapper.
 *
 * Thread selection routes through ?thread=<id> (server reloads the
 * selected thread + messages); replies post through the existing
 * postOwnerThreadReplyAction and refresh the stream. Read-only under
 * impersonation (the action enforces requireOwnerWrite server-side).
 */
export function OwnerInboxClient({
  threads,
  selectedId,
  subject,
  counterpart,
  messages,
}: {
  threads: ThreadListItem[];
  selectedId: string | null;
  subject: string | null;
  counterpart: string;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const [err, setErr] = React.useState<string | null>(null);

  async function send(body: string) {
    if (!selectedId) return;
    setErr(null);
    const fd = new FormData();
    fd.set("threadId", selectedId);
    fd.set("body", body);
    const res = await postOwnerThreadReplyAction(null, fd);
    if (res.ok) router.refresh();
    else setErr(res.error ?? "Could not send your reply.");
  }

  async function attach(file: File, note: string) {
    if (!selectedId) return;
    setErr(null);
    const fd = new FormData();
    fd.set("threadId", selectedId);
    fd.set("body", note);
    fd.set("file", file);
    const res = await attachFileToThreadAction(null, fd);
    if (res.ok) router.refresh();
    else setErr(res.error ?? "Could not attach the file.");
  }

  async function schedulingRespond(messageId: string, actionId: string, proposedNote: string) {
    if (!selectedId) return;
    setErr(null);
    const fd = new FormData();
    fd.set("threadId", selectedId);
    fd.set("messageId", messageId);
    fd.set("actionId", actionId);
    fd.set("proposedNote", proposedNote);
    const res = await respondToSchedulingAction(null, fd);
    if (res.ok) router.refresh();
    else setErr(res.error ?? "Could not record your response.");
  }

  return (
    <div className="flex flex-col gap-2">
      {err && (
        <p className="text-xs text-terra" role="alert">
          {err}
        </p>
      )}
      <div className="inbox-grid">
        <ThreadList
          threads={threads}
          selectedId={selectedId}
          onSelect={(id) => router.push(`/owner/inbox?thread=${id}`)}
        />
        {selectedId && subject ? (
          <ThreadView
            subject={subject}
            counterpart={counterpart}
            messages={messages}
            onSend={send}
            onAttach={attach}
            onSchedulingRespond={schedulingRespond}
          />
        ) : (
          <div className="flex items-center justify-center p-10 text-sm text-ink-tertiary bg-paper">
            Select a conversation to read and reply.
          </div>
        )}
      </div>
    </div>
  );
}
