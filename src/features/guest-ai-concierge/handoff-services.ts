import "server-only";

import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestAiConciergeMessages,
  guestAiHandoffs,
  type GuestAiHandoff,
} from "@/lib/db/schema/guest-ai-concierge";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import { serviceRequests } from "@/lib/db/schema/operations";
import type {
  HandoffPriority,
  HandoffType,
  MessageSnapshot,
} from "./handoff-pure";

// -----------------------------------------------------------------------------
// Read helpers used by guest + admin surfaces
// -----------------------------------------------------------------------------

export interface AdminHandoffRow extends GuestAiHandoff {
  tokenPrefix: string | null;
  bookingCode: string | null;
  villaCode: string | null;
  serviceRequestCode: string | null;
  serviceRequestStatus: string | null;
}

export async function listHandoffs(opts?: {
  status?:
    | "created"
    | "linked_to_request"
    | "acknowledged"
    | "resolved"
    | "cancelled";
  priority?: HandoffPriority;
  limit?: number;
}): Promise<AdminHandoffRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // Tenancy: guest_ai_handoffs.organization_id is a nullable 0154 backfill
  // anchor. NULL = pre-threading row (shared); set-but-mismatched = another
  // tenant's row (excluded). Mirrors the acknowledge/resolve write guards.
  const filters = [
    or(
      isNull(guestAiHandoffs.organizationId),
      eq(guestAiHandoffs.organizationId, organizationId),
    ),
  ];
  if (opts?.status) filters.push(eq(guestAiHandoffs.status, opts.status));
  if (opts?.priority)
    filters.push(eq(guestAiHandoffs.priority, opts.priority));
  const rows = await db
    .select({
      h: guestAiHandoffs,
      tokenPrefix: guestStayTokens.tokenPrefix,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
      serviceRequestCode: serviceRequests.requestCode,
      serviceRequestStatus: serviceRequests.status,
    })
    .from(guestAiHandoffs)
    .leftJoin(
      guestStayTokens,
      eq(guestStayTokens.id, guestAiHandoffs.guestStayTokenId),
    )
    .leftJoin(bookings, eq(bookings.id, guestAiHandoffs.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(
      serviceRequests,
      eq(serviceRequests.id, guestAiHandoffs.serviceRequestId),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(guestAiHandoffs.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    ...r.h,
    tokenPrefix: r.tokenPrefix ?? null,
    bookingCode: r.bookingCode ?? null,
    villaCode: r.villaCode ?? null,
    serviceRequestCode: r.serviceRequestCode ?? null,
    serviceRequestStatus: r.serviceRequestStatus ?? null,
  }));
}

export interface AdminHandoffDetail {
  handoff: AdminHandoffRow;
  serviceRequest: typeof serviceRequests.$inferSelect | null;
}

