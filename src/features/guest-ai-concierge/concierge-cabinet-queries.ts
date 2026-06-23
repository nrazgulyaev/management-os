import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS Concierge cabinet reads.
 *
 * Composes the existing `features/guest-ai-concierge/services.ts` +
 * `handoff-services.ts` helpers. Concierge tables sit above the
 * multi-tenancy line (scoped by guest_stay_token_id → booking → villa),
 * matching the bookings pattern.
 *
 * DEMO-2 doesn't seed any concierge sessions, messages, or handoffs —
 * all readers return empty arrays and the cabinet shows friendly
 * "ready for guests to start messaging" copy.
 */

export interface ConciergeKpis {
  activeSessions: number;
  messagesToday: number;
  handoffsOpen: number;
  refusalsToday: number;
}

export async function getConciergeKpis(): Promise<ConciergeKpis> {
  const db = getDb();
  if (!db) {
    return { activeSessions: 0, messagesToday: 0, handoffsOpen: 0, refusalsToday: 0 };
  }
  const organizationId = await requireOrgId();
  const rows = await db.execute<{
    active_sessions: string;
    messages_today: string;
    handoffs_open: string;
    refusals_today: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM guest_ai_concierge_sessions
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'active') AS active_sessions,
      COALESCE((SELECT COUNT(*)::text FROM guest_ai_concierge_messages
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)), '0') AS messages_today,
      COALESCE((SELECT COUNT(*)::text FROM guest_ai_handoffs
        WHERE organization_id = ${organizationId}::uuid
          AND status IN ('pending','open','assigned')), '0') AS handoffs_open,
      COALESCE((SELECT COUNT(*)::text FROM guest_ai_concierge_messages
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)
          AND safety_status = 'refused'), '0') AS refusals_today
  `);
  const r = rowsOf<{
    active_sessions: string;
    messages_today: string;
    handoffs_open: string;
    refusals_today: string;
  }>(rows)[0];
  return {
    activeSessions: Number(r?.active_sessions ?? "0"),
    messagesToday: Number(r?.messages_today ?? "0"),
    handoffsOpen: Number(r?.handoffs_open ?? "0"),
    refusalsToday: Number(r?.refusals_today ?? "0"),
  };
}

export interface ConciergeSessionRow {
  id: string;
  guestName: string | null;
  villaCode: string | null;
  bookingCode: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: string | null;
  language: string | null;
}

export async function listConciergeSessionsForCabinet(limit = 6): Promise<ConciergeSessionRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    status: string;
    last_message_at: string | null;
    language: string | null;
    booking_code: string | null;
    villa_code: string | null;
    guest_name: string | null;
    message_count: string;
  }>(sql`
    SELECT s.id::text                                                   AS id,
           s.status                                                       AS status,
           s.last_message_at::text                                        AS last_message_at,
           s.language                                                     AS language,
           b.booking_code                                                 AS booking_code,
           v.unit_code                                                    AS villa_code,
           b.notes                                                        AS guest_name,
           COALESCE((SELECT COUNT(*) FROM guest_ai_concierge_messages m
                      WHERE m.session_id = s.id), 0)::text                AS message_count
      FROM guest_ai_concierge_sessions s
      LEFT JOIN bookings b ON b.id = s.booking_id
      LEFT JOIN villas v ON v.id = b.villa_id
     WHERE s.organization_id = ${organizationId}::uuid
     ORDER BY s.last_message_at DESC NULLS LAST
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    status: string;
    last_message_at: string | null;
    language: string | null;
    booking_code: string | null;
    villa_code: string | null;
    guest_name: string | null;
    message_count: string;
  }>(rows).map((r) => ({
    id: r.id,
    guestName: r.guest_name?.replace(/^\[DEMO2\] /, "").trim() || null,
    villaCode: r.villa_code,
    bookingCode: r.booking_code,
    status: r.status,
    messageCount: Number(r.message_count || 0),
    lastMessageAt: r.last_message_at,
    language: r.language,
  }));
}

export interface ConciergeHandoffRow {
  id: string;
  sessionId: string | null;
  villaCode: string | null;
  guestName: string | null;
  summary: string;
  priority: string;
  status: string;
  createdAt: string;
}

export async function listConciergeHandoffsForCabinet(limit = 5): Promise<ConciergeHandoffRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    session_id: string | null;
    villa_code: string | null;
    guest_name: string | null;
    summary: string | null;
    priority: string | null;
    status: string;
    created_at: string;
  }>(sql`
    SELECT h.id::text                          AS id,
           h.session_id::text                  AS session_id,
           v.unit_code                          AS villa_code,
           b.notes                              AS guest_name,
           h.summary                            AS summary,
           h.priority                           AS priority,
           h.status                             AS status,
           h.created_at::text                   AS created_at
      FROM guest_ai_handoffs h
      LEFT JOIN guest_ai_concierge_sessions s ON s.id = h.session_id
      LEFT JOIN bookings b ON b.id = s.booking_id
      LEFT JOIN villas v ON v.id = b.villa_id
     WHERE h.organization_id = ${organizationId}::uuid
       AND h.status IN ('pending','open','assigned')
     ORDER BY h.created_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    session_id: string | null;
    villa_code: string | null;
    guest_name: string | null;
    summary: string | null;
    priority: string | null;
    status: string;
    created_at: string;
  }>(rows).map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    villaCode: r.villa_code,
    guestName: r.guest_name?.replace(/^\[DEMO2\] /, "").trim() || null,
    summary: r.summary ?? "—",
    priority: r.priority ?? "normal",
    status: r.status,
    createdAt: r.created_at,
  }));
}

export interface SafetyEventRow {
  id: string;
  villaCode: string | null;
  eventLabel: string;
  riskLevel: string;
  occurredAt: string;
  note: string;
}

/** Concierge safety events project from `guest_ai_concierge_messages.safety_status`
 *  flags over the last 24h. No dedicated `guest_ai_security_events` table. */
export async function listSafetyEventsForCabinet(limit = 5): Promise<SafetyEventRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    villa_code: string | null;
    safety_status: string;
    created_at: string;
    body: string | null;
  }>(sql`
    SELECT m.id::text                          AS id,
           v.unit_code                          AS villa_code,
           m.safety_status                      AS safety_status,
           m.created_at::text                   AS created_at,
           m.body                               AS body
      FROM guest_ai_concierge_messages m
      LEFT JOIN guest_ai_concierge_sessions s ON s.id = m.session_id
      LEFT JOIN bookings b ON b.id = s.booking_id
      LEFT JOIN villas v ON v.id = b.villa_id
     WHERE m.organization_id = ${organizationId}::uuid
       AND m.safety_status IS NOT NULL
       AND m.safety_status <> 'ok'
       AND m.created_at >= (NOW() - INTERVAL '24 hours')
     ORDER BY m.created_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    villa_code: string | null;
    safety_status: string;
    created_at: string;
    body: string | null;
  }>(rows).map((r) => ({
    id: r.id,
    villaCode: r.villa_code,
    eventLabel: r.safety_status.replace(/_/g, " "),
    riskLevel: r.safety_status === "refused" || r.safety_status === "escalated" ? "warn" : "info",
    occurredAt: r.created_at,
    note: r.body?.slice(0, 80) ?? "—",
  }));
}

// NOTE: listConciergeMemoryNotes was removed. It always returned [] and the
// table it claimed to read (project_ai_memory) is the dev-OS construction
// agents' project knowledge, not per-guest concierge facts. No guest-memory
// model exists yet — re-introduce a real reader (+ table + writer) before
// surfacing a "recalled per-guest facts" panel again.
