"use client";

/**
 * Phase 2.4 mgmt-04 — Concierge Thread.
 *
 * Messages with composer + agent attribution. Critical UX rule 1:
 * agent messages are visually distinct to staff (terra tint +
 * "agent" tag) but the guest sees a clean reply with no tag.
 *
 * The component is presentational; the parent persists messages.
 */

import * as React from "react";

export type ThreadAuthorKind = "guest" | "staff" | "agent";

export interface ThreadAgentAction {
  kind: "booked" | "dispatched" | "answered" | "scheduled";
  label: string;
  refId?: string;
}

export interface ConciergeMessage {
  id: string;
  authorKind: ThreadAuthorKind;
  authorName: string;
  sentLabel: string;
  body: string;
  attachments?: { id: string; url: string; label: string }[];
  agentAction?: ThreadAgentAction;
}

export interface ConciergeThreadProps {
  messages: ConciergeMessage[];
  onSend?: (body: string) => Promise<void> | void;
  /** Disable composer for read-only mode. */
  readOnly?: boolean;
  className?: string;
}

export function ConciergeThread({ messages, onSend, readOnly, className }: ConciergeThreadProps) {
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const streamRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await onSend?.(body);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`concierge-thread${className ? ` ${className}` : ""}`}>
      <div className="ct-stream" ref={streamRef}>
        {messages.map((m) => (
          <article key={m.id} className={`ct-msg ct-${m.authorKind}`}>
            <header className="ct-msg-head">
              <span className="ct-msg-name">{m.authorName}</span>
              {m.authorKind === "agent" && <span className="ct-msg-tag mono">agent</span>}
              <span className="ct-msg-when mono">{m.sentLabel}</span>
            </header>
            <div className="ct-msg-body">{m.body}</div>
            {m.agentAction && (
              <div className="ct-msg-action mono">
                <span className="ct-msg-action-kind">{m.agentAction.kind}</span> {m.agentAction.label}
              </div>
            )}
            {m.attachments && m.attachments.length > 0 && (
              <div className="ct-msg-attach mono">
                {m.attachments.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    {a.label}
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {!readOnly && (
        <form
          className="ct-composer"
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
            placeholder="Reply to guest…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim() || busy}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
