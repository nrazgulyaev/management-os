import "server-only";

import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplies,
  guestAiHandoffReplyAttachments,
  guestAiHandoffReplyReads,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";
import { appUsers } from "@/lib/db/schema/identity";
import {
  attachmentLifecycle,
  emptyCursor,
  projectForGuest,
  publicSafeStatus,
  type StreamCursor,
} from "@/features/realtime/events";
import { createSignedDownloadUrl } from "./attachments-storage";
import {
  formatBytes,
  type AllowedMimeType,
} from "./attachments-pure";

/**
 * V9M — poll-based event sources for the concierge SSE streams.
 *
 * The streams mirror exactly the shape the existing guest /
 * admin renders. We never emit a row that wouldn't pass the same
 * projection rules used by the page-level reads (filter internal
 * notes / attachments / forbidden fields).
 *
 * Each `poll*` function takes the previous cursor and returns the
 * new events + the updated cursor. The wrapper writes the cursor
 * back so two consecutive polls don't double-emit.
 */

export interface SourceEvent {
  type:
    | "reply_created"
    | "reply_read"
    | "attachment_created"
    | "attachment_processing"
    | "attachment_uploaded"
    | "attachment_failed"
    | "handoff_status_changed"
    | "unread_count_changed";
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface SourceResult {
  events: SourceEvent[];
  cursor: StreamCursor;
}

// -----------------------------------------------------------------------------
// Seed cursors — capture the "as-of" boundary so the first poll never
// re-emits already-rendered rows.
// -----------------------------------------------------------------------------

export async function seedGuestCursor(
  handoffId: string,
): Promise<StreamCursor> {
  const cursor = emptyCursor(handoffId);
  const db = getDb();
  if (!db) return cursor;
  const [agg] = await db
    .select({
      lastReplyAt: sql<Date | null>`max(${guestAiHandoffReplies.createdAt})`,
      lastAttachmentChangeAt: sql<Date | null>`(
        SELECT max(coalesce(${guestAiHandoffReplyAttachments.uploadedAt}, ${guestAiHandoffReplyAttachments.createdAt}))
          FROM ${guestAiHandoffReplyAttachments}
         WHERE ${guestAiHandoffReplyAttachments.handoffId} = ${handoffId}
      )`,
      lastReceiptAt: sql<Date | null>`(
        SELECT max(${guestAiHandoffReplyReads.readAt})
          FROM ${guestAiHandoffReplyReads}
         WHERE ${guestAiHandoffReplyReads.handoffId} = ${handoffId}
      )`,
      lastHandoffUpdatedAt: sql<Date | null>`max(coalesce(${guestAiHandoffs.acknowledgedAt}, ${guestAiHandoffs.resolvedAt}, ${guestAiHandoffs.createdAt}))`,
    })
    .from(guestAiHandoffReplies)
    .leftJoin(
      guestAiHandoffs,
      eq(guestAiHandoffs.id, guestAiHandoffReplies.handoffId),
    )
    .where(eq(guestAiHandoffReplies.handoffId, handoffId));
  cursor.lastReplyAt = agg?.lastReplyAt ?? null;
  cursor.lastAttachmentChangeAt = agg?.lastAttachmentChangeAt ?? null;
  cursor.lastReceiptAt = agg?.lastReceiptAt ?? null;
  cursor.lastHandoffUpdatedAt = agg?.lastHandoffUpdatedAt ?? null;
  return cursor;
}

// -----------------------------------------------------------------------------
// Guest poller
// -----------------------------------------------------------------------------

export async function pollGuestEvents(
  cursor: StreamCursor,
): Promise<SourceResult> {
  const db = getDb();
  if (!db) return { events: [], cursor };
  const events: SourceEvent[] = [];
  const next: StreamCursor = { ...cursor };

  // Replies — only guest-visible. We include guest replies too so
  // the optimistic UI can reconcile against the persisted row.
  const replyRows = await db
    .select({
      id: guestAiHandoffReplies.id,
      authorType: guestAiHandoffReplies.authorType,
      visibility: guestAiHandoffReplies.visibility,
      bodyRedacted: guestAiHandoffReplies.bodyRedacted,
      replyType: guestAiHandoffReplies.replyType,
      statusSnapshot: guestAiHandoffReplies.statusSnapshot,
      createdAt: guestAiHandoffReplies.createdAt,
    })
    .from(guestAiHandoffReplies)
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, cursor.handoffId),
        eq(guestAiHandoffReplies.visibility, "guest_visible"),
        cursor.lastReplyAt
          ? gt(guestAiHandoffReplies.createdAt, cursor.lastReplyAt)
          : sql`true`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplies.createdAt));
  for (const r of replyRows) {
    events.push({
      type: "reply_created",
      occurredAt: r.createdAt,
      payload: projectForGuest({
        replyId: r.id,
        authorType: r.authorType,
        bodyRedacted: r.bodyRedacted,
        replyType: r.replyType,
        statusSnapshot: r.statusSnapshot ?? null,
        createdAt: r.createdAt.toISOString(),
      }),
    });
    next.lastReplyAt = r.createdAt;
  }

  // Attachments — guest projection + state mapping.
  const attachmentRows = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(
      and(
        eq(
          guestAiHandoffReplyAttachments.handoffId,
          cursor.handoffId,
        ),
        eq(
          guestAiHandoffReplyAttachments.visibility,
          "guest_visible",
        ),
        cursor.lastAttachmentChangeAt
          ? sql`coalesce(${guestAiHandoffReplyAttachments.uploadedAt}, ${guestAiHandoffReplyAttachments.createdAt}) > ${cursor.lastAttachmentChangeAt.toISOString()}`
          : sql`true`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplyAttachments.createdAt));
  for (const a of attachmentRows) {
    const lifecycle = attachmentLifecycle({
      uploadStatus: a.uploadStatus,
      metadataStatus: a.metadataStatus,
      securityScanStatus: a.securityScanStatus,
    });
    let payload: Record<string, unknown> = {
      attachmentId: a.id,
      replyId: a.replyId,
      fileName: a.fileName,
      mimeType: a.mimeType as AllowedMimeType,
      sizeBytesLabel: formatBytes(
        Number(a.processedSizeBytes ?? a.sizeBytes),
      ),
    };
    let type: SourceEvent["type"];
    if (lifecycle === "uploaded") {
      const signed = await createSignedDownloadUrl(a.storagePath);
      payload = projectForGuest({
        ...payload,
        signedUrl: signed?.url ?? null,
        signedUrlExpiresAt: signed?.expiresAt
          ? signed.expiresAt.toISOString()
          : null,
      });
      type = "attachment_uploaded";
    } else if (lifecycle === "failed") {
      payload = projectForGuest({
        ...payload,
        message:
          "This file could not be processed safely. Please try another file.",
      });
      type = "attachment_failed";
    } else {
      payload = projectForGuest(payload);
      type = "attachment_processing";
    }
    events.push({
      type,
      occurredAt: a.uploadedAt ?? a.createdAt,
      payload,
    });
    const ts = a.uploadedAt ?? a.createdAt;
    if (
      !next.lastAttachmentChangeAt ||
      ts > next.lastAttachmentChangeAt
    ) {
      next.lastAttachmentChangeAt = ts;
    }
  }

  // Read receipts — guests only care about staff reads of their own
  // replies (drives "Seen by team").
  const receiptRows = await db
    .select({
      replyId: guestAiHandoffReplyReads.replyId,
      readerType: guestAiHandoffReplyReads.readerType,
      readAt: guestAiHandoffReplyReads.readAt,
    })
    .from(guestAiHandoffReplyReads)
    .where(
      and(
        eq(
          guestAiHandoffReplyReads.handoffId,
          cursor.handoffId,
        ),
        eq(guestAiHandoffReplyReads.readerType, "staff"),
        cursor.lastReceiptAt
          ? gt(
              guestAiHandoffReplyReads.readAt,
              cursor.lastReceiptAt,
            )
          : sql`true`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplyReads.readAt));
  for (const r of receiptRows) {
    events.push({
      type: "reply_read",
      occurredAt: r.readAt,
      payload: projectForGuest({
        replyId: r.replyId,
        readerType: r.readerType,
      }),
    });
    next.lastReceiptAt = r.readAt;
  }

  // Handoff status — guests only see the public-safe label.
  const handoff = await loadHandoff(cursor.handoffId);
  if (handoff && hasHandoffChanged(handoff, cursor)) {
    events.push({
      type: "handoff_status_changed",
      occurredAt: handoffChangeTimestamp(handoff),
      payload: projectForGuest({
        status: publicSafeStatus(handoff.status),
        acknowledged: Boolean(handoff.acknowledgedAt),
        resolved: Boolean(handoff.resolvedAt),
      }),
    });
    next.lastHandoffUpdatedAt = handoffChangeTimestamp(handoff);
  }

  return { events, cursor: next };
}

