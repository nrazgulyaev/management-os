import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplies,
  guestAiHandoffReplyReads,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";

/**
 * V9K — per-message read receipts.
 *
 *   • Guest reads the staff/system replies in their request center →
 *     one read row per (reply, reader_type='guest', reader_token_id).
 *   • Staff reads the guest replies on the admin handoff page →
 *     one read row per (reply, reader_type='staff', reader_app_user_id).
 *
 * The COALESCE-based unique index in the migration makes the inserts
 * idempotent. Drizzle's `onConflictDoNothing` handles the duplicate
 * write path gracefully.
 */

export async function recordGuestReadReceipts(args: {
  handoffId: string;
  guestStayTokenId: string;
  now?: Date;
}): Promise<{ marked: number }> {
  const db = getDb();
  if (!db) return { marked: 0 };
  const now = args.now ?? new Date();

  // Find every guest-visible staff/system reply for this handoff
  // that the guest hasn't read yet.
  const unread = await db
    .select({ id: guestAiHandoffReplies.id })
    .from(guestAiHandoffReplies)
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        eq(guestAiHandoffReplies.visibility, "guest_visible"),
        sql`${guestAiHandoffReplies.authorType} <> 'guest'`,
      ),
    );
  if (unread.length === 0) return { marked: 0 };

  const seen = await db
    .select({ replyId: guestAiHandoffReplyReads.replyId })
    .from(guestAiHandoffReplyReads)
    .where(
      and(
        eq(guestAiHandoffReplyReads.handoffId, args.handoffId),
        eq(guestAiHandoffReplyReads.readerType, "guest"),
        eq(guestAiHandoffReplyReads.readerTokenId, args.guestStayTokenId),
      ),
    );
  const seenIds = new Set(seen.map((r) => r.replyId));
  const fresh = unread.filter((r) => !seenIds.has(r.id));
  if (fresh.length === 0) return { marked: 0 };

  await db
    .insert(guestAiHandoffReplyReads)
    .values(
      fresh.map((r) => ({
        replyId: r.id,
        handoffId: args.handoffId,
        readerType: "guest" as const,
        readerTokenId: args.guestStayTokenId,
        readAt: now,
      })),
    )
    .onConflictDoNothing();

  // Reset the rolled-up unread counter on the handoff and stamp
  // `read_by_guest_at` on the reply rows for legacy callers.
  await db
    .update(guestAiHandoffReplies)
    .set({ readByGuestAt: now })
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        inArray(
          guestAiHandoffReplies.id,
          fresh.map((r) => r.id),
        ),
      ),
    );

  await db
    .update(guestAiHandoffs)
    .set({ guestUnreadCount: 0 })
    .where(eq(guestAiHandoffs.id, args.handoffId));

  return { marked: fresh.length };
}

export async function recordStaffReadReceipts(args: {
  handoffId: string;
  appUserId: string | null;
  now?: Date;
}): Promise<{ marked: number }> {
  const db = getDb();
  if (!db) return { marked: 0 };
  const now = args.now ?? new Date();

  const unread = await db
    .select({ id: guestAiHandoffReplies.id })
    .from(guestAiHandoffReplies)
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        eq(guestAiHandoffReplies.authorType, "guest"),
      ),
    );
  if (unread.length === 0) return { marked: 0 };

  const seenFilters = [
    eq(guestAiHandoffReplyReads.handoffId, args.handoffId),
    eq(guestAiHandoffReplyReads.readerType, "staff"),
  ];
  if (args.appUserId) {
    seenFilters.push(
      eq(guestAiHandoffReplyReads.readerAppUserId, args.appUserId),
    );
  }
  const seen = await db
    .select({ replyId: guestAiHandoffReplyReads.replyId })
    .from(guestAiHandoffReplyReads)
    .where(and(...seenFilters));
  const seenIds = new Set(seen.map((r) => r.replyId));
  const fresh = unread.filter((r) => !seenIds.has(r.id));
  if (fresh.length === 0) {
    // Even if this user has seen them, reset the rolled-up counter
    // (it tracks "any staff has read", a single value).
    await db
      .update(guestAiHandoffs)
      .set({ staffUnreadCount: 0 })
      .where(eq(guestAiHandoffs.id, args.handoffId));
    return { marked: 0 };
  }

  await db
    .insert(guestAiHandoffReplyReads)
    .values(
      fresh.map((r) => ({
        replyId: r.id,
        handoffId: args.handoffId,
        readerType: "staff" as const,
        readerAppUserId: args.appUserId,
        readAt: now,
      })),
    )
    .onConflictDoNothing();

  await db
    .update(guestAiHandoffReplies)
    .set({ readByStaffAt: now })
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        inArray(
          guestAiHandoffReplies.id,
          fresh.map((r) => r.id),
        ),
      ),
    );

  await db
    .update(guestAiHandoffs)
    .set({ staffUnreadCount: 0 })
    .where(eq(guestAiHandoffs.id, args.handoffId));

  return { marked: fresh.length };
}

