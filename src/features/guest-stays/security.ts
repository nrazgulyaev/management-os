import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestStaySecurityEvents,
  type GuestStaySecurityEvent,
  type NewGuestStaySecurityEvent,
} from "@/lib/db/schema/guest-stay-security";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";

export type SecurityEventType =
  | "verification_sent"
  | "verification_failed"
  | "verification_verified"
  | "verification_resent"
  | "verification_expired"
  | "token_rate_limited"
  | "suspicious_access"
  | "lock_code_viewed"
  | "wifi_viewed"
  | "wifi_password_rotated"
  | "wifi_password_migrated";

export type SecurityEventSeverity = "low" | "medium" | "high" | "critical";

export interface RecordSecurityEventInput {
  eventType: SecurityEventType;
  severity?: SecurityEventSeverity;
  guestStayTokenId?: string | null;
  bookingId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only security log. Best-effort: we swallow DB errors so a
 * verification or lock-reveal flow never fails just because audit
 * couldn't insert.
 */
export async function recordSecurityEvent(
  input: RecordSecurityEventInput,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const row: NewGuestStaySecurityEvent = {
      eventType: input.eventType,
      severity: input.severity ?? defaultSeverityFor(input.eventType),
      guestStayTokenId: input.guestStayTokenId ?? null,
      bookingId: input.bookingId ?? null,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata ?? null) as NewGuestStaySecurityEvent["metadata"],
    };
    await db.insert(guestStaySecurityEvents).values(row);
  } catch {
    // non-blocking
  }
}

export function defaultSeverityFor(
  type: SecurityEventType,
): SecurityEventSeverity {
  switch (type) {
    case "verification_failed":
      return "medium";
    case "token_rate_limited":
    case "suspicious_access":
      return "high";
    case "wifi_password_rotated":
      return "medium";
    default:
      return "low";
  }
}

export interface SecurityEventRow extends GuestStaySecurityEvent {
  tokenPrefix: string | null;
}

export async function listSecurityEvents(opts?: {
  severity?: SecurityEventSeverity | SecurityEventSeverity[];
  eventType?: SecurityEventType;
  limit?: number;
}): Promise<SecurityEventRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.severity) {
    if (Array.isArray(opts.severity)) {
      filters.push(
        sql`${guestStaySecurityEvents.severity} = ANY(${opts.severity})`,
      );
    } else {
      filters.push(eq(guestStaySecurityEvents.severity, opts.severity));
    }
  }
  if (opts?.eventType)
    filters.push(eq(guestStaySecurityEvents.eventType, opts.eventType));
  const rows = await db
    .select({
      e: guestStaySecurityEvents,
      tokenPrefix: guestStayTokens.tokenPrefix,
    })
    .from(guestStaySecurityEvents)
    .leftJoin(
      guestStayTokens,
      eq(guestStayTokens.id, guestStaySecurityEvents.guestStayTokenId),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(guestStaySecurityEvents.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    ...r.e,
    tokenPrefix: r.tokenPrefix ?? null,
  }));
}

export async function countOpenHighSeverityEvents(
  hoursWindow = 24,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);
  const [r] = await db
    .select({ c: sql<number>`count(*)` })
    .from(guestStaySecurityEvents)
    .where(
      and(
        sql`${guestStaySecurityEvents.severity} IN ('high','critical')`,
        sql`${guestStaySecurityEvents.createdAt} >= ${since.toISOString()}`,
      ),
    );
  return Number(r?.c ?? 0);
}