// -----------------------------------------------------------------------------
// Admin poller
// -----------------------------------------------------------------------------

export interface AdminPollOptions {
  cursor: StreamCursor;
  /** Only when the admin has `guest_ai.handoff.notes.read` does
   *  this poller include `internal_only` replies + attachments. */
  canSeeNotes: boolean;
  /** App user id of the viewing staff — used to filter their own
   *  reads out of `reply_read` events (no point telling them they
   *  read it themselves). */
  appUserId: string | null;
}

export async function pollAdminEvents(
  opts: AdminPollOptions,
): Promise<SourceResult> {
  const db = getDb();
  const { cursor } = opts;
  if (!db) return { events: [], cursor };
  const events: SourceEvent[] = [];
  const next: StreamCursor = { ...cursor };

  // Replies. Without `notes.read`, internal-only rows are excluded
  // server-side — never even projected to the admin.
  const visibilityFilter = opts.canSeeNotes
    ? sql`true`
    : eq(guestAiHandoffReplies.visibility, "guest_visible");
  const replyRows = await db
    .select({
      id: guestAiHandoffReplies.id,
      authorType: guestAiHandoffReplies.authorType,
      visibility: guestAiHandoffReplies.visibility,
      bodyRedacted: guestAiHandoffReplies.bodyRedacted,
      replyType: guestAiHandoffReplies.replyType,
      statusSnapshot: guestAiHandoffReplies.statusSnapshot,
      authorAppUserId: guestAiHandoffReplies.authorAppUserId,
      authorName: appUsers.fullName,
      createdAt: guestAiHandoffReplies.createdAt,
    })
    .from(guestAiHandoffReplies)
    .leftJoin(
      appUsers,
      eq(appUsers.id, guestAiHandoffReplies.authorAppUserId),
    )
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, cursor.handoffId),
        visibilityFilter,
        cursor.lastReplyAt
          ? gt(guestAiHandoffReplies.createdAt, cursor.lastReplyAt)
          : sql`true`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplies.createdAt));
  for (const r of replyRows) {
    events.push({
      type: "reply_created",
      occurredAt: r.createdAt,
      payload: {
        replyId: r.id,
        authorType: r.authorType,
        visibility: r.visibility,
        bodyRedacted: r.bodyRedacted,
        replyType: r.replyType,
        statusSnapshot: r.statusSnapshot ?? null,
        authorName: r.authorName ?? null,
        createdAt: r.createdAt.toISOString(),
      },
    });
    next.lastReplyAt = r.createdAt;
  }

  // Attachments. Same notes-perm gate.
  const attachmentVisibilityFilter = opts.canSeeNotes
    ? sql`true`
    : eq(
        guestAiHandoffReplyAttachments.visibility,
        "guest_visible",
      );
  const attachmentRows = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(
      and(
        eq(
          guestAiHandoffReplyAttachments.handoffId,
          cursor.handoffId,
        ),
        attachmentVisibilityFilter,
        cursor.lastAttachmentChangeAt
          ? sql`coalesce(${guestAiHandoffReplyAttachments.uploadedAt}, ${guestAiHandoffReplyAttachments.createdAt}) > ${cursor.lastAttachmentChangeAt.toISOString()}`
          : sql`true`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplyAttachments.createdAt));
  for (const a of attachmentRows) {
    const lifecycle = attachmentLifecycle({
      uploadStatus: a.uploadStatus,
      metadataStatus: a.metadataStatus,
      securityScanStatus: a.securityScanStatus,
    });
    const safeForDownload = lifecycle === "uploaded";
    const signed = safeForDownload
      ? await createSignedDownloadUrl(a.storagePath)
      : null;
    const payload: Record<string, unknown> = {
      attachmentId: a.id,
      replyId: a.replyId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      visibility: a.visibility,
      uploadStatus: a.uploadStatus,
      metadataStatus: a.metadataStatus,
      securityScanStatus: a.securityScanStatus,
      sizeBytesLabel: formatBytes(
        Number(a.processedSizeBytes ?? a.sizeBytes),
      ),
      signedUrl: signed?.url ?? null,
    };
    events.push({
      type:
        lifecycle === "uploaded"
          ? "attachment_uploaded"
          : lifecycle === "failed"
            ? "attachment_failed"
            : "attachment_processing",
      occurredAt: a.uploadedAt ?? a.createdAt,
      payload,
    });
    const ts = a.uploadedAt ?? a.createdAt;
    if (
      !next.lastAttachmentChangeAt ||
      ts > next.lastAttachmentChangeAt
    ) {
      next.lastAttachmentChangeAt = ts;
    }
  }

  // Read receipts — guest reads only matter to staff (drive "seen by
  // guest"). We also drop receipts the current viewer wrote.
  const receiptRows = await db
    .select({
      replyId: guestAiHandoffReplyReads.replyId,
      readerType: guestAiHandoffReplyReads.readerType,
      readerAppUserId: guestAiHandoffReplyReads.readerAppUserId,
      readAt: guestAiHandoffReplyReads.readAt,
    })
    .from(guestAiHandoffReplyReads)
    .where(
      and(
        eq(
          guestAiHandoffReplyReads.handoffId,
          cursor.handoffId,
        ),
        cursor.lastReceiptAt
          ? gt(
              guestAiHandoffReplyReads.readAt,
              cursor.lastReceiptAt,
            )
          : sql`true`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplyReads.readAt));
  for (const r of receiptRows) {
    if (
      r.readerType === "staff" &&
      opts.appUserId &&
      r.readerAppUserId === opts.appUserId
    ) {
      // Skip self-reads.
      next.lastReceiptAt = r.readAt;
      continue;
    }
    events.push({
      type: "reply_read",
      occurredAt: r.readAt,
      payload: {
        replyId: r.replyId,
        readerType: r.readerType,
      },
    });
    next.lastReceiptAt = r.readAt;
  }

  // Handoff status + unread counters.
  const handoff = await loadHandoff(cursor.handoffId);
  if (handoff && hasHandoffChanged(handoff, cursor)) {
    events.push({
      type: "handoff_status_changed",
      occurredAt: handoffChangeTimestamp(handoff),
      payload: {
        status: handoff.status,
        priority: handoff.priority,
        publicStatus: publicSafeStatus(handoff.status),
        acknowledgedAt: handoff.acknowledgedAt
          ? handoff.acknowledgedAt.toISOString()
          : null,
        resolvedAt: handoff.resolvedAt
          ? handoff.resolvedAt.toISOString()
          : null,
      },
    });
    events.push({
      type: "unread_count_changed",
      occurredAt: handoffChangeTimestamp(handoff),
      payload: {
        guestUnreadCount: handoff.guestUnreadCount ?? 0,
        staffUnreadCount: handoff.staffUnreadCount ?? 0,
      },
    });
    next.lastHandoffUpdatedAt = handoffChangeTimestamp(handoff);
  }

  return { events, cursor: next };
}

