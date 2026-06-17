"use client";

/**
 * Phase 2.1 PR 4 — Agent detail interactive shell.
 *
 * Owns transcript state + composer wiring on the client. The parent
 * server page resolves the initial transcript + agent metadata,
 * then this component takes over for inline test runs via
 * `useAgentStream`.
 *
 * Routed-to-human clicks open a Modal whose "Acknowledge & route"
 * CTA calls routeAgentReplyToHuman — persisting the hand-off as an
 * agent_outputs row (status="awaiting_review") in the review inbox.
 */

import * as React from "react";
import { AgentTranscript, type AgentTranscriptMessage } from "@/components/ai-agents/agent-transcript";
import { AgentComposer } from "@/components/ai-agents/agent-composer";
import { useAgentStream } from "@/features/ai-agents/use-stream";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { routeAgentReplyToHuman } from "@/lib/development/server/ai-outputs/route-to-human-action";

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
  const [handoffPending, startHandoff] = React.useTransition();
  const [handoffError, setHandoffError] = React.useState<string | null>(null);
  const [handoffDone, setHandoffDone] = React.useState(false);
  const stream = useAgentStream({ agentCode });

  function openRoute(operator: string) {
    setHandoffError(null);
    setHandoffDone(false);
    setRoutedOperator(operator);
  }

  function closeRoute() {
    setRoutedOperator(null);
    setHandoffError(null);
    setHandoffDone(false);
  }

  function acknowledgeHandoff() {
    if (!routedOperator) return;
    setHandoffError(null);
    // Most recent agent message becomes the hand-off context.
    const lastAgent = [...messages]
      .reverse()
      .find((m) => m.actor === "agent");
    startHandoff(async () => {
      const r = await routeAgentReplyToHuman({
        agentCode,
        routedTo: routedOperator,
        context:
          typeof lastAgent?.body === "string" ? lastAgent.body : undefined,
      });
      if (!r.ok) {
        setHandoffError(r.error ?? "Hand-off failed.");
        return;
      }
      setHandoffDone(true);
    });
  }

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
        onRoutedToClick={openRoute}
      />
      <AgentComposer onSubmit={handleSubmit} disabled={stream.streaming} />

      <Modal
        open={routedOperator !== null}
        onOpenChange={(o) => !o && closeRoute()}
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
          description="Queues the agent reply for a human to review in the AI inbox."
          onClose={closeRoute}
        />
        <ModalBody>
          {handoffDone ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
              Queued for{" "}
              <b style={{ color: "var(--ink)" }}>{routedOperator}</b>. It now
              appears in the AI agents inbox awaiting review.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
              The latest agent reply will be queued for{" "}
              <b style={{ color: "var(--ink)" }}>{routedOperator}</b> as a
              hand-off in the review inbox.
            </p>
          )}
          {handoffError && (
            <p
              role="alert"
              style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger)" }}
            >
              {handoffError}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={closeRoute}
            disabled={handoffPending}
          >
            {handoffDone ? "Close" : "Cancel"}
          </button>
          {!handoffDone && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={acknowledgeHandoff}
              disabled={handoffPending}
            >
              {handoffPending ? "Routing…" : "Acknowledge & route"}
            </button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
