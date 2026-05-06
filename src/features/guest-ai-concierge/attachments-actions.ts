"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffReplyAttachments } from "@/lib/db/schema/guest-ai-concierge";

import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  hashIpForLog,
  hashStayToken,
} from "@/features/guest-stays/token";
import { headers } from "next/headers";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { recordSecurityEvent } from "@/features/guest-stays/security";

import {
  guestAttachmentUploadRequestSchema,
  guestRegisterUploadedSchema,
  guestDeleteAttachmentSchema,
  staffAttachmentUploadRequestSchema,
  staffDeleteAttachmentSchema,
  registerUploadedSchema,
} from "./attachments-schema";
import {
  buildAttachmentStoragePath,
  validateAttachmentMetadata,
  ATTACHMENT_BUCKET,
  type AttachmentVisibility,
} from "./attachments-pure";
import { preflightAttachment } from "./attachments-services";
import {
  createSignedUploadToken,
  deleteStorageObject,
} from "./attachments-storage";
import { processAttachmentMetadata } from "./metadata-strip";

// =============================================================================
// Action result envelope
// =============================================================================

export type RequestUploadResult =
  | {
      ok: true;
      attachmentId: string;
      bucket: string;
      path: string;
      token: string;
      signedUrl: string;
      maxBytes: number;
    }
  | { ok: false; error: string };

export type SimpleResult = { ok: boolean; error?: string };

// =============================================================================
// Guest-side actions
// =============================================================================

export async function createGuestReplyAttachmentUploadAction(
  input: {
    token: string;
    replyId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<RequestUploadResult> {
  const parsed = guestAttachmentUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid file metadata.",
    };
  }
  const v = parsed.data;
  const tokenPrefix = v.token.slice(0, 8);
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;
  const ipHash = hashIpForLog(ip) ?? null;

  // v9G stay-token IP rate limit.
  const generalRl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!generalRl.allowed) {
    return { ok: false, error: "Too many requests. Please wait a moment." };
  }

  const resolved = await getStayByToken(v.token);
  if (!resolved.ok) return { ok: false, error: "Invalid stay link." };
  const tokenHash = hashStayToken(v.token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    return { ok: false, error: "Please verify your stay first." };
  }
  const stay = resolved.stay;

  // Defence in depth: pure validator runs alongside zod.
  const meta = validateAttachmentMetadata({
    fileName: v.fileName,
    mimeType: v.mimeType,
    sizeBytes: v.sizeBytes,
  });
  if (!meta.ok) {
    if (meta.reason === "mime_not_allowed") {
      await recordSecurityEvent({
        eventType: "suspicious_access",
        severity: "low",
        guestStayTokenId: stay.tokenId,
        bookingId: stay.bookingId,
        ipHash,
        userAgent: ua,
        metadata: {
          source: "guest_ai_handoff_attachment",
          reason: meta.reason,
          mimeType: v.mimeType,
        },
      });
    }
    return { ok: false, error: humaniseValidation(meta.reason) };
  }

  const pre = await preflightAttachment({
    replyId: v.replyId,
    uploader: "guest",
  });
  if (!pre.ok) {
    return { ok: false, error: humanisePreflight(pre.reason) };
  }
  if (pre.handoff.guestStayTokenId !== stay.tokenId) {
    return { ok: false, error: "Reply not found." };
  }

  const path = buildAttachmentStoragePath({
    handoffId: pre.handoff.id,
    replyId: pre.reply.id,
    fileName: v.fileName,
  });
  const signed = await createSignedUploadToken(path);
  if (!signed) {
    return { ok: false, error: "Storage is not configured." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const [row] = await db
    .insert(guestAiHandoffReplyAttachments)
    .values({
      replyId: pre.reply.id,
      handoffId: pre.handoff.id,
      serviceRequestId: pre.handoff.serviceRequestId,
      storageBucket: signed.bucket,
      storagePath: signed.path,
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: BigInt(v.sizeBytes),
      uploadedByType: "guest",
      uploadedByTokenId: stay.tokenId,
      uploadStatus: "pending",
      visibility: "guest_visible",
    })
    .returning({ id: guestAiHandoffReplyAttachments.id });

  await recordAuditEvent({
    actorUserId: null,
    action: "guest_ai.handoff.attachment.create",
    entityType: "guest_ai_handoff_reply_attachment",
    entityId: row!.id,
    after: {
      handoffId: pre.handoff.id,
      replyId: pre.reply.id,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
      uploader: "guest",
    },
  });

  return {
    ok: true,
    attachmentId: row!.id,
    bucket: signed.bucket,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    maxBytes: 8 * 1024 * 1024,
  };
}

export async function registerGuestReplyAttachmentUploadedAction(
  input: { token: string; attachmentId: string },
): Promise<SimpleResult> {
  const parsed = guestRegisterUploadedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const resolved = await getStayByToken(parsed.data.token);
  if (!resolved.ok) return { ok: false, error: "Invalid stay link." };
  const tokenHash = hashStayToken(parsed.data.token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) return { ok: false, error: "Verification required." };

  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const [att] = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.id, parsed.data.attachmentId))
    .limit(1);
  if (
    !att ||
    att.uploadedByType !== "guest" ||
    att.uploadedByTokenId !== resolved.stay.tokenId
  ) {
    return { ok: false, error: "Attachment not found." };
  }
  const now = new Date();
  await db
    .update(guestAiHandoffReplyAttachments)
    .set({
      uploadStatus: "uploaded",
      uploadedAt: now,
    })
    .where(eq(guestAiHandoffReplyAttachments.id, att.id));
  await recordAuditEvent({
    actorUserId: null,
    action: "guest_ai.handoff.attachment.uploaded",
    entityType: "guest_ai_handoff_reply_attachment",
    entityId: att.id,
  });
  // V9L — strip metadata before the row becomes guest-visible. Best-
  // effort: failure leaves the row out of the guest projection
  // automatically (`metadata_status='failed'` filtered downstream).
  try {
    await processAttachmentMetadata(att.id);
  } catch {
    // The processor has already flipped status to `failed` on its
    // way out; no further action.
  }
  return { ok: true };
}