// -----------------------------------------------------------------------------
// Helpers shared by both pollers
// -----------------------------------------------------------------------------

interface MinimalHandoff {
  id: string;
  status: string;
  priority: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  guestUnreadCount: number | null;
  staffUnreadCount: number | null;
}

async function loadHandoff(
  handoffId: string,
): Promise<MinimalHandoff | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: guestAiHandoffs.id,
      status: guestAiHandoffs.status,
      priority: guestAiHandoffs.priority,
      createdAt: guestAiHandoffs.createdAt,
      acknowledgedAt: guestAiHandoffs.acknowledgedAt,
      resolvedAt: guestAiHandoffs.resolvedAt,
      guestUnreadCount: guestAiHandoffs.guestUnreadCount,
      staffUnreadCount: guestAiHandoffs.staffUnreadCount,
    })
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, handoffId))
    .limit(1);
  return row ?? null;
}

function handoffChangeTimestamp(h: MinimalHandoff): Date {
  if (h.resolvedAt) return h.resolvedAt;
  if (h.acknowledgedAt) return h.acknowledgedAt;
  return h.createdAt;
}

function hasHandoffChanged(
  h: MinimalHandoff,
  cursor: StreamCursor,
): boolean {
  const ts = handoffChangeTimestamp(h);
  if (!cursor.lastHandoffUpdatedAt) return true;
  return ts.getTime() > cursor.lastHandoffUpdatedAt.getTime();
}
