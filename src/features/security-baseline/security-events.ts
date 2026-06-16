import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { authSecurityEvents } from "@/lib/db/schema/security";
import { appUsers } from "@/lib/db/schema/identity";
import {
  defaultSeverityForEvent,
  sanitizeSecurityEventMetadata,
  type SecurityEventSeverity,
  type SecurityEventType,
} from "./security-events-pure";

/**
 * Centralised writer for `auth_security_events`.  Never throws — the
 * caller's primary mutation must succeed even if event capture fails.
 *
 * IP and user-agent are SHA-256 hashed before persistence; raw values
 * never touch storage.
 */

const HASH_SALT = "arconique:security-event:v1";

export function hashSecurityIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256")
    .update(`${HASH_SALT}:${value}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

export interface RecordSecurityEventInput {
  eventType: SecurityEventType;
  appUserId?: string | null;
  // TENANCY (migration 0154): stamp the owning org so listSecurityEventsForAdmin
  // can scope reads. When omitted, it is resolved from appUserId
  // (app_users.organization_id is NOT NULL); a user-less system/pre-auth event
  // stays NULL (the admin reader tolerates NULL pre-backfill rows).
  organizationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  severity?: SecurityEventSeverity;
  metadata?: Record<string, unknown>;
}

export async function recordSecurityEvent(
  input: RecordSecurityEventInput,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    let ip: string | null = input.ip ?? null;
    let ua: string | null = input.userAgent ?? null;
    if (ip === null || ua === null) {
      try {
        const h = await headers();
        ip ??= h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        ua ??= h.get("user-agent") ?? null;
      } catch {
        // Outside a request context — that's fine.
      }
    }
    // Resolve the owning org: explicit input wins, else derive from the
    // acting user (durable NOT-NULL anchor). System/pre-auth events stay NULL.
    let organizationId = input.organizationId ?? null;
    if (!organizationId && input.appUserId) {
      const [u] = await db
        .select({ organizationId: appUsers.organizationId })
        .from(appUsers)
        .where(eq(appUsers.id, input.appUserId))
        .limit(1);
      organizationId = u?.organizationId ?? null;
    }
    await db.insert(authSecurityEvents).values({
      appUserId: input.appUserId ?? null,
      organizationId,
      eventType: input.eventType,
      severity: input.severity ?? defaultSeverityForEvent(input.eventType),
      ipHash: hashSecurityIdentifier(ip),
      userAgentHash: hashSecurityIdentifier(ua),
      metadata: sanitizeSecurityEventMetadata(input.metadata ?? {}),
    });
  } catch (err) {
    // Never block the calling action.
    // eslint-disable-next-line no-console
    console.error("[security-events] insert failed", err);
  }
}
