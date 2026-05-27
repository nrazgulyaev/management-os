"use client";

/**
 * Phase 2.1 PR 4 — AgentTranscript (template 07).
 *
 * Vertical conversation stream. Renders `AgentMessage`s in order
 * with auto-scroll-to-bottom on new messages (unless the user has
 * scrolled up — sticky behavior to be added in 2.2).
 */

import * as React from "react";
import { AgentMessage, type AgentMessageProps } from "./agent-message";

export interface AgentTranscriptProps {
  /** Ordered list of messages (oldest first). */
  messages: AgentTranscriptMessage[];
  /** Inflight stream — appended below the messages. */
  streaming?: {
    actorName?: string;
    body: React.ReactNode;
  };
  className?: string;
  /** Click handler for any routed-to operator link. */
  onRoutedToClick?: (operatorName: string) => void;
}

export interface AgentTranscriptMessage extends AgentMessageProps {
  id: string;
}

export function AgentTranscript({
  messages,
  streaming,
  className,
  onRoutedToClick,
}: AgentTranscriptProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  return (
    <div ref={ref} className={`transcript${className ? ` ${className}` : ""}`}>
      {messages.map((m) => (
        <AgentMessage
          key={m.id}
          {...m}
          onRoutedToClick={
            m.routedTo && onRoutedToClick
              ? () => onRoutedToClick(m.routedTo!.name)
              : m.onRoutedToClick
          }
        />
      ))}
      {streaming && (
        <AgentMessage
          actor="agent"
          actorName={streaming.actorName}
          timestamp="now"
          body={streaming.body}
          streaming
        />
      )}
    </div>
  );
}
