import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { authSecurityEvents } from "@/lib/db/schema/security";
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
    await db.insert(authSecurityEvents).values({
      appUserId: input.appUserId ?? null,
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
