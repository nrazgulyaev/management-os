"use client";

import * as React from "react";
import { MsgBubble, type MsgActorKind, type InlineAction } from "./msg-bubble";

/**
 * Phase 2.3 owner-05 — ThreadView.
 *
 * Renders a single thread: subject header + scrollable message
 * stream + sticky reply composer at bottom. Auto-scrolls to bottom
 * when new messages arrive.
 */

export interface ThreadMessage {
  id: string;
  actorKind: MsgActorKind;
  actorName: string;
  body: string;
  sentLabel: string;
  inlineActions?: InlineAction[];
}

export interface ThreadViewProps {
  subject: string;
  counterpart: string;
  messages: ThreadMessage[];
  onSend?: (body: string) => Promise<void> | void;
  className?: string;
}

export function ThreadView({ subject, counterpart, messages, onSend, className }: ThreadViewProps) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const streamRef = React.useRef<HTMLDivElement>(null);

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
