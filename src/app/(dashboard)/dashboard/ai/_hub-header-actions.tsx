"use client";

/**
 * AI Cabinet depth pass — AI Hub header actions.
 *
 * Replaces three disabled stubs:
 *   · Token usage      → link to /dashboard/ai/usage (derived view).
 *   · Memory editor    → <ComingSoon> state from the block-01 state kit
 *                        (no write-back model yet — self-explaining, not a
 *                        bare disabled button).
 *   · New conversation → opens a minimal HITL agent chat against the
 *                        existing aiExecute runtime via useAgentStream.
 *
 * The chat picks a runnable agent (default executive-business) and runs
 * each turn through runMgmtAgentAction → persists to ai_assistant_runs.
 */

import * as React from "react";
import Link from "next/link";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  AgentTranscript,
  type AgentTranscriptMessage,
} from "@/components/ai-agents/agent-transcript";
import { AgentComposer } from "@/components/ai-agents/agent-composer";
import { useAgentStream } from "@/features/ai-agents/use-stream";
import { ComingSoon } from "@/components/ui/state";

export interface HubAgentOption {
  code: string;
  name: string;
}

export function HubHeaderActions({ agents }: { agents: HubAgentOption[] }) {
  const [open, setOpen] = React.useState(false);
  const [agentCode, setAgentCode] = React.useState(
    agents[0]?.code ?? "executive-business",
  );
  const [messages, setMessages] = React.useState<AgentTranscriptMessage[]>([]);
  const stream = useAgentStream({ agentCode, mode: "chat" });

  async function handleSubmit(prompt: string) {
    const now = new Date();
    const ts = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setMessages((m) => [
      ...m,
      {
        id: `u-${now.getTime()}`,
        actor: "user",
        actorName: "You",
        channel: "Console",
        timestamp: ts,
        body: prompt,
      },
    ]);
    const reply = await stream.send(prompt);
    setMessages((m) => [
      ...m,
      {
        id: `a-${Date.now()}`,
        actor: "agent",
        timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        body: reply,
        confidence: 90,
      },
    ]);
  }

  const activeName = agents.find((a) => a.code === agentCode)?.name ?? agentCode;

  return (
    <>
      <Link href="/dashboard/ai/usage" className="btn btn-secondary btn-sm">
        Token usage
      </Link>
      <ComingSoon note="A cross-agent memory editor (review / correct / forget the facts agents persist) is coming soon.">
        <span className="btn btn-secondary btn-sm">Memory editor</span>
      </ComingSoon>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
      >
        New conversation +
      </button>

      <Modal open={open} onOpenChange={setOpen} size="lg">
        <ModalHeader
          title="New conversation"
          description="A direct console to any agent. Every turn runs through the same runtime, budget gate, and audit log as scheduled runs."
          onClose={() => setOpen(false)}
        />
        <ModalBody>
          <label className="block text-[11px] uppercase tracking-widest text-ink-3 mb-1.5">
            Agent
          </label>
          <select
            className="mb-4 w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
            value={agentCode}
            onChange={(e) => {
              setAgentCode(e.target.value);
              setMessages([]);
            }}
          >
            {agents.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>

          <div className="rounded-md border border-line-soft bg-cream-warm/40 p-3 max-h-[340px] overflow-y-auto">
            {messages.length === 0 && !stream.streaming ? (
              <p className="m-0 text-[13px] text-ink-3 italic">
                Ask {activeName} anything about its domain. Read-only allowlist,
                refusal on closed periods — same guardrails as automated runs.
              </p>
            ) : (
              <AgentTranscript
                messages={messages}
                streaming={
                  stream.streaming
                    ? { actorName: activeName, body: stream.latestDelta ?? "" }
                    : undefined
                }
              />
            )}
          </div>

          {stream.error && (
            <p className="mt-2 text-[12px] text-danger" role="alert">
              {stream.error}
            </p>
          )}

          <div className="mt-3">
            <AgentComposer onSubmit={handleSubmit} disabled={stream.streaming} />
          </div>
        </ModalBody>
        <ModalFooter>
          {stream.lastRunId && (
            <Link
              href={`/dashboard/ai/runs/${stream.lastRunId}`}
              className="btn btn-ghost btn-sm"
            >
              View last run
            </Link>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
