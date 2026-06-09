"use client";

/**
 * useAgentStream — agent test-run / chat hook.
 *
 * AI Cabinet depth pass: this now calls the real `runMgmtAgentAction`
 * server action (which runs through aiExecute → persists to
 * ai_assistant_runs + bumps org usage), then reveals the returned reply
 * with a word-by-word typing effect so the transcript still feels live.
 *
 * Caller pattern (unchanged surface):
 *
 *   const { send, streaming, status, lastRunId } = useAgentStream({ agentCode });
 *   const reply = await send("test message");
 *
 * `send` resolves with the agent's reply text. On error it resolves with
 * a short error string and sets `status = "error"` + `error`.
 */

import * as React from "react";
import {
  runMgmtAgentAction,
  type MgmtAgentRunResult,
} from "./mgmt-agent-run-action";

export type StreamStatus = "idle" | "streaming" | "completed" | "error";

export interface AgentStreamOptions {
  /** Agent code (e.g. "concierge-auto-reply"). */
  agentCode: string;
  /** "test" probe vs "chat" turn — forwarded to the action. */
  mode?: "test" | "chat";
  /** Override the reveal delay between words (ms). */
  tickMs?: number;
  onDelta?: (token: string) => void;
  onComplete?: (fullText: string) => void;
}

export interface UseAgentStreamResult {
  status: StreamStatus;
  streaming: boolean;
  latestDelta: string | null;
  error: string | null;
  /** Run id of the last successful invocation (links to /dashboard/ai/runs/[id]). */
  lastRunId: string | null;
  /** Sends a prompt; resolves with the reply (or error string). */
  send: (prompt: string) => Promise<string>;
  abort: () => void;
}

export function useAgentStream({
  agentCode,
  mode = "test",
  tickMs = 24,
  onDelta,
  onComplete,
}: AgentStreamOptions): UseAgentStreamResult {
  const [status, setStatus] = React.useState<StreamStatus>("idle");
  const [latestDelta, setLatestDelta] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRunId, setLastRunId] = React.useState<string | null>(null);
  const abortRef = React.useRef<{ cancelled: boolean } | null>(null);

  const send = React.useCallback(
    async (prompt: string): Promise<string> => {
      const handle = { cancelled: false };
      abortRef.current = handle;
      setStatus("streaming");
      setError(null);
      setLatestDelta("");

      let result: MgmtAgentRunResult;
      try {
        result = await runMgmtAgentAction({ agentCode, prompt, mode });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Run failed.";
        setError(message);
        setStatus("error");
        return message;
      }

      if (handle.cancelled) {
        setStatus("idle");
        return "";
      }

      if (!result.ok) {
        setError(result.error);
        setStatus("error");
        return result.error;
      }

      setLastRunId(result.runId);

      // Reveal the persisted reply word-by-word for a live feel.
      const words = result.reply.split(/(\s+)/);
      let acc = "";
      for (const word of words) {
        if (handle.cancelled) {
          setStatus("idle");
          return acc;
        }
        await new Promise((r) => setTimeout(r, tickMs));
        acc += word;
        setLatestDelta(acc);
        if (word.trim()) onDelta?.(word);
      }
      setStatus("completed");
      onComplete?.(result.reply);
      return result.reply;
    },
    [agentCode, mode, tickMs, onDelta, onComplete],
  );

  const abort = React.useCallback(() => {
    if (abortRef.current) abortRef.current.cancelled = true;
  }, []);

  return {
    status,
    streaming: status === "streaming",
    latestDelta,
    error,
    lastRunId,
    send,
    abort,
  };
}
