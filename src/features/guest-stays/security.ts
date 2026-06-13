import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestStaySecurityEvents,
  type GuestStaySecurityEvent,
  type NewGuestStaySecurityEvent,
} from "@/lib/db/schema/guest-stay-security";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";

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
    // Guest/public path (no session). Resolve org from the stay token
    // (carries org + booking) first, else from the booking directly.
    let organizationId: string | null = null;
    if (input.guestStayTokenId) {
      const [tok] = await db
        .select({ organizationId: guestStayTokens.organizationId })
        .from(guestStayTokens)
        .where(eq(guestStayTokens.id, input.guestStayTokenId))
        .limit(1);
      organizationId = tok?.organizationId ?? null;
    }
    if (!organizationId && input.bookingId) {
      const [bk] = await db
        .select({ organizationId: bookings.organizationId })
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .limit(1);
      organizationId = bk?.organizationId ?? null;
    }
    const row: NewGuestStaySecurityEvent = {
      organizationId,
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
  const organizationId = await requireOrgId();
  const filters = [eq(guestStaySecurityEvents.organizationId, organizationId)];
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
  const organizationId = await requireOrgId();
  const since = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);
  const [r] = await db
    .select({ c: sql<number>`count(*)` })
    .from(guestStaySecurityEvents)
    .where(
      and(
        eq(guestStaySecurityEvents.organizationId, organizationId),
        sql`${guestStaySecurityEvents.severity} IN ('high','critical')`,
        sql`${guestStaySecurityEvents.createdAt} >= ${since.toISOString()}`,
      ),
    );
  return Number(r?.c ?? 0);
}