export type {
  ReadReceiptSummary,
  ReaderType,
} from "./read-receipts-pure";

import type { ReadReceiptSummary } from "./read-receipts-pure";

export async function listReadReceiptsForHandoff(
  handoffId: string,
): Promise<ReadReceiptSummary> {
  const db = getDb();
  const empty: ReadReceiptSummary = {
    byReplyId: new Map(),
    firstReadByReplyId: new Map(),
  };
  if (!db) return empty;
  const rows = await db
    .select()
    .from(guestAiHandoffReplyReads)
    .where(eq(guestAiHandoffReplyReads.handoffId, handoffId));
  const byReply = new Map<string, Set<"guest" | "staff">>();
  const firstRead = new Map<
    string,
    { guest: Date | null; staff: Date | null }
  >();
  for (const r of rows) {
    const set = byReply.get(r.replyId) ?? new Set();
    set.add(r.readerType as "guest" | "staff");
    byReply.set(r.replyId, set);

    const cur = firstRead.get(r.replyId) ?? {
      guest: null,
      staff: null,
    };
    const key = r.readerType as "guest" | "staff";
    if (cur[key] === null || r.readAt < cur[key]!) {
      cur[key] = r.readAt;
    }
    firstRead.set(r.replyId, cur);
  }
  return { byReplyId: byReply, firstReadByReplyId: firstRead };
}

export interface FirstStaffReadStat {
  /** Median seconds between guest reply `created_at` and the earliest
   *  staff read row for that reply. Null when no guest replies have
   *  been read yet. */
  medianSec: number | null;
  /** Sample size used for the median. */
  samples: number;
}

export async function medianFirstStaffReadSeconds(): Promise<FirstStaffReadStat> {
  const db = getDb();
  if (!db) return { medianSec: null, samples: 0 };
  const rows = await db
    .select({
      created: guestAiHandoffReplies.createdAt,
      firstRead: sql<Date | null>`min(${guestAiHandoffReplyReads.readAt})`,
    })
    .from(guestAiHandoffReplies)
    .leftJoin(
      guestAiHandoffReplyReads,
      and(
        eq(guestAiHandoffReplyReads.replyId, guestAiHandoffReplies.id),
        eq(guestAiHandoffReplyReads.readerType, "staff"),
      ),
    )
    .where(eq(guestAiHandoffReplies.authorType, "guest"))
    .groupBy(guestAiHandoffReplies.id, guestAiHandoffReplies.createdAt);
  const durations: number[] = [];
  for (const r of rows) {
    if (!r.firstRead) continue;
    durations.push((r.firstRead.getTime() - r.created.getTime()) / 1000);
  }
  if (durations.length === 0)
    return { medianSec: null, samples: 0 };
  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 0
      ? (durations[mid - 1] + durations[mid]) / 2
      : durations[mid];
  return { medianSec: median, samples: durations.length };
}

// Pure predicates re-exported so server callers can import them from
// the same module they already pull `listReadReceiptsForHandoff` from.
export {
  replySeenByGuest,
  replySeenByStaff,
} from "./read-receipts-pure";
