"use client";

import * as React from "react";
import {
  MsgBubble,
  type MsgActorKind,
  type InlineAction,
  type SchedulingChip,
  type MsgAttachment,
} from "./msg-bubble";

/**
 * Phase 2.3 owner-05 — ThreadView.
 *
 * Renders a single thread: subject header + scrollable message
 * stream + sticky reply composer at bottom. Auto-scrolls to bottom
 * when new messages arrive.
 *
 * OWNER-ENGAGEMENT (#168 follow-up): the composer gained a paperclip
 * (attach-file) affordance, and messages can carry structured
 * scheduling chips ("Accept · <time>" / "Propose different time") that
 * the owner acts on inline.
 */

export interface ThreadMessage {
  id: string;
  actorKind: MsgActorKind;
  actorName: string;
  body: string;
  sentLabel: string;
  inlineActions?: InlineAction[];
  scheduling?: SchedulingChip[];
  schedulingResolved?: boolean;
  attachments?: MsgAttachment[];
}

export interface ThreadViewProps {
  subject: string;
  counterpart: string;
  messages: ThreadMessage[];
  onSend?: (body: string) => Promise<void> | void;
  onAttach?: (file: File, note: string) => Promise<void> | void;
  onSchedulingRespond?: (
    messageId: string,
    actionId: string,
    proposedNote: string,
  ) => Promise<void> | void;
  className?: string;
}

export function ThreadView({
  subject,
  counterpart,
  messages,
  onSend,
  onAttach,
  onSchedulingRespond,
  className,
}: ThreadViewProps) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);
  const [busyMsgId, setBusyMsgId] = React.useState<string | null>(null);
  const streamRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await onSend?.(body);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAttach) return;
    setAttaching(true);
    try {
      await onAttach(file, draft.trim());
      setDraft("");
    } finally {
      setAttaching(false);
    }
  }

  async function respond(messageId: string, actionId: string, proposedNote: string) {
    if (!onSchedulingRespond) return;
    setBusyMsgId(messageId);
    try {
      await onSchedulingRespond(messageId, actionId, proposedNote);
    } finally {
      setBusyMsgId(null);
    }
  }

  return (
    <div className={`thread-view${className ? ` ${className}` : ""}`}>
      <header className="tv-head">
        <h2 className="tv-subject">{subject}</h2>
        <span className="tv-counterpart mono">with {counterpart}</span>
      </header>
      <div className="tv-stream" ref={streamRef}>
        {messages.map((m) => (
          <MsgBubble
            key={m.id}
            actorKind={m.actorKind}
            actorName={m.actorName}
            body={m.body}
            sentLabel={m.sentLabel}
            inlineActions={m.inlineActions}
            scheduling={m.scheduling}
            schedulingResolved={m.schedulingResolved}
            attachments={m.attachments}
            schedulingBusy={busyMsgId === m.id}
            onSchedulingRespond={
              onSchedulingRespond
                ? (actionId, proposedNote) => respond(m.id, actionId, proposedNote)
                : undefined
            }
          />
        ))}
      </div>
      <form
        className="tv-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="tv-file-input"
              accept=".pdf,image/png,image/jpeg,image/webp,image/heic,.txt"
              onChange={onFilePicked}
              aria-hidden
              tabIndex={-1}
            />
            <button
              type="button"
              className="tv-attach btn btn-secondary btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={attaching || sending}
              aria-label="Attach a file"
              title="Attach a file"
            >
              {attaching ? (
                "…"
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
          </>
        )}
        <textarea
          className="textarea"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim() || sending}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
