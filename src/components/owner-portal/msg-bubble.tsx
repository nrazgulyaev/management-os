"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-05 — MsgBubble.
 *
 * Single message. Bubble side + tone is driven by actor:
 *   owner      → right-aligned, terra fill, dark text
 *   mgmt_user  → left-aligned, surface fill
 *   agent      → left-aligned, italic, accent border ("auto-reply")
 *
 * Supports inline action chips ([{ label, href }]) — used by the
 * concierge agent to surface "View statement" / "Open villa" links
 * inside its auto-replies.
 *
 * OWNER-ENGAGEMENT (#168 follow-up): also renders STRUCTURED scheduling
 * chips ("Accept · <time>" / "Propose different time") that POST through
 * respondToSchedulingAction, and a list of file attachments.
 */

export type MsgActorKind = "owner" | "mgmt_user" | "agent";

export interface InlineAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface SchedulingChip {
  id: string;
  kind: "accept_slot" | "propose_time";
  label: string;
  slotIso: string | null;
}

export interface MsgAttachment {
  documentId: string;
  name: string;
  href: string;
}

export interface MsgBubbleProps {
  actorKind: MsgActorKind;
  actorName: string;
  body: string;
  sentLabel: string;
  inlineActions?: InlineAction[];
  scheduling?: SchedulingChip[];
  schedulingResolved?: boolean;
  schedulingBusy?: boolean;
  attachments?: MsgAttachment[];
  onSchedulingRespond?: (actionId: string, proposedNote: string) => void;
  className?: string;
}

export function MsgBubble({
  actorKind,
  actorName,
  body,
  sentLabel,
  inlineActions,
  scheduling,
  schedulingResolved,
  schedulingBusy,
  attachments,
  onSchedulingRespond,
  className,
}: MsgBubbleProps) {
  const [proposing, setProposing] = React.useState(false);
  const [note, setNote] = React.useState("");

  const hasScheduling = !!scheduling && scheduling.length > 0;
  const interactive = hasScheduling && !schedulingResolved && !!onSchedulingRespond;

  return (
    <div className={`msg-row msg-row-${actorKind}${className ? ` ${className}` : ""}`}>
      <div className={`msg-bubble msg-${actorKind}`}>
        <div className="msg-head mono">
          <span className="msg-actor">{actorName}</span>
          <span className="msg-when">{sentLabel}</span>
        </div>
        <div className="msg-body">{body}</div>

        {attachments && attachments.length > 0 && (
          <div className="msg-attachments">
            {attachments.map((a) => (
              <a key={a.documentId} className="msg-attachment" href={a.href} target="_blank" rel="noopener noreferrer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <span className="msg-attachment-name">{a.name}</span>
              </a>
            ))}
          </div>
        )}

        {hasScheduling && (
          <div className="msg-scheduling">
            {scheduling!.map((c) =>
              c.kind === "propose_time" && interactive ? (
                <button
                  key={c.id}
                  type="button"
                  className="msg-chip msg-chip-ghost"
                  disabled={schedulingBusy}
                  onClick={() => setProposing((v) => !v)}
                >
                  {c.label}
                </button>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  className={`msg-chip${c.kind === "accept_slot" ? " msg-chip-accept" : " msg-chip-ghost"}`}
                  disabled={!interactive || schedulingBusy}
                  onClick={() => interactive && onSchedulingRespond?.(c.id, "")}
                >
                  {c.label}
                </button>
              ),
            )}
            {schedulingResolved && <span className="msg-chip-done mono">Sent to your director</span>}
            {interactive && proposing && (
              <div className="msg-propose">
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Thursday afternoon, or evenings after 6pm"
                  maxLength={400}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={schedulingBusy}
                  onClick={() => {
                    onSchedulingRespond?.("propose", note.trim());
                    setProposing(false);
                    setNote("");
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}

        {inlineActions && inlineActions.length > 0 && (
          <div className="msg-actions">
            {inlineActions.map((a, i) =>
              a.href ? (
                <a key={i} className="msg-action-chip" href={a.href}>{a.label}</a>
              ) : (
                <button key={i} type="button" className="msg-action-chip" onClick={a.onClick}>{a.label}</button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