export async function getHandoffDetail(
  id: string,
): Promise<AdminHandoffDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({
      h: guestAiHandoffs,
      tokenPrefix: guestStayTokens.tokenPrefix,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
      serviceRequest: serviceRequests,
    })
    .from(guestAiHandoffs)
    .leftJoin(
      guestStayTokens,
      eq(guestStayTokens.id, guestAiHandoffs.guestStayTokenId),
    )
    .leftJoin(bookings, eq(bookings.id, guestAiHandoffs.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(
      serviceRequests,
      eq(serviceRequests.id, guestAiHandoffs.serviceRequestId),
    )
    // Tenancy: nullable 0154 anchor — NULL allowed (pre-threading),
    // set-but-mismatched returns null (cross-org → notFound on the page).
    .where(
      and(
        eq(guestAiHandoffs.id, id),
        or(
          isNull(guestAiHandoffs.organizationId),
          eq(guestAiHandoffs.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    handoff: {
      ...row.h,
      tokenPrefix: row.tokenPrefix ?? null,
      bookingCode: row.bookingCode ?? null,
      villaCode: row.villaCode ?? null,
      serviceRequestCode: row.serviceRequest?.requestCode ?? null,
      serviceRequestStatus: row.serviceRequest?.status ?? null,
    },
    serviceRequest: row.serviceRequest ?? null,
  };
}

export async function listHandoffsForSession(
  sessionId: string,
): Promise<AdminHandoffRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      h: guestAiHandoffs,
      tokenPrefix: guestStayTokens.tokenPrefix,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
      serviceRequestCode: serviceRequests.requestCode,
      serviceRequestStatus: serviceRequests.status,
    })
    .from(guestAiHandoffs)
    .leftJoin(
      guestStayTokens,
      eq(guestStayTokens.id, guestAiHandoffs.guestStayTokenId),
    )
    .leftJoin(bookings, eq(bookings.id, guestAiHandoffs.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(
      serviceRequests,
      eq(serviceRequests.id, guestAiHandoffs.serviceRequestId),
    )
    // Tenancy: nullable 0154 anchor — NULL allowed, set-but-mismatched excluded.
    .where(
      and(
        eq(guestAiHandoffs.guestAiConciergeSessionId, sessionId),
        or(
          isNull(guestAiHandoffs.organizationId),
          eq(guestAiHandoffs.organizationId, organizationId),
        ),
      ),
    )
    .orderBy(desc(guestAiHandoffs.createdAt));
  return rows.map((r) => ({
    ...r.h,
    tokenPrefix: r.tokenPrefix ?? null,
    bookingCode: r.bookingCode ?? null,
    villaCode: r.villaCode ?? null,
    serviceRequestCode: r.serviceRequestCode ?? null,
    serviceRequestStatus: r.serviceRequestStatus ?? null,
  }));
}

export async function countHandoffsByStatus(): Promise<{
  created: number;
  linked: number;
  acknowledged: number;
  resolved: number;
  urgent: number;
}> {
  const db = getDb();
  if (!db)
    return {
      created: 0,
      linked: 0,
      acknowledged: 0,
      resolved: 0,
      urgent: 0,
    };
  const organizationId = await requireOrgId();
  const [agg] = await db
    .select({
      created: sql<number>`count(*) filter (where ${guestAiHandoffs.status} = 'created')`,
      linked: sql<number>`count(*) filter (where ${guestAiHandoffs.status} = 'linked_to_request')`,
      acknowledged: sql<number>`count(*) filter (where ${guestAiHandoffs.status} = 'acknowledged')`,
      resolved: sql<number>`count(*) filter (where ${guestAiHandoffs.status} = 'resolved')`,
      urgent: sql<number>`count(*) filter (where ${guestAiHandoffs.priority} = 'urgent' and ${guestAiHandoffs.status} not in ('resolved','cancelled'))`,
    })
    .from(guestAiHandoffs)
    // Tenancy: nullable 0154 anchor — count this org's rows + shared NULL rows.
    .where(
      or(
        isNull(guestAiHandoffs.organizationId),
        eq(guestAiHandoffs.organizationId, organizationId),
      ),
    );
  return {
    created: Number(agg?.created ?? 0),
    linked: Number(agg?.linked ?? 0),
    acknowledged: Number(agg?.acknowledged ?? 0),
    resolved: Number(agg?.resolved ?? 0),
    urgent: Number(agg?.urgent ?? 0),
  };
}

// -----------------------------------------------------------------------------
// Conversation excerpt for the handoff (used by the action layer)
// -----------------------------------------------------------------------------

export interface MessageWithRefusalFlag {
  role: "user" | "assistant" | "system";
  content: string;
  safetyStatus: string;
  createdAt: Date;
}

export async function getRecentSessionMessages(
  sessionId: string,
  limit = 20,
): Promise<MessageWithRefusalFlag[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      role: guestAiConciergeMessages.role,
      content: guestAiConciergeMessages.content,
      safetyStatus: guestAiConciergeMessages.safetyStatus,
      createdAt: guestAiConciergeMessages.createdAt,
    })
    .from(guestAiConciergeMessages)
    .where(eq(guestAiConciergeMessages.sessionId, sessionId))
    .orderBy(asc(guestAiConciergeMessages.createdAt));
  return rows
    .map((r) => ({
      role: r.role as "user" | "assistant" | "system",
      content: r.content,
      safetyStatus: r.safetyStatus,
      createdAt: r.createdAt,
    }))
    .slice(-limit);
}

export function lastAssistantMessageWasRefusal(
  messages: ReadonlyArray<MessageWithRefusalFlag>,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") return m.safetyStatus === "refused";
  }
  return false;
}

