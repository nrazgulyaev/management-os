"use client";

/**
 * Phase 2.1 PR 4 — AgentMessage (template 07 · transcript row).
 *
 * Polymorphic on `actor`:
 *   - user   → square avatar w/ initials, channel chip in meta
 *   - agent  → gradient avatar, confidence + routedReason chips
 *   - tool   → small grey square ▶, mono key=value body
 *
 * Streaming agent messages append a 3-dot typing indicator after
 * the body when `streaming` is true.
 */

import * as React from "react";

export type AgentMessageActor = "user" | "agent" | "tool";

export interface AgentMessageProps {
  actor: AgentMessageActor;
  /** Display name (user/agent). */
  actorName?: string;
  /** Channel ("Airbnb", "WhatsApp", "Email") — user only. */
  channel?: string;
  /** Tool name (e.g. "get_booking") — tool only. */
  toolName?: string;
  /** Pre-formatted timestamp or relative label. */
  timestamp: string;
  body: React.ReactNode;
  /** 0..100 — when present, "CONFIDENCE 92%" appears in meta. */
  confidence?: number;
  /** When set + confidence below threshold, renders the warn block
   *  with the reason. */
  routedReason?: string;
  /** Operator the message routed to (rendered as a link). */
  routedTo?: { name: string; href?: string };
  /** Animates the typing indicator at the end of the body. */
  streaming?: boolean;
  /** Click handler for the routed-to operator (open the route-to-
   *  inbox modal). Falls back to following `href`. */
  onRoutedToClick?: () => void;
}

export function AgentMessage({
  actor,
  actorName,
  channel,
  toolName,
  timestamp,
  body,
  confidence,
  routedReason,
  routedTo,
  streaming,
  onRoutedToClick,
}: AgentMessageProps) {
  const actorGlyph = useActorGlyph(actor, actorName);

  return (
    <div className={`msg ${actor}`}>
      <div className="actor" aria-hidden>
        {actorGlyph}
      </div>
      <div className="bubble">
        <div className="meta">
          {actor === "user" && (
            <>
              {actorName && <b>{actorName}</b>}
              {channel && <> · GUEST · via {channel}</>}
              {timestamp && <> · {timestamp}</>}
            </>
          )}
          {actor === "agent" && (
            <>
              AGENT · {timestamp}
              {confidence !== undefined && <> · CONFIDENCE {Math.round(confidence)}%</>}
              {routedReason && (
                <>
                  {" "}
                  · ROUTED TO HUMAN — REASON:{" "}
                  <b style={{ color: "var(--warn)" }}>{routedReason.toUpperCase()}</b>
                </>
              )}
            </>
          )}
          {actor === "tool" && (
            <>
              {timestamp} · TOOL · {toolName ? <b>{toolName}</b> : "—"}
            </>
          )}
        </div>
        <div className="what">
          {body}
          {streaming && <TypingDots />}
        </div>
        {actor === "agent" && routedReason && (
          <div className="msg-routed">
            Confidence
            {confidence !== undefined && <> {Math.round(confidence)}%</>} · routed
            to{" "}
            {routedTo ? (
              <RoutedTo
                name={routedTo.name}
                href={routedTo.href}
                onClick={onRoutedToClick}
              />
            ) : (
              "an operator"
            )}
            {" "}for confirmation.
          </div>
        )}
      </div>
    </div>
  );
}

function RoutedTo({
  name,
  href,
  onClick,
}: {
  name: string;
  href?: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button type="button" className="msg-routed-link" onClick={onClick}>
        <b>{name}</b>
      </button>
    );
  }
  if (href) {
    return (
      <a className="msg-routed-link" href={href}>
        <b>{name}</b>
      </a>
    );
  }
  return <b>{name}</b>;
}

function useActorGlyph(actor: AgentMessageActor, name?: string): React.ReactNode {
  return React.useMemo(() => {
    if (actor === "tool") return "▶";
    if (actor === "agent") return "AI";
    if (!name) return "?";
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    return initials || name[0]?.toUpperCase() || "?";
  }, [actor, name]);
}

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Agent is thinking">
      <span />
      <span />
      <span />
    </span>
  );
}