export async function deleteGuestReplyAttachmentAction(
  input: { token: string; attachmentId: string },
): Promise<SimpleResult> {
  const parsed = guestDeleteAttachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const resolved = await getStayByToken(parsed.data.token);
  if (!resolved.ok) return { ok: false, error: "Invalid stay link." };
  const tokenHash = hashStayToken(parsed.data.token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) return { ok: false, error: "Verification required." };

  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const [att] = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.id, parsed.data.attachmentId))
    .limit(1);
  if (
    !att ||
    att.uploadedByType !== "guest" ||
    att.uploadedByTokenId !== resolved.stay.tokenId
  ) {
    return { ok: false, error: "Attachment not found." };
  }

  // Best-effort storage delete; row stays as the source of truth.
  await deleteStorageObject(att.storagePath);
  await db
    .update(guestAiHandoffReplyAttachments)
    .set({
      uploadStatus: "deleted",
      deletedAt: new Date(),
    })
    .where(eq(guestAiHandoffReplyAttachments.id, att.id));
  await recordAuditEvent({
    actorUserId: null,
    action: "guest_ai.handoff.attachment.delete",
    entityType: "guest_ai_handoff_reply_attachment",
    entityId: att.id,
  });
  return { ok: true };
}

// =============================================================================
// Staff-side actions
// =============================================================================

