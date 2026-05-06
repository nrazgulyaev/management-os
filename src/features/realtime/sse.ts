import "server-only";

import {
  encodeCommentFrame,
  encodeEventId,
  encodeRetryFrame,
  encodeSseFrame,
  type ConciergeEvent,
  type EventType,
  type StreamCursor,
} from "./events";

/**
 * V9M — generic Server-Sent Events response wrapper for the concierge
 * streams. Hands a `ReadableStream` back to the route handler that
 * emits `connected` + a heartbeat every 25 s, polls a source factory
 * every `pollIntervalMs`, and self-closes after `maxConnectionMs`.
 *
 * Source factories receive the current cursor and yield a list of
 * already-projected events plus an updated cursor. The wrapper
 * stamps `id`, `handoffId`, and `occurredAt`, encodes the SSE frame,
 * and writes it.
 *
 * No Redis / no LISTEN/NOTIFY in v9M; each loop is a SQL poll. The
 * polling cadence (default 2 s) is documented in ADR-0024 as a
 * deliberate trade-off — a Realtime / pub-sub backend can drop in
 * later without changing the client side.
 */

export const HEARTBEAT_MS = 25_000;
export const POLL_MS = 2_000;
export const MAX_CONNECTION_MS = 5 * 60 * 1000;
export const RECONNECT_RETRY_MS = 3_000;

export interface NewEventInput<TPayload extends Record<string, unknown>> {
  type: EventType;
  payload: TPayload;
  occurredAt?: Date;
}

export interface PollResult {
  /** Events to emit, in the order they should be sent. */
  events: NewEventInput<Record<string, unknown>>[];
  /** Updated cursor — wrapper persists it across iterations. */
  cursor: StreamCursor;
}

export interface OpenStreamOptions {
  handoffId: string;
  /** Resume seq from `Last-Event-ID`, when the prefix matches. */
  resumeSeq?: number | null;
  /** Initial cursor, normally produced by `seedCursor` from the
   *  source factory. */
  initialCursor: StreamCursor;
  /** Polling source. Receives the latest cursor and returns new
   *  events + updated cursor. Called every `pollIntervalMs`. */
  poll: (cursor: StreamCursor) => Promise<PollResult>;
  pollIntervalMs?: number;
  heartbeatMs?: number;
  maxConnectionMs?: number;
}

export interface OpenStreamResult {
  body: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
}

export function openConciergeSseStream(
  opts: OpenStreamOptions,
): OpenStreamResult {
  const encoder = new TextEncoder();
  const pollInterval = opts.pollIntervalMs ?? POLL_MS;
  const heartbeatInterval = opts.heartbeatMs ?? HEARTBEAT_MS;
  const maxDuration = opts.maxConnectionMs ?? MAX_CONNECTION_MS;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = { ...opts.initialCursor };
      if (opts.resumeSeq && opts.resumeSeq > cursor.seq) {
        cursor.seq = opts.resumeSeq;
      }

      const send = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Controller already closed — pollers race the abort, so
          // we swallow and let the loops below tear down.
        }
      };

      const emit = (event: NewEventInput<Record<string, unknown>>) => {
        cursor.seq += 1;
        const envelope: ConciergeEvent = {
          id: encodeEventId(opts.handoffId, cursor.seq),
          type: event.type,
          handoffId: opts.handoffId,
          occurredAt: (event.occurredAt ?? new Date()).toISOString(),
          payload: event.payload,
        };
        send(encodeSseFrame(envelope));
      };

      // Initial frames: retry hint + a `connected` event so the client
      // knows we're alive.
      send(encodeRetryFrame(RECONNECT_RETRY_MS));
      emit({
        type: "connected",
        payload: { resumedFromSeq: opts.resumeSeq ?? null },
      });

      const startedAt = Date.now();
      const heartbeat = setInterval(() => {
        send(encodeCommentFrame("heartbeat"));
        emit({ type: "heartbeat", payload: { ts: Date.now() } });
      }, heartbeatInterval);

      let stopped = false;
      const close = (reason: string) => {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeat);
        try {
          controller.enqueue(
            encoder.encode(encodeCommentFrame(`closing:${reason}`)),
          );
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore double-close
        }
      };

      // Connection-cap timer.
      const cap = setTimeout(
        () => close("max_connection_reached"),
        maxDuration,
      );

      // Poll loop.
      while (!stopped) {
        try {
          const result = await opts.poll(cursor);
          cursor = result.cursor;
          for (const e of result.events) {
            emit(e);
          }
        } catch (err) {
          emit({
            type: "error",
            payload: {
              message: "Live updates paused. Reconnecting…",
              detail:
                err instanceof Error
                  ? err.message.slice(0, 120)
                  : "unknown",
            },
          });
          close("poll_error");
          break;
        }
        if (Date.now() - startedAt > maxDuration) break;
        await sleep(pollInterval);
      }

      clearTimeout(cap);
      close("ended");
    },
    cancel() {
      // Client disconnected. Nothing to clean up here that the
      // start() loop won't already handle on its next iteration.
    },
  });

  return {
    body: stream,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
