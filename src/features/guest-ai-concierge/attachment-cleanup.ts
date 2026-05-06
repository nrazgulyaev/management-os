import "server-only";

import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffReplyAttachments } from "@/lib/db/schema/guest-ai-concierge";
import { recordAuditEvent } from "@/features/audit/services";
import { recordSecurityEvent } from "@/features/guest-stays/security";
import { deleteStorageObject } from "./attachments-storage";

const PENDING_GRACE_MS = 24 * 60 * 60 * 1000; // 24h

export interface CleanupOutcome {
  scanned: number;
  deleted: number;
  failed: number;
  notes: string[];
}

/**
 * V9L — sweep stale `pending` attachment rows older than the 24h
 * grace window:
 *
 *   • delete the storage object (best-effort)
 *   • flip `upload_status='deleted'`, `deleted_reason='stale_pending'`
 *   • emit `guest_ai.handoff.attachment.cleanup_stale` audit
 *
 * Failed-metadata rows are NOT auto-deleted in v9L — admins triage
 * them via the storage page.
 */
export async function cleanupStalePendingAttachments(opts?: {
  now?: Date;
  limit?: number;
  actorUserId?: string | null;
}): Promise<CleanupOutcome> {
  const db = getDb();
  if (!db)
    return { scanned: 0, deleted: 0, failed: 0, notes: ["no_db"] };
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - PENDING_GRACE_MS);
  const rows = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(
      and(
        eq(guestAiHandoffReplyAttachments.uploadStatus, "pending"),
        lt(guestAiHandoffReplyAttachments.createdAt, cutoff),
      ),
    )
    .orderBy(desc(guestAiHandoffReplyAttachments.createdAt))
    .limit(opts?.limit ?? 200);

  let deleted = 0;
  let failed = 0;
  const notes: string[] = [];
  for (const r of rows) {
    try {
      // Best-effort storage delete; the row in the DB is the source
      // of truth, so we proceed even if storage doesn't have the
      // object yet.
      await deleteStorageObject(r.storagePath);
      await db
        .update(guestAiHandoffReplyAttachments)
        .set({
          uploadStatus: "deleted",
          deletedAt: now,
          deletedReason: "stale_pending",
        })
        .where(eq(guestAiHandoffReplyAttachments.id, r.id));
      await recordAuditEvent({
        actorUserId: opts?.actorUserId ?? null,
        action: "guest_ai.handoff.attachment.cleanup_stale",
        entityType: "guest_ai_handoff_reply_attachment",
        entityId: r.id,
        after: {
          handoffId: r.handoffId,
          storagePath: r.storagePath,
          mimeType: r.mimeType,
        },
      });
      deleted++;
    } catch (e) {
      failed++;
      notes.push(
        `attachment ${r.id} cleanup failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }
  return { scanned: rows.length, deleted, failed, notes };
}

export interface FailedMetadataRow {
  id: string;
  handoffId: string;
  fileName: string;
  mimeType: string;
  metadataError: string | null;
  createdAt: Date;
}

export async function listFailedMetadata(
  limit = 50,
): Promise<FailedMetadataRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: guestAiHandoffReplyAttachments.id,
      handoffId: guestAiHandoffReplyAttachments.handoffId,
      fileName: guestAiHandoffReplyAttachments.fileName,
      mimeType: guestAiHandoffReplyAttachments.mimeType,
      metadataError: guestAiHandoffReplyAttachments.metadataError,
      createdAt: guestAiHandoffReplyAttachments.createdAt,
    })
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.metadataStatus, "failed"))
    .orderBy(desc(guestAiHandoffReplyAttachments.createdAt))
    .limit(limit);
  return rows;
}

/**
 * Optional helper used by server actions when an upload is rejected
 * before any DB row is written. Logs a security event so ops can
 * spot patterns (repeated bad-MIME / oversize attempts).
 */
export async function logRejectedUpload(args: {
  reason: "invalid_mime" | "too_large" | "metadata_failed" | "repeated";
  guestStayTokenId?: string | null;
  bookingId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await recordSecurityEvent({
    eventType: "suspicious_access",
    severity: args.reason === "repeated" ? "medium" : "low",
    guestStayTokenId: args.guestStayTokenId ?? null,
    bookingId: args.bookingId ?? null,
    ipHash: args.ipHash ?? null,
    userAgent: args.userAgent ?? null,
    metadata: {
      source: "guest_ai_handoff_attachment",
      reason: args.reason,
      ...args.detail,
    },
  });
}

export async function countStalePendingAttachments(opts?: {
  now?: Date;
}): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - PENDING_GRACE_MS);
  const [agg] = await db
    .select({ c: sql<number>`count(*)` })
    .from(guestAiHandoffReplyAttachments)
    .where(
      and(
        eq(guestAiHandoffReplyAttachments.uploadStatus, "pending"),
        lt(guestAiHandoffReplyAttachments.createdAt, cutoff),
      ),
    );
  return Number(agg?.c ?? 0);
}
