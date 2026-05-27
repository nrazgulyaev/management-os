"use client";

/**
 * Phase 2.1 PR 4 — useAgentStream hook (stub).
 *
 * The transcript component reads `streaming` to show the typing
 * indicator and `latestDelta` to append tokens as they arrive. The
 * runtime that talks to the model lands in 2.2; until then this
 * hook simulates a stream so callers can wire to the same shape.
 *
 * Caller pattern:
 *
 *   const { send, streaming, status } = useAgentStream({ agentCode });
 *   send("test message");      // returns a promise that resolves
 *                              // when the agent finishes streaming
 *
 * In 2.2 this module swaps to fetch-stream against
 * `/api/agents/{agentCode}/runs/{runId}/stream` and emits SSE
 * deltas via `EventSource`. The public surface stays the same.
 */

import * as React from "react";

export type StreamStatus = "idle" | "streaming" | "completed" | "error";

export interface AgentStreamOptions {
  /** Agent code (e.g. "concierge-auto-reply"). */
  agentCode: string;
  /** Override the simulated delay between deltas (ms). */
  tickMs?: number;
  /** Called once per delta — useful for appending to a transcript. */
  onDelta?: (token: string) => void;
  /** Called when the stream completes (full message). */
  onComplete?: (fullText: string) => void;
}

export interface UseAgentStreamResult {
  status: StreamStatus;
  streaming: boolean;
  latestDelta: string | null;
  /** Sends a prompt; returns when the simulated stream finishes. */
  send: (prompt: string) => Promise<string>;
  abort: () => void;
}

const PR_4_STUB_REPLY =
  "Stub reply — wire `/api/agents/{code}/run` in Phase 2.2 to stream real tokens.";

export function useAgentStream({
  agentCode,
  tickMs = 60,
  onDelta,
  onComplete,
}: AgentStreamOptions): UseAgentStreamResult {
  const [status, setStatus] = React.useState<StreamStatus>("idle");
  const [latestDelta, setLatestDelta] = React.useState<string | null>(null);
  const abortRef = React.useRef<{ cancelled: boolean } | null>(null);

  void agentCode; // referenced for naming + future fetch wiring

  const send = React.useCallback(
    async (_prompt: string): Promise<string> => {
      void _prompt;
      const handle = { cancelled: false };
      abortRef.current = handle;
      setStatus("streaming");
      setLatestDelta("");
      const words = PR_4_STUB_REPLY.split(" ");
      let acc = "";
      for (const word of words) {
        if (handle.cancelled) {
          setStatus("idle");
          return acc;
        }
        await new Promise((r) => setTimeout(r, tickMs));
        acc += (acc ? " " : "") + word;
        setLatestDelta(acc);
        onDelta?.(word);
      }
      setStatus("completed");
      onComplete?.(acc);
      return acc;
    },
    [tickMs, onDelta, onComplete],
  );

  const abort = React.useCallback(() => {
    if (abortRef.current) abortRef.current.cancelled = true;
  }, []);

  return {
    status,
    streaming: status === "streaming",
    latestDelta,
    send,
    abort,
  };
}
