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
 */

export type MsgActorKind = "owner" | "mgmt_user" | "agent";

export interface InlineAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface MsgBubbleProps {
  actorKind: MsgActorKind;
  actorName: string;
  body: string;
  sentLabel: string;
  inlineActions?: InlineAction[];
  className?: string;
}

export function MsgBubble({ actorKind, actorName, body, sentLabel, inlineActions, className }: MsgBubbleProps) {
  return (
    <div className={`msg-row msg-row-${actorKind}${className ? ` ${className}` : ""}`}>
      <div className={`msg-bubble msg-${actorKind}`}>
        <div className="msg-head mono">
          <span className="msg-actor">{actorName}</span>
          <span className="msg-when">{sentLabel}</span>
        </div>
        <div className="msg-body">{body}</div>
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
