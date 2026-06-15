import "server-only";

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestAiHandoffReplies,
  guestAiHandoffReplyAttachments,
  guestAiHandoffs,
  type GuestAiHandoffReplyAttachment,
} from "@/lib/db/schema/guest-ai-concierge";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS_PER_REPLY,
  type AllowedMimeType,
  type AttachmentVisibility,
} from "./attachments-pure";
import { createSignedDownloadUrl } from "./attachments-storage";

/**
 * Internal admin projection of attachments — keeps `storagePath` so
 * the admin UI can mint signed URLs for staff.
 */
export interface AdminAttachmentRow extends GuestAiHandoffReplyAttachment {
  signedUrl: string | null;
}

export async function listAdminAttachmentsForHandoff(
  handoffId: string,
): Promise<AdminAttachmentRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // Tenancy: scope through the parent handoff. guest_ai_handoffs.organization_id
  // is a nullable 0154 backfill anchor — NULL = pre-threading (shared);
  // set-but-mismatched belongs to another tenant and is excluded, so we never
  // mint signed download URLs for cross-org attachments.
  const rows = (
    await db
      .select({ att: guestAiHandoffReplyAttachments })
      .from(guestAiHandoffReplyAttachments)
      .innerJoin(
        guestAiHandoffs,
        eq(guestAiHandoffs.id, guestAiHandoffReplyAttachments.handoffId),
      )
      .where(
        and(
          eq(guestAiHandoffReplyAttachments.handoffId, handoffId),
          sql`${guestAiHandoffReplyAttachments.uploadStatus} <> 'deleted'`,
          or(
            isNull(guestAiHandoffs.organizationId),
            eq(guestAiHandoffs.organizationId, organizationId),
          ),
        ),
      )
      .orderBy(asc(guestAiHandoffReplyAttachments.createdAt))
  ).map((r) => r.att);
  return Promise.all(
    rows.map(async (r) => {
      let signedUrl: string | null = null;
      if (r.uploadStatus === "uploaded") {
        const signed = await createSignedDownloadUrl(r.storagePath);
        signedUrl = signed?.url ?? null;
      }
      return { ...r, signedUrl };
    }),
  );
}

/**
 * Guest-safe projection — drops `storagePath`, drops internal-only,
 * drops anything not in `uploaded` status. Mints a fresh signed URL
 * per row at request time.
 *
 * V9L: also drops rows where metadata stripping failed or hasn't
 * finished yet. The "Processing securely…" placeholder on the
 * guest detail page is rendered separately, from
 * `pendingGuestAttachmentsForHandoff`, so the guest gets a clear
 * waiting state instead of an empty timeline.
 */
export interface GuestAttachmentView {
  id: string;
  replyId: string;
  fileName: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  uploadedAt: string | null;
  uploadedByType: "guest" | "staff";
  signedUrl: string | null;
  signedUrlExpiresAt: string | null;
}

export async function listGuestVisibleAttachmentsForHandoff(
  handoffId: string,
): Promise<GuestAttachmentView[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(
      and(
        eq(guestAiHandoffReplyAttachments.handoffId, handoffId),
        eq(guestAiHandoffReplyAttachments.visibility, "guest_visible"),
        eq(guestAiHandoffReplyAttachments.uploadStatus, "uploaded"),
        sql`${guestAiHandoffReplyAttachments.metadataStatus} in ('stripped','not_required','warning')`,
        sql`${guestAiHandoffReplyAttachments.securityScanStatus} in ('passed','warning')`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplyAttachments.createdAt));
  return Promise.all(
    rows.map(async (r) => {
      const signed = await createSignedDownloadUrl(r.storagePath);
      return {
        id: r.id,
        replyId: r.replyId,
        fileName: r.fileName,
        mimeType: r.mimeType as AllowedMimeType,
        sizeBytes: Number(
          r.processedSizeBytes ?? r.sizeBytes,
        ),
        uploadedAt: r.uploadedAt
          ? r.uploadedAt.toISOString()
          : null,
        uploadedByType: r.uploadedByType as "guest" | "staff",
        signedUrl: signed?.url ?? null,
        signedUrlExpiresAt: signed?.expiresAt
          ? signed.expiresAt.toISOString()
          : null,
      };
    }),
  );
}

/**
 * V9L — attachments still being processed (uploaded but not yet
 * stripped, or that failed). Drives the "Processing securely…" /
 * "could not be processed" placeholders on the guest UI.
 */
export interface PendingAttachmentSlot {
  id: string;
  replyId: string;
  fileName: string;
  state: "processing" | "failed";
}

export async function pendingGuestAttachmentsForHandoff(
  handoffId: string,
): Promise<PendingAttachmentSlot[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: guestAiHandoffReplyAttachments.id,
      replyId: guestAiHandoffReplyAttachments.replyId,
      fileName: guestAiHandoffReplyAttachments.fileName,
      metadataStatus: guestAiHandoffReplyAttachments.metadataStatus,
      uploadStatus: guestAiHandoffReplyAttachments.uploadStatus,
      uploadedByType: guestAiHandoffReplyAttachments.uploadedByType,
    })
    .from(guestAiHandoffReplyAttachments)
    .where(
      and(
        eq(guestAiHandoffReplyAttachments.handoffId, handoffId),
        eq(guestAiHandoffReplyAttachments.visibility, "guest_visible"),
        eq(guestAiHandoffReplyAttachments.uploadedByType, "guest"),
        sql`${guestAiHandoffReplyAttachments.uploadStatus} in ('uploaded','pending')`,
        sql`${guestAiHandoffReplyAttachments.metadataStatus} in ('pending','failed')`,
      ),
    )
    .orderBy(asc(guestAiHandoffReplyAttachments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    replyId: r.replyId,
    fileName: r.fileName,
    state: r.metadataStatus === "failed" ? "failed" : "processing",
  }));
}

