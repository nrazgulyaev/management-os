import "server-only";

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplies,
  guestAiHandoffs,
  type GuestAiHandoffReply,
} from "@/lib/db/schema/guest-ai-concierge";
import { appUsers } from "@/lib/db/schema/identity";
import { requireOrgId } from "@/features/auth/require-org";

export interface AdminReplyRow extends GuestAiHandoffReply {
  authorName: string | null;
}

/**
 * Admin timeline — every reply, internal notes included. Joins the
 * author display name only (never email or phone).
 */
export async function listAdminRepliesForHandoff(
  handoffId: string,
): Promise<AdminReplyRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: guest_ai_handoff_replies.organization_id is a nullable 0154
  // backfill anchor. NULL rows (pre-threading) are allowed; set-but-mismatched
  // rows belong to another tenant's handoff and must never enter this admin
  // timeline (it exposes internal_only notes + raw bodies). The page-level
  // getHandoffDetail is not org-gated, so this read is the enforcement seam.
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      r: guestAiHandoffReplies,
      authorName: appUsers.fullName,
    })
    .from(guestAiHandoffReplies)
    .leftJoin(
      appUsers,
      eq(appUsers.id, guestAiHandoffReplies.authorAppUserId),
    )
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, handoffId),
        or(
          isNull(guestAiHandoffReplies.organizationId),
          eq(guestAiHandoffReplies.organizationId, organizationId),
        ),
      ),
    )
    .orderBy(asc(guestAiHandoffReplies.createdAt));
  return rows.map((r) => ({
    ...r.r,
    authorName: r.authorName ?? null,
  }));
}

/**
 * Guest-side projection: drop internal notes, drop the raw `body`,
 * drop the `authorAppUserId`. Only `bodyRedacted`, an "ourselves vs
 * team vs system" actor label, and timestamps survive.
 */
export interface GuestVisibleReply {
  id: string;
  authorType: "guest" | "staff" | "system";
  bodyRedacted: string;
  replyType: "message" | "status_update" | "resolution";
  statusSnapshot: string | null;
  createdAt: string;
}

export async function listGuestVisibleRepliesForHandoff(
  handoffId: string,
): Promise<GuestVisibleReply[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(guestAiHandoffReplies)
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, handoffId),
        eq(guestAiHandoffReplies.visibility, "guest_visible"),
      ),
    )
    .orderBy(asc(guestAiHandoffReplies.createdAt));
  return rows
    .filter(
      (r) =>
        r.replyType === "message" ||
        r.replyType === "status_update" ||
        r.replyType === "resolution",
    )
    .map((r) => ({
      id: r.id,
      authorType: r.authorType as "guest" | "staff" | "system",
      bodyRedacted: r.bodyRedacted,
      replyType: r.replyType as
        | "message"
        | "status_update"
        | "resolution",
      statusSnapshot: r.statusSnapshot ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
}

export async function markGuestReadAt(args: {
  handoffId: string;
  now?: Date;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const now = args.now ?? new Date();
  await db
    .update(guestAiHandoffReplies)
    .set({ readByGuestAt: now })
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        eq(guestAiHandoffReplies.visibility, "guest_visible"),
        sql`${guestAiHandoffReplies.readByGuestAt} IS NULL`,
        sql`${guestAiHandoffReplies.authorType} <> 'guest'`,
      ),
    );
  await db
    .update(guestAiHandoffs)
    .set({ guestUnreadCount: 0 })
    .where(eq(guestAiHandoffs.id, args.handoffId));
}

export async function markStaffReadAt(args: {
  handoffId: string;
  /** When set, the handoff must belong to this org (NULL anchor allowed,
   *  set-but-mismatched rejected) before any staff read-state is mutated. */
  organizationId?: string;
  now?: Date;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (args.organizationId) {
    const [handoff] = await db
      .select({ organizationId: guestAiHandoffs.organizationId })
      .from(guestAiHandoffs)
      .where(eq(guestAiHandoffs.id, args.handoffId))
      .limit(1);
    // Unknown handoff or another tenant's handoff → no cross-org state write.
    if (
      !handoff ||
      (handoff.organizationId &&
        handoff.organizationId !== args.organizationId)
    ) {
      return;
    }
  }
  const now = args.now ?? new Date();
  await db
    .update(guestAiHandoffReplies)
    .set({ readByStaffAt: now })
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        sql`${guestAiHandoffReplies.readByStaffAt} IS NULL`,
        eq(guestAiHandoffReplies.authorType, "guest"),
      ),
    );
  await db
    .update(guestAiHandoffs)
    .set({ staffUnreadCount: 0 })
    .where(eq(guestAiHandoffs.id, args.handoffId));
}

export interface UnreadSummary {
  guestUnread: number;
  totalReplies: number;
}

export async function unreadSummaryForHandoff(
  handoffId: string,
): Promise<UnreadSummary> {
  const db = getDb();
  if (!db) return { guestUnread: 0, totalReplies: 0 };
  const [agg] = await db
    .select({
      total: sql<number>`count(*)`,
      guestUnread: sql<number>`count(*) filter (where ${guestAiHandoffReplies.visibility} = 'guest_visible' and ${guestAiHandoffReplies.authorType} <> 'guest' and ${guestAiHandoffReplies.readByGuestAt} is null)`,
    })
    .from(guestAiHandoffReplies)
    .where(eq(guestAiHandoffReplies.handoffId, handoffId));
  return {
    guestUnread: Number(agg?.guestUnread ?? 0),
    totalReplies: Number(agg?.total ?? 0),
  };
}
