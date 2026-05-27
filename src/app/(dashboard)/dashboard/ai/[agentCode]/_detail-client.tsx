"use client";

/**
 * Phase 2.1 PR 4 — Agent detail interactive shell.
 *
 * Owns transcript state + composer wiring on the client. The parent
 * server page resolves the initial transcript + agent metadata,
 * then this component takes over for inline test runs via
 * `useAgentStream`.
 *
 * Routed-to-human clicks open a Modal (PR 3 primitive) — the
 * actual route-to-inbox form lands in 2.2; the placeholder
 * surfaces the operator name and an "Acknowledge" CTA.
 */

import * as React from "react";
import { AgentTranscript, type AgentTranscriptMessage } from "@/components/ai-agents/agent-transcript";
import { AgentComposer } from "@/components/ai-agents/agent-composer";
import { useAgentStream } from "@/features/ai-agents/use-stream";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export interface AgentDetailClientProps {
  agentCode: string;
  agentName: string;
  initialMessages: AgentTranscriptMessage[];
}

export function AgentDetailClient({
  agentCode,
  agentName,
  initialMessages,
}: AgentDetailClientProps) {
  const [messages, setMessages] = React.useState<AgentTranscriptMessage[]>(initialMessages);
  const [routedOperator, setRoutedOperator] = React.useState<string | null>(null);
  const stream = useAgentStream({ agentCode });

  async function handleSubmit(prompt: string) {
    const now = new Date();
    const ts = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const userMsg: AgentTranscriptMessage = {
      id: `u-${now.getTime()}`,
      actor: "user",
      actorName: "Operator (test)",
      channel: "Staging",
      timestamp: ts,
      body: prompt,
    };
    setMessages((m) => [...m, userMsg]);

    const reply = await stream.send(prompt);
    const replyMsg: AgentTranscriptMessage = {
      id: `a-${Date.now()}`,
      actor: "agent",
      timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      body: reply,
      confidence: 92,
    };
    setMessages((m) => [...m, replyMsg]);
  }

  return (
    <>
      <AgentTranscript
        messages={messages}
        streaming={
          stream.streaming
            ? { actorName: agentName, body: stream.latestDelta ?? "" }
            : undefined
        }
        onRoutedToClick={setRoutedOperator}
      />
      <AgentComposer onSubmit={handleSubmit} disabled={stream.streaming} />

      <Modal
        open={routedOperator !== null}
        onOpenChange={(o) => !o && setRoutedOperator(null)}
        size="md"
      >
        <ModalHeader
          glyph={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9" />
              <polyline points="3 4 3 12 11 12" />
            </svg>
          }
          glyphTone="warn"
          title={routedOperator ? `Route to ${routedOperator}` : "Route to human"}
          description="Hand-off form lands in Phase 2.2 — this dialog confirms the wire-through from low-confidence agent replies."
          onClose={() => setRoutedOperator(null)}
        />
        <ModalBody>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
            The agent reply will be queued for{" "}
            <b style={{ color: "var(--ink)" }}>{routedOperator}</b>. Until 2.2 wires
            the inbox handoff, this confirm just dismisses the prompt.
          </p>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRoutedOperator(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setRoutedOperator(null)}
          >
            Acknowledge
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