export interface AttachmentCountsByReply {
  /** counts pending+uploaded only — `failed` and `deleted` don't
   *  count against the per-reply limit. */
  byReplyId: Map<string, number>;
}

export async function countAttachmentsByReply(
  replyIds: ReadonlyArray<string>,
): Promise<AttachmentCountsByReply> {
  const out: AttachmentCountsByReply = { byReplyId: new Map() };
  if (replyIds.length === 0) return out;
  const db = getDb();
  if (!db) return out;
  const rows = await db
    .select({
      replyId: guestAiHandoffReplyAttachments.replyId,
      c: sql<number>`count(*) filter (where ${guestAiHandoffReplyAttachments.uploadStatus} in ('pending','uploaded'))`,
    })
    .from(guestAiHandoffReplyAttachments)
    .where(inArray(guestAiHandoffReplyAttachments.replyId, replyIds))
    .groupBy(guestAiHandoffReplyAttachments.replyId);
  for (const r of rows) {
    out.byReplyId.set(r.replyId, Number(r.c));
  }
  return out;
}

/**
 * Server-side preflight: ensures the reply exists, belongs to the
 * supplied handoff, and has room for one more attachment of the
 * given visibility. Returns `{ ok: true, reply, handoff }` or a
 * structured error.
 */
export interface AttachmentPreflightOk {
  ok: true;
  reply: typeof guestAiHandoffReplies.$inferSelect;
  handoff: typeof guestAiHandoffs.$inferSelect;
}
export interface AttachmentPreflightError {
  ok: false;
  reason:
    | "no_db"
    | "reply_not_found"
    | "reply_not_in_handoff"
    | "too_many_attachments"
    | "uploader_mismatch"
    | "visibility_mismatch";
}

export async function preflightAttachment(args: {
  replyId: string;
  expectedHandoffId?: string;
  /** Caller is "guest" or "staff" — validates the reply's author or
   *  the visibility permission accordingly. */
  uploader: "guest" | "staff";
  /** Visibility the caller is requesting; ignored for guest uploads
   *  (always `guest_visible`). */
  visibility?: AttachmentVisibility;
  /** TENANCY: when set (staff path), the resolved handoff must belong to
   *  this org. guest_ai_handoffs.organization_id is a nullable 0154 anchor —
   *  NULL = pre-threading (allowed), set-but-mismatched = cross-org (rejected
   *  as reply_not_in_handoff). The guest path leaves this undefined and relies
   *  on its own token ownership check at the caller. */
  orgId?: string;
}): Promise<AttachmentPreflightOk | AttachmentPreflightError> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [reply] = await db
    .select()
    .from(guestAiHandoffReplies)
    .where(eq(guestAiHandoffReplies.id, args.replyId))
    .limit(1);
  if (!reply) return { ok: false, reason: "reply_not_found" };
  if (
    args.expectedHandoffId &&
    reply.handoffId !== args.expectedHandoffId
  ) {
    return { ok: false, reason: "reply_not_in_handoff" };
  }
  // Guest can only attach to their own (guest-visible) replies; staff
  // can attach to any non-guest reply on the handoff.
  if (args.uploader === "guest" && reply.authorType !== "guest") {
    return { ok: false, reason: "uploader_mismatch" };
  }
  if (args.uploader === "staff" && reply.authorType === "guest") {
    return { ok: false, reason: "uploader_mismatch" };
  }
  if (
    args.uploader === "guest" &&
    args.visibility &&
    args.visibility !== "guest_visible"
  ) {
    return { ok: false, reason: "visibility_mismatch" };
  }
  const [handoff] = await db
    .select()
    .from(guestAiHandoffs)
    .where(
      args.orgId
        ? and(
            eq(guestAiHandoffs.id, reply.handoffId),
            or(
              isNull(guestAiHandoffs.organizationId),
              eq(guestAiHandoffs.organizationId, args.orgId),
            ),
          )
        : eq(guestAiHandoffs.id, reply.handoffId),
    )
    .limit(1);
  if (!handoff) return { ok: false, reason: "reply_not_in_handoff" };

  // Enforce max attachments per reply.
  const counts = await countAttachmentsByReply([reply.id]);
  const used = counts.byReplyId.get(reply.id) ?? 0;
  if (used >= MAX_ATTACHMENTS_PER_REPLY) {
    return { ok: false, reason: "too_many_attachments" };
  }
  return { ok: true, reply, handoff };
}

/**
 * Pure-shaped MIME guard, re-exported here so callers don't have to
 * reach into pure helpers when they're already in a server file.
 */
export function isAllowedMime(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}