export function snapshotMessages(
  messages: ReadonlyArray<MessageWithRefusalFlag>,
): MessageSnapshot[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
}

// -----------------------------------------------------------------------------
// Token-scoped guest reads (their own service requests).
// -----------------------------------------------------------------------------

export interface GuestRequestSummary {
  id: string;
  requestCode: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  handoffType: HandoffType | null;
}

export async function listServiceRequestsForToken(
  guestStayTokenId: string,
  bookingId: string | null,
): Promise<GuestRequestSummary[]> {
  const db = getDb();
  if (!db) return [];
  // We resolve via handoffs (which link the SR back to the token) and
  // also via booking_id for SR rows created through other guest flows
  // (e.g. v9E free-text concierge). De-duplicate by SR id.
  const handoffRows = await db
    .select({
      sr: serviceRequests,
      handoffType: guestAiHandoffs.handoffType,
    })
    .from(guestAiHandoffs)
    .innerJoin(
      serviceRequests,
      eq(serviceRequests.id, guestAiHandoffs.serviceRequestId),
    )
    .where(eq(guestAiHandoffs.guestStayTokenId, guestStayTokenId))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);

  const bookingRows = bookingId
    ? await db
        .select({ sr: serviceRequests })
        .from(serviceRequests)
        .where(eq(serviceRequests.bookingId, bookingId))
        .orderBy(desc(serviceRequests.createdAt))
        .limit(50)
    : [];

  const seen = new Set<string>();
  const out: GuestRequestSummary[] = [];
  for (const r of handoffRows) {
    if (seen.has(r.sr.id)) continue;
    seen.add(r.sr.id);
    out.push(toGuestSummary(r.sr, r.handoffType as HandoffType));
  }
  for (const r of bookingRows) {
    if (seen.has(r.sr.id)) continue;
    seen.add(r.sr.id);
    out.push(toGuestSummary(r.sr, null));
  }
  return out
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 50);
}

function toGuestSummary(
  sr: typeof serviceRequests.$inferSelect,
  handoffType: HandoffType | null,
): GuestRequestSummary {
  return {
    id: sr.id,
    requestCode: sr.requestCode,
    title: sr.title,
    status: sr.status,
    priority: sr.priority,
    createdAt: sr.createdAt.toISOString(),
    handoffType,
  };
}

// -----------------------------------------------------------------------------
// V9J — token-scoped guest request detail (one row + handoff + replies)
// -----------------------------------------------------------------------------

export interface GuestRequestDetail {
  id: string;
  requestCode: string;
  title: string;
  message: string | null;
  status: string;
  priority: string;
  createdAt: string;
  handoff: {
    id: string;
    handoffType: HandoffType | null;
    guestSummary: string;
    status: string;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    guestUnreadCount: number;
  } | null;
}

export async function getGuestRequestDetailByCode(args: {
  guestStayTokenId: string;
  bookingId: string | null;
  requestCode: string;
}): Promise<GuestRequestDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      sr: serviceRequests,
      h: guestAiHandoffs,
    })
    .from(serviceRequests)
    .leftJoin(
      guestAiHandoffs,
      eq(guestAiHandoffs.serviceRequestId, serviceRequests.id),
    )
    .where(eq(serviceRequests.requestCode, args.requestCode))
    .limit(1);
  if (!row) return null;
  // Authorization: either it's tied to this token's handoff, or it
  // belongs to the same booking.
  const ownedByHandoff =
    row.h && row.h.guestStayTokenId === args.guestStayTokenId;
  const ownedByBooking =
    args.bookingId && row.sr.bookingId === args.bookingId;
  if (!ownedByHandoff && !ownedByBooking) return null;
  return {
    id: row.sr.id,
    requestCode: row.sr.requestCode,
    title: row.sr.title,
    message: row.sr.message,
    status: row.sr.status,
    priority: row.sr.priority,
    createdAt: row.sr.createdAt.toISOString(),
    handoff: row.h
      ? {
          id: row.h.id,
          handoffType: (row.h.handoffType as HandoffType) ?? null,
          guestSummary: row.h.guestSummary,
          status: row.h.status,
          acknowledgedAt: row.h.acknowledgedAt
            ? row.h.acknowledgedAt.toISOString()
            : null,
          resolvedAt: row.h.resolvedAt
            ? row.h.resolvedAt.toISOString()
            : null,
          guestUnreadCount: row.h.guestUnreadCount ?? 0,
        }
      : null,
  };
}

