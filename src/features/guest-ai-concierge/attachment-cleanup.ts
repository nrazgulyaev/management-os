import "server-only";

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestAiHandoffReplyAttachments,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";
import { bookings } from "@/lib/db/schema/bookings";
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { recordSecurityEvent } from "@/features/guest-stays/security";
import { deleteStorageObject } from "./attachments-storage";

/**
 * TENANCY (migration 0154) — guest_ai_handoff_reply_attachments has a nullable
 * organization_id that is NOT stamped on insert (backfill pending), so we cannot
 * trust the column. The durable org anchor is the parent handoff's booking →
 * villa → project: projects.organization_id is NOT NULL. This subquery returns
 * the attachment ids whose handoff resolves to a booking/villa/project in `orgId`.
 * Attachments whose handoff has no booking (handoffs.booking_id is nullable)
 * cannot be org-attributed and are intentionally excluded from a scoped sweep.
 */
function attachmentIdsForOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  orgId: string,
) {
  return db
    .select({ id: guestAiHandoffReplyAttachments.id })
    .from(guestAiHandoffReplyAttachments)
    .innerJoin(
      guestAiHandoffs,
      eq(guestAiHandoffs.id, guestAiHandoffReplyAttachments.handoffId),
    )
    .innerJoin(bookings, eq(bookings.id, guestAiHandoffs.bookingId))
    .innerJoin(villas, eq(villas.id, bookings.villaId))
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(projects.organizationId, orgId));
}

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
  /**
   * TENANCY: when set, the sweep is restricted to attachments whose handoff
   * resolves to a booking/villa/project in this org. The tenant-reachable
   * server action (runAttachmentCleanupAction) passes requireOrgId() so an
   * operator only sweeps their OWN org's stale attachments. The daily cron
   * leaves this undefined → global sweep (intended, runs platform-wide).
   */
  organizationId?: string;
}): Promise<CleanupOutcome> {
  const db = getDb();
  if (!db)
    return { scanned: 0, deleted: 0, failed: 0, notes: ["no_db"] };
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - PENDING_GRACE_MS);
  const filters = [
    eq(guestAiHandoffReplyAttachments.uploadStatus, "pending"),
    lt(guestAiHandoffReplyAttachments.createdAt, cutoff),
  ];
  if (opts?.organizationId) {
    filters.push(
      inArray(
        guestAiHandoffReplyAttachments.id,
        attachmentIdsForOrg(db, opts.organizationId),
      ),
    );
  }
  const rows = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(and(...filters))
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
  // TENANCY — scope to the caller's org via handoff → booking → villa → project
  // (projects.organization_id NOT NULL). Only caller is the authenticated
  // /dashboard/guest-ai/storage page, so requireOrgId() here is safe. Without
  // this, file names / MIME / error text / handoff links for EVERY tenant's
  // failed attachments would render.
  const organizationId = await requireOrgId();
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
    .innerJoin(
      guestAiHandoffs,
      eq(guestAiHandoffs.id, guestAiHandoffReplyAttachments.handoffId),
    )
    .innerJoin(bookings, eq(bookings.id, guestAiHandoffs.bookingId))
    .innerJoin(villas, eq(villas.id, bookings.villaId))
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(guestAiHandoffReplyAttachments.metadataStatus, "failed"),
        eq(projects.organizationId, organizationId),
      ),
    )
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
  /**
   * TENANCY: org to scope the aggregate to. Optional + defaults to
   * requireOrgId() so any tenant-request caller counts only its OWN org's stale
   * attachments. Pass null explicitly for an intentional platform-wide count
   * (no current caller does — this fn is currently unwired).
   */
  organizationId?: string | null;
}): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - PENDING_GRACE_MS);
  const organizationId =
    opts && "organizationId" in opts ? opts.organizationId : await requireOrgId();
  const filters = [
    eq(guestAiHandoffReplyAttachments.uploadStatus, "pending"),
    lt(guestAiHandoffReplyAttachments.createdAt, cutoff),
  ];
  if (organizationId) {
    filters.push(
      inArray(
        guestAiHandoffReplyAttachments.id,
        attachmentIdsForOrg(db, organizationId),
      ),
    );
  }
  const [agg] = await db
    .select({ c: sql<number>`count(*)` })
    .from(guestAiHandoffReplyAttachments)
    .where(and(...filters));
  return Number(agg?.c ?? 0);
}
