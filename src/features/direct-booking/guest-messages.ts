import "server-only";

import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  directBookingGuestMessageThreads,
  directBookingGuestMessages,
  type DirectBookingGuestMessage,
  type DirectBookingGuestMessageThread,
} from "@/lib/db/schema/direct-booking-guest";
import {
  redactGuestMessage,
  validateGuestMessageBody,
  guestCanMessage,
} from "./guest-messages-pure";
import { buildPublicDirectBookingStage, type PublicGuestStage } from "./guest-status-pure";
import { resolveGuestChainByToken } from "./guest-status-services";

/**
 * Server-side message thread services for the direct-booking guest
 * status center.  Public access is gated by token; admin access is
 * gated by permissions on the action layer.
 */

// -----------------------------------------------------------------------------
// Thread resolution
// -----------------------------------------------------------------------------

export async function getOrCreateGuestMessageThreadForToken(
  token: string,
): Promise<DirectBookingGuestMessageThread | null> {
  const db = getDb();
  if (!db) return null;
  const chain = await resolveGuestChainByToken(token);
  if (!chain) return null;
  // Prefer a request-bound thread (UNIQUE on request_id) if a request
  // exists; otherwise hold-bound.
  if (chain.request) {
    const [existing] = await db
      .select()
      .from(directBookingGuestMessageThreads)
      .where(eq(directBookingGuestMessageThreads.requestId, chain.request.id))
      .limit(1);
    if (existing) return existing;
    const [row] = await db
      .insert(directBookingGuestMessageThreads)
      .values({
        holdId: chain.hold.id,
        requestId: chain.request.id,
        bookingId: chain.booking?.id ?? null,
      })
      .returning();
    return row;
  }
  const [existing] = await db
    .select()
    .from(directBookingGuestMessageThreads)
    .where(eq(directBookingGuestMessageThreads.holdId, chain.hold.id))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(directBookingGuestMessageThreads)
    .values({ holdId: chain.hold.id })
    .returning();
  return row;
}

