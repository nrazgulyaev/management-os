import "server-only";

import { getDb } from "@/lib/db/client";
import {
  guestStayAccessEvents,
  type NewGuestStayAccessEvent,
} from "@/lib/db/schema/guest-stays";
import { hashIpForLog } from "./token";

/**
 * V9E — append-only access log helper. NEVER blocks the caller; on any
 * DB error, the event is dropped silently (the underlying request still
 * succeeds). Operators can find missing events by joining with
 * `guest_stay_tokens.access_count`.
 */
export async function recordStayAccessEvent(input: {
  guestStayTokenId?: string | null;
  bookingId?: string | null;
  eventType:
    | "opened"
    | "invalid_token"
    | "expired_token"
    | "revoked_token"
    | "service_request_created"
    | "guide_opened"
    | "smart_lock_viewed"
    | "wifi_viewed";
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const row: NewGuestStayAccessEvent = {
      guestStayTokenId: input.guestStayTokenId ?? null,
      bookingId: input.bookingId ?? null,
      eventType: input.eventType,
      ipHash: hashIpForLog(input.ip ?? null),
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata ?? null) as
        | NewGuestStayAccessEvent["metadata"]
        | null,
    };
    await db.insert(guestStayAccessEvents).values(row);
  } catch {
    // Best-effort.
  }
}
