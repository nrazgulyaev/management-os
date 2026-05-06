import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplies,
  guestAiHandoffs,
  type GuestAiHandoffReply,
} from "@/lib/db/schema/guest-ai-concierge";
import { appUsers } from "@/lib/db/schema/identity";

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
    .where(eq(guestAiHandoffReplies.handoffId, handoffId))
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
  now?: Date;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
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