export async function listGuestMessagesByHoldToken(
  token: string,
): Promise<DirectBookingGuestMessage[]> {
  const db = getDb();
  if (!db) return [];
  const thread = await getOrCreateGuestMessageThreadForToken(token);
  if (!thread) return [];
  return db
    .select()
    .from(directBookingGuestMessages)
    .where(
      and(
        eq(directBookingGuestMessages.threadId, thread.id),
        eq(directBookingGuestMessages.visibility, "guest_visible"),
      ),
    )
    .orderBy(asc(directBookingGuestMessages.createdAt));
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export interface CreateGuestMessageOutcome {
  ok: boolean;
  reason?: string;
  threadId?: string;
  messageId?: string;
}

export async function createGuestMessageByToken(
  token: string,
  body: string,
  opts: { ipHash: string | null } = { ipHash: null },
): Promise<CreateGuestMessageOutcome> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const validation = validateGuestMessageBody(body);
  if (validation) return { ok: false, reason: `invalid_body:${validation}` };

  const chain = await resolveGuestChainByToken(token);
  if (!chain) return { ok: false, reason: "not_found" };
  const stage = buildPublicDirectBookingStage({
    hold: { status: chain.hold.status },
    request: chain.request ? { status: chain.request.status } : null,
    deposit: chain.deposit
      ? { status: chain.deposit.status, guestClaimedPaid: chain.guestClaimedPaid }
      : null,
    booking: chain.booking
      ? {
          status: chain.booking.status,
          checkIn: chain.booking.checkIn as unknown as string,
          checkOut: chain.booking.checkOut as unknown as string,
        }
      : null,
    today: new Date().toISOString().slice(0, 10),
  });
  if (!guestCanMessage(stage)) {
    return { ok: false, reason: "messaging_disabled" };
  }
  // Rate limit — 5 per hour per token.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  const thread = await getOrCreateGuestMessageThreadForToken(token);
  if (!thread) return { ok: false, reason: "thread_unavailable" };
  if (thread.status !== "open") {
    return { ok: false, reason: "thread_closed" };
  }
  const [{ recent }] = await db
    .select({
      recent: sql<number>`COUNT(*)::int`,
    })
    .from(directBookingGuestMessages)
    .where(
      and(
        eq(directBookingGuestMessages.threadId, thread.id),
        eq(directBookingGuestMessages.authorType, "guest"),
        gt(directBookingGuestMessages.createdAt, windowStart),
      ),
    );
  if ((recent ?? 0) >= 5) {
    return { ok: false, reason: "rate_limited" };
  }
  const redacted = redactGuestMessage(body);
  const [row] = await db
    .insert(directBookingGuestMessages)
    .values({
      threadId: thread.id,
      authorType: "guest",
      body,
      bodyRedacted: redacted,
      visibility: "guest_visible",
      statusSnapshot: stage,
    })
    .returning({ id: directBookingGuestMessages.id });
  await db
    .update(directBookingGuestMessageThreads)
    .set({
      staffUnreadCount: sql`${directBookingGuestMessageThreads.staffUnreadCount} + 1`,
      lastGuestMessageAt: now,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(directBookingGuestMessageThreads.id, thread.id));
  // Touch ipHash to suppress unused warning + keep audit-friendly hook
  // for future per-IP rate-limit table.
  void opts.ipHash;
  return { ok: true, threadId: thread.id, messageId: row?.id };
}

export async function createStaffMessageInThread(
  threadId: string,
  body: string,
  visibility: "guest_visible" | "internal_only",
  createdByAppUserId: string | null,
  // TENANCY: the action passes requireOrgId() so a staff reply cannot land in
  // another tenant's thread. Nullable legacy org rows (pre-0153 backfill) are
  // still accepted via or(isNull(...)).
  organizationId: string,
): Promise<CreateGuestMessageOutcome> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const validation = validateGuestMessageBody(body);
  if (validation) return { ok: false, reason: `invalid_body:${validation}` };
  const [thread] = await db
    .select()
    .from(directBookingGuestMessageThreads)
    .where(
      and(
        eq(directBookingGuestMessageThreads.id, threadId),
        or(
          isNull(directBookingGuestMessageThreads.organizationId),
          eq(directBookingGuestMessageThreads.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  if (!thread) return { ok: false, reason: "not_found" };
  const redacted = redactGuestMessage(body);
  const now = new Date();
  const [row] = await db
    .insert(directBookingGuestMessages)
    .values({
      threadId: thread.id,
      authorType: "staff",
      body,
      bodyRedacted: redacted,
      visibility,
      createdByAppUserId: createdByAppUserId ?? null,
    })
    .returning({ id: directBookingGuestMessages.id });
  if (visibility === "guest_visible") {
    await db
      .update(directBookingGuestMessageThreads)
      .set({
        guestUnreadCount: sql`${directBookingGuestMessageThreads.guestUnreadCount} + 1`,
        lastStaffMessageAt: now,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(directBookingGuestMessageThreads.id, thread.id));
  }
  return { ok: true, threadId: thread.id, messageId: row?.id };
}

export async function markGuestThreadReadForToken(
  token: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const thread = await getOrCreateGuestMessageThreadForToken(token);
  if (!thread) return { ok: false, reason: "not_found" };
  const now = new Date();
  await db
    .update(directBookingGuestMessages)
    .set({ readByGuestAt: now })
    .where(
      and(
        eq(directBookingGuestMessages.threadId, thread.id),
        sql`${directBookingGuestMessages.readByGuestAt} IS NULL`,
        eq(directBookingGuestMessages.authorType, "staff"),
      ),
    );
  await db
    .update(directBookingGuestMessageThreads)
    .set({ guestUnreadCount: 0, updatedAt: now })
    .where(eq(directBookingGuestMessageThreads.id, thread.id));
  return { ok: true };
}

export async function markStaffThreadRead(
  threadId: string,
  // TENANCY: the action passes requireOrgId(); a cross-org thread resolves to
  // not_found before any unread counter is reset.
  organizationId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [thread] = await db
    .select({ id: directBookingGuestMessageThreads.id })
    .from(directBookingGuestMessageThreads)
    .where(
      and(
        eq(directBookingGuestMessageThreads.id, threadId),
        or(
          isNull(directBookingGuestMessageThreads.organizationId),
          eq(directBookingGuestMessageThreads.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  if (!thread) return { ok: false, reason: "not_found" };
  const now = new Date();
  await db
    .update(directBookingGuestMessages)
    .set({ readByStaffAt: now })
    .where(
      and(
        eq(directBookingGuestMessages.threadId, thread.id),
        sql`${directBookingGuestMessages.readByStaffAt} IS NULL`,
        eq(directBookingGuestMessages.authorType, "guest"),
      ),
    );
  await db
    .update(directBookingGuestMessageThreads)
    .set({ staffUnreadCount: 0, updatedAt: now })
    .where(eq(directBookingGuestMessageThreads.id, thread.id));
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Admin reads
// -----------------------------------------------------------------------------

export interface AdminThreadRow {
  id: string;
  status: "open" | "closed" | "archived";
  holdId: string | null;
  requestId: string | null;
  bookingId: string | null;
  guestUnreadCount: number;
  staffUnreadCount: number;
  lastMessageAt: string | null;
  lastGuestMessageAt: string | null;
  lastStaffMessageAt: string | null;
}

export async function listAdminThreads(opts?: {
  status?: "open" | "closed" | "archived";
}): Promise<AdminThreadRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const conditions = [
    eq(directBookingGuestMessageThreads.organizationId, organizationId),
  ] as ReturnType<typeof eq>[];
  if (opts?.status) {
    conditions.push(eq(directBookingGuestMessageThreads.status, opts.status));
  }
  const rows = await db
    .select()
    .from(directBookingGuestMessageThreads)
    .where(and(...conditions))
    .orderBy(desc(directBookingGuestMessageThreads.lastMessageAt));
  return rows.map((r) => ({
    id: r.id,
    status: r.status as "open" | "closed" | "archived",
    holdId: r.holdId,
    requestId: r.requestId,
    bookingId: r.bookingId,
    guestUnreadCount: r.guestUnreadCount,
    staffUnreadCount: r.staffUnreadCount,
    lastMessageAt:
      r.lastMessageAt instanceof Date ? r.lastMessageAt.toISOString() : null,
    lastGuestMessageAt:
      r.lastGuestMessageAt instanceof Date
        ? r.lastGuestMessageAt.toISOString()
        : null,
    lastStaffMessageAt:
      r.lastStaffMessageAt instanceof Date
        ? r.lastStaffMessageAt.toISOString()
        : null,
  }));
}

export async function getAdminThreadById(
  threadId: string,
): Promise<{
  thread: DirectBookingGuestMessageThread;
  messages: DirectBookingGuestMessage[];
} | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [thread] = await db
    .select()
    .from(directBookingGuestMessageThreads)
    .where(
      and(
        eq(directBookingGuestMessageThreads.id, threadId),
        eq(directBookingGuestMessageThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!thread) return null;
  const messages = await db
    .select()
    .from(directBookingGuestMessages)
    .where(eq(directBookingGuestMessages.threadId, thread.id))
    .orderBy(asc(directBookingGuestMessages.createdAt));
  return { thread, messages };
}

export async function setThreadStatus(
  threadId: string,
  status: "open" | "closed" | "archived",
  // TENANCY: the action passes requireOrgId() so an operator cannot
  // open/close/archive another tenant's thread.
  organizationId: string,
): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  await db
    .update(directBookingGuestMessageThreads)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(directBookingGuestMessageThreads.id, threadId),
        or(
          isNull(directBookingGuestMessageThreads.organizationId),
          eq(directBookingGuestMessageThreads.organizationId, organizationId),
        ),
      ),
    );
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Admin: list snapshots
// -----------------------------------------------------------------------------

export interface AdminSnapshotRow {
  id: string;
  holdId: string;
  requestId: string | null;
  depositId: string | null;
  bookingId: string | null;
  publicStage: PublicGuestStage;
  headline: string;
  villaLabel: string | null;
  checkIn: string | null;
  checkOut: string | null;
  updatedAt: string;
  sourceUpdatedAt: string | null;
}

export async function listAdminSnapshots(opts?: {
  stage?: PublicGuestStage;
}): Promise<AdminSnapshotRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const { directBookingGuestStatusSnapshots } = await import(
    "@/lib/db/schema/direct-booking-guest"
  );
  // TENANCY: list only the caller's tenant snapshots (legacy NULL-org rows
  // stay visible until the 0153 backfill completes).
  const orgFilter = or(
    isNull(directBookingGuestStatusSnapshots.organizationId),
    eq(directBookingGuestStatusSnapshots.organizationId, organizationId),
  );
  const where = opts?.stage
    ? and(eq(directBookingGuestStatusSnapshots.publicStage, opts.stage), orgFilter)
    : orgFilter;
  const rows = await db
    .select()
    .from(directBookingGuestStatusSnapshots)
    .where(where)
    .orderBy(desc(directBookingGuestStatusSnapshots.updatedAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    holdId: r.holdId,
    requestId: r.requestId,
    depositId: r.depositId,
    bookingId: r.bookingId,
    publicStage: r.publicStage as PublicGuestStage,
    headline: r.headline,
    villaLabel: r.villaLabel,
    checkIn: r.checkIn as unknown as string | null,
    checkOut: r.checkOut as unknown as string | null,
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : "",
    sourceUpdatedAt:
      r.sourceUpdatedAt instanceof Date
        ? r.sourceUpdatedAt.toISOString()
        : null,
  }));
}

export async function getAdminSnapshotById(
  id: string,
): Promise<AdminSnapshotRow | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const { directBookingGuestStatusSnapshots } = await import(
    "@/lib/db/schema/direct-booking-guest"
  );
  // TENANCY: a foreign snapshot id resolves to null (page calls notFound()),
  // closing leakage of another org's hold/request/deposit/booking ids.
  const [r] = await db
    .select()
    .from(directBookingGuestStatusSnapshots)
    .where(
      and(
        eq(directBookingGuestStatusSnapshots.id, id),
        or(
          isNull(directBookingGuestStatusSnapshots.organizationId),
          eq(directBookingGuestStatusSnapshots.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    holdId: r.holdId,
    requestId: r.requestId,
    depositId: r.depositId,
    bookingId: r.bookingId,
    publicStage: r.publicStage as PublicGuestStage,
    headline: r.headline,
    villaLabel: r.villaLabel,
    checkIn: r.checkIn as unknown as string | null,
    checkOut: r.checkOut as unknown as string | null,
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : "",
    sourceUpdatedAt:
      r.sourceUpdatedAt instanceof Date
        ? r.sourceUpdatedAt.toISOString()
        : null,
  };
}
