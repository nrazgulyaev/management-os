/**
 * V9M — pure event envelope + projection helpers for the concierge
 * SSE streams. No DB / no server-only — safe to import on either
 * side of the boundary.
 *
 * The server emits, the client dedupes by `id`. Event ids are
 * monotonic per stream (cursor-based) so a client reconnecting with
 * Last-Event-ID can resume at the boundary.
 */

export const ALLOWED_EVENT_TYPES = [
  "connected",
  "heartbeat",
  "reply_created",
  "reply_read",
  "attachment_created",
  "attachment_processing",
  "attachment_uploaded",
  "attachment_failed",
  "handoff_status_changed",
  "unread_count_changed",
  "error",
] as const;

export type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

/**
 * Wire-shape of every SSE message. Tests pin the exact field set
 * to make sure no future contributor accidentally adds a
 * `storage_path` / `tokenHash` / etc. field at the envelope level.
 */
export interface ConciergeEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: EventType;
  handoffId: string;
  occurredAt: string;
  payload: TPayload;
}

/** Coarse cursor used by the polling source. Increments per event. */
export interface StreamCursor {
  handoffId: string;
  /** Monotonic counter, encoded into event ids. */
  seq: number;
  /** The latest `created_at` seen for replies / receipts / attachments. */
  lastReplyAt: Date | null;
  lastAttachmentChangeAt: Date | null;
  lastReceiptAt: Date | null;
  lastHandoffUpdatedAt: Date | null;
}

export function emptyCursor(handoffId: string): StreamCursor {
  return {
    handoffId,
    seq: 0,
    lastReplyAt: null,
    lastAttachmentChangeAt: null,
    lastReceiptAt: null,
    lastHandoffUpdatedAt: null,
  };
}

export function encodeEventId(
  handoffId: string,
  seq: number,
): string {
  return `${handoffId.slice(0, 8)}:${seq}`;
}

/**
 * Pure: parse Last-Event-ID into a (handoffId, seq) pair. Returns
 * null when the id is absent or malformed. The handoffId portion is
 * just the leading prefix — the route compares it to the actual
 * handoff to decide whether to honour the resume request.
 */
export function parseLastEventId(
  raw: string | null | undefined,
): { handoffPrefix: string; seq: number } | null {
  if (!raw) return null;
  const m = /^([A-Za-z0-9-]{1,12}):(\d+)$/.exec(raw.trim());
  if (!m) return null;
  const seq = Number.parseInt(m[2], 10);
  if (!Number.isFinite(seq) || seq < 0) return null;
  return { handoffPrefix: m[1], seq };
}

/**
 * Pure: format a single SSE message line per the spec
 * (`id:`, `event:`, `data:` separated by `\n`, blank line ends the
 * message). UTF-8 safe; uses `JSON.stringify` for the data line so
 * arbitrary payloads survive newlines / quotes.
 */
export function encodeSseFrame(event: ConciergeEvent): string {
  const lines = [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
  ];
  return lines.join("\n") + "\n\n";
}

/** Pure: special-case for `retry:` and the initial `connected` ping. */
export function encodeRetryFrame(retryMs: number): string {
  return `retry: ${retryMs}\n\n`;
}

export function encodeCommentFrame(text: string): string {
  return `: ${text}\n\n`;
}

// -----------------------------------------------------------------------------
// Projection rules — what the guest stream is allowed to carry.
// -----------------------------------------------------------------------------

/**
 * Banned field names — these must never appear in any payload that
 * goes to a guest. Tests grep for this list against the rendered
 * SSE-builder source.
 */
export const GUEST_FORBIDDEN_FIELDS = [
  "storage_path",
  "storagePath",
  "token_hash",
  "tokenHash",
  "password_ciphertext",
  "passwordCiphertext",
  "code_display",
  "codeDisplay",
  "displayPassword",
  "raw_token",
  "internal_only",
] as const;

/**
 * Pure: redact a payload before it goes into a guest event. Removes
 * any forbidden field at the top level + recurses one level into
 * `attachment` / `reply` sub-objects so nested DB rows can't slip
 * through.
 */
export function projectForGuest<T extends Record<string, unknown>>(
  payload: T,
): T {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if ((GUEST_FORBIDDEN_FIELDS as readonly string[]).includes(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      safe[k] = projectForGuest(v as Record<string, unknown>);
    } else {
      safe[k] = v;
    }
  }
  return safe as T;
}

/**
 * Pure: client-side dedupe set. Returns a function that records an
 * event id and reports whether it was previously seen. Bounded LRU
 * so a long-lived stream doesn't bloat memory.
 */
export function makeDedupe(maxSize = 256): {
  seen: (id: string) => boolean;
} {
  const ring: string[] = [];
  const set = new Set<string>();
  return {
    seen(id) {
      if (set.has(id)) return true;
      set.add(id);
      ring.push(id);
      if (ring.length > maxSize) {
        const evicted = ring.shift();
        if (evicted !== undefined) set.delete(evicted);
      }
      return false;
    },
  };
}

/**
 * Pure: throttle / debounce a "mark-read" action so we don't emit a
 * read-receipt write on every single new reply. Returns a guard
 * that the client calls before issuing the action.
 */
export function makeReadReceiptGate(minIntervalMs = 1500): {
  shouldEmit: () => boolean;
} {
  let lastAt = 0;
  return {
    shouldEmit() {
      const now = Date.now();
      if (now - lastAt < minIntervalMs) return false;
      lastAt = now;
      return true;
    },
  };
}

/**
 * Pure: map operational handoff statuses (`created`,
 * `linked_to_request`, `acknowledged`, `resolved`, `cancelled`)
 * onto the guest-public set. We collapse `created` and
 * `linked_to_request` to `received` so internal terminology
 * doesn't leak.
 */
export function publicSafeStatus(
  status: string,
): "received" | "acknowledged" | "resolved" | "cancelled" | "unknown" {
  switch (status) {
    case "created":
    case "linked_to_request":
      return "received";
    case "acknowledged":
      return "acknowledged";
    case "resolved":
      return "resolved";
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

/**
 * Pure: lifecycle mapper for attachment events. Drives both the
 * server-side projection and the client-side state transitions.
 *
 *   pending           → "processing"
 *   uploaded + safe   → "uploaded"
 *   anything else     → "failed"
 *
 * Inputs are the concrete column values from the row. Returning a
 * single discriminated outcome keeps the SSE projection cheap.
 */
export type AttachmentLifecycleState =
  | "processing"
  | "uploaded"
  | "failed";

export function attachmentLifecycle(input: {
  uploadStatus: string;
  metadataStatus: string;
  securityScanStatus: string;
}): AttachmentLifecycleState {
  if (input.uploadStatus === "pending") return "processing";
  if (input.uploadStatus === "uploaded") {
    const safeMeta =
      input.metadataStatus === "stripped" ||
      input.metadataStatus === "not_required" ||
      input.metadataStatus === "warning";
    const safeScan =
      input.securityScanStatus === "passed" ||
      input.securityScanStatus === "warning";
    if (safeMeta && safeScan) return "uploaded";
    if (input.metadataStatus === "pending") return "processing";
  }
  return "failed";
}