export async function createStaffReplyAttachmentUploadAction(
  input: {
    handoffId: string;
    replyId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    visibility?: AttachmentVisibility;
  },
): Promise<RequestUploadResult> {
  await requirePermission("guest_ai.handoff.attachments.write");
  const parsed = staffAttachmentUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid file metadata.",
    };
  }
  const v = parsed.data;
  const meta = validateAttachmentMetadata({
    fileName: v.fileName,
    mimeType: v.mimeType,
    sizeBytes: v.sizeBytes,
  });
  if (!meta.ok) return { ok: false, error: humaniseValidation(meta.reason) };

  const pre = await preflightAttachment({
    replyId: v.replyId,
    expectedHandoffId: v.handoffId,
    uploader: "staff",
    visibility: v.visibility,
  });
  if (!pre.ok) return { ok: false, error: humanisePreflight(pre.reason) };

  const me = await getCurrentAppUser();
  const path = buildAttachmentStoragePath({
    handoffId: v.handoffId,
    replyId: v.replyId,
    fileName: v.fileName,
  });
  const signed = await createSignedUploadToken(path);
  if (!signed) return { ok: false, error: "Storage is not configured." };

  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const [row] = await db
    .insert(guestAiHandoffReplyAttachments)
    .values({
      replyId: pre.reply.id,
      handoffId: pre.handoff.id,
      serviceRequestId: pre.handoff.serviceRequestId,
      storageBucket: signed.bucket,
      storagePath: signed.path,
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: BigInt(v.sizeBytes),
      uploadedByType: "staff",
      uploadedByAppUserId: me?.id ?? null,
      uploadStatus: "pending",
      visibility: v.visibility,
    })
    .returning({ id: guestAiHandoffReplyAttachments.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_ai.handoff.attachment.create",
    entityType: "guest_ai_handoff_reply_attachment",
    entityId: row!.id,
    after: {
      handoffId: pre.handoff.id,
      replyId: pre.reply.id,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
      uploader: "staff",
      visibility: v.visibility,
    },
  });

  return {
    ok: true,
    attachmentId: row!.id,
    bucket: signed.bucket,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    maxBytes: 8 * 1024 * 1024,
  };
}

export async function registerStaffReplyAttachmentUploadedAction(
  input: { attachmentId: string },
): Promise<SimpleResult> {
  await requirePermission("guest_ai.handoff.attachments.write");
  const parsed = registerUploadedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const [att] = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.id, parsed.data.attachmentId))
    .limit(1);
  if (!att || att.uploadedByType !== "staff") {
    return { ok: false, error: "Attachment not found." };
  }
  await db
    .update(guestAiHandoffReplyAttachments)
    .set({ uploadStatus: "uploaded", uploadedAt: new Date() })
    .where(eq(guestAiHandoffReplyAttachments.id, att.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_ai.handoff.attachment.uploaded",
    entityType: "guest_ai_handoff_reply_attachment",
    entityId: att.id,
  });
  try {
    await processAttachmentMetadata(att.id);
  } catch {
    // Already marked failed by the processor.
  }
  revalidatePath(`/dashboard/guest-ai/handoffs/${att.handoffId}`);
  return { ok: true };
}

export async function deleteStaffReplyAttachmentAction(
  input: { attachmentId: string },
): Promise<SimpleResult> {
  await requirePermission("guest_ai.handoff.attachments.write");
  const parsed = staffDeleteAttachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const [att] = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.id, parsed.data.attachmentId))
    .limit(1);
  if (!att) return { ok: false, error: "Attachment not found." };
  await deleteStorageObject(att.storagePath);
  await db
    .update(guestAiHandoffReplyAttachments)
    .set({ uploadStatus: "deleted", deletedAt: new Date() })
    .where(eq(guestAiHandoffReplyAttachments.id, att.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_ai.handoff.attachment.delete",
    entityType: "guest_ai_handoff_reply_attachment",
    entityId: att.id,
  });
  revalidatePath(`/dashboard/guest-ai/handoffs/${att.handoffId}`);
  return { ok: true };
}

// =============================================================================
// Helpers used internally to keep the action surface symmetric.
// =============================================================================

function humaniseValidation(reason: string | null): string {
  switch (reason) {
    case "mime_not_allowed":
      return "We only accept JPEG, PNG, WEBP, or PDF.";
    case "size_out_of_range":
      return "Each file must be 1 byte to 8 MB.";
    case "empty_file_name":
    case "file_name_too_long":
      return "Please give the file a normal name.";
    default:
      return "Couldn't accept this file.";
  }
}

function humanisePreflight(reason: string): string {
  switch (reason) {
    case "no_db":
      return "Service unavailable.";
    case "reply_not_found":
    case "reply_not_in_handoff":
      return "Reply not found.";
    case "too_many_attachments":
      return "Max 3 attachments per reply.";
    case "uploader_mismatch":
    case "visibility_mismatch":
      return "You can't attach to this reply.";
    default:
      return "Couldn't process the upload.";
  }
}

export { ATTACHMENT_BUCKET };