/**
 * V9J — extend the guest list projection with unread + last-update +
 * latest preview. Reads `guest_ai_handoff_replies` once per row.
 */
export interface GuestRequestSummaryWithReplies extends GuestRequestSummary {
  unreadCount: number;
  lastUpdateAt: string | null;
  latestVisibleReply: string | null;
  handoffId: string | null;
}

export async function listServiceRequestsForTokenWithReplies(
  guestStayTokenId: string,
  bookingId: string | null,
): Promise<GuestRequestSummaryWithReplies[]> {
  const db = getDb();
  if (!db) return [];
  const base = await listServiceRequestsForToken(
    guestStayTokenId,
    bookingId,
  );
  if (base.length === 0) return [];
  // Fetch matching handoffs + the latest guest_visible reply per
  // handoff.
  const { guestAiHandoffReplies } = await import(
    "@/lib/db/schema/guest-ai-concierge"
  );
  const handoffRows = await db
    .select({
      id: guestAiHandoffs.id,
      serviceRequestId: guestAiHandoffs.serviceRequestId,
      guestUnreadCount: guestAiHandoffs.guestUnreadCount,
      lastStaffReplyAt: guestAiHandoffs.lastStaffReplyAt,
      lastGuestReplyAt: guestAiHandoffs.lastGuestReplyAt,
    })
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.guestStayTokenId, guestStayTokenId));
  const handoffByRequest = new Map<
    string,
    { id: string; unread: number; lastUpdateAt: Date | null }
  >();
  for (const h of handoffRows) {
    if (!h.serviceRequestId) continue;
    const lastUpdateAt =
      h.lastStaffReplyAt ?? h.lastGuestReplyAt ?? null;
    handoffByRequest.set(h.serviceRequestId, {
      id: h.id,
      unread: h.guestUnreadCount ?? 0,
      lastUpdateAt,
    });
  }

  // Fetch latest guest_visible reply preview per handoff id (one query).
  const ids = Array.from(handoffByRequest.values()).map((v) => v.id);
  const previewByHandoff = new Map<string, string>();
  if (ids.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const replies = await db
      .select({
        handoffId: guestAiHandoffReplies.handoffId,
        body: guestAiHandoffReplies.bodyRedacted,
        createdAt: guestAiHandoffReplies.createdAt,
      })
      .from(guestAiHandoffReplies)
      .where(
        and(
          inArray(guestAiHandoffReplies.handoffId, ids),
          eq(guestAiHandoffReplies.visibility, "guest_visible"),
        ),
      )
      .orderBy(desc(guestAiHandoffReplies.createdAt));
    for (const r of replies) {
      if (!previewByHandoff.has(r.handoffId)) {
        previewByHandoff.set(r.handoffId, r.body.slice(0, 140));
      }
    }
  }

  return base.map((b) => {
    const handoff = handoffByRequest.get(b.id);
    return {
      ...b,
      unreadCount: handoff?.unread ?? 0,
      lastUpdateAt: handoff?.lastUpdateAt
        ? handoff.lastUpdateAt.toISOString()
        : null,
      latestVisibleReply: handoff
        ? previewByHandoff.get(handoff.id) ?? null
        : null,
      handoffId: handoff?.id ?? null,
    };
  });
}
