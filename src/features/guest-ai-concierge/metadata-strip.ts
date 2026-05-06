import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffReplyAttachments } from "@/lib/db/schema/guest-ai-concierge";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET } from "./attachments-pure";
import {
  stripImageMetadata,
  type MetadataStatus,
  type MetadataStripResult,
  type SecurityScanStatus,
} from "./metadata-strip-pure";

/**
 * Server-side wrapper that downloads an uploaded attachment from the
 * private Supabase bucket, runs the pure stripper, and writes the
 * processed bytes back at the same `storage_path`.
 *
 * Returns the result so the caller (the register-uploaded action and
 * the admin "Strip pending metadata" job) can log audit/security
 * events appropriately.
 */
export interface ProcessOutcome {
  attachmentId: string;
  ok: boolean;
  status: MetadataStatus;
  scan: SecurityScanStatus;
  changed: boolean;
  removed: string[];
  reason: string | null;
  originalSize: number | null;
  processedSize: number | null;
}

export async function processAttachmentMetadata(
  attachmentId: string,
): Promise<ProcessOutcome> {
  const db = getDb();
  if (!db) {
    return {
      attachmentId,
      ok: false,
      status: "failed",
      scan: "failed",
      changed: false,
      removed: [],
      reason: "no_db",
      originalSize: null,
      processedSize: null,
    };
  }
  const [att] = await db
    .select()
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.id, attachmentId))
    .limit(1);
  if (!att) {
    return {
      attachmentId,
      ok: false,
      status: "failed",
      scan: "failed",
      changed: false,
      removed: [],
      reason: "attachment_not_found",
      originalSize: null,
      processedSize: null,
    };
  }
  // Already processed → no-op.
  if (
    att.metadataStatus === "stripped" ||
    att.metadataStatus === "not_required" ||
    att.metadataStatus === "warning"
  ) {
    return {
      attachmentId,
      ok: true,
      status: att.metadataStatus as MetadataStatus,
      scan: att.securityScanStatus as SecurityScanStatus,
      changed: false,
      removed: [],
      reason: null,
      originalSize: att.originalSizeBytes
        ? Number(att.originalSizeBytes)
        : null,
      processedSize: att.processedSizeBytes
        ? Number(att.processedSizeBytes)
        : null,
    };
  }
  // PDFs need no download — flip to not_required + safe.
  if (att.mimeType === "application/pdf") {
    await db
      .update(guestAiHandoffReplyAttachments)
      .set({
        metadataStatus: "not_required",
        metadataStrippedAt: new Date(),
        securityScanStatus: "passed",
        originalSizeBytes: att.sizeBytes,
        processedSizeBytes: att.sizeBytes,
      })
      .where(eq(guestAiHandoffReplyAttachments.id, attachmentId));
    return {
      attachmentId,
      ok: true,
      status: "not_required",
      scan: "passed",
      changed: false,
      removed: [],
      reason: null,
      originalSize: Number(att.sizeBytes),
      processedSize: Number(att.sizeBytes),
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await markFailed(attachmentId, "no_storage_admin");
    return failedOutcome(attachmentId, "no_storage_admin");
  }

  // Download the bytes the guest just uploaded.
  const { data, error } = await admin.storage
    .from(att.storageBucket || ATTACHMENT_BUCKET)
    .download(att.storagePath);
  if (error || !data) {
    await markFailed(attachmentId, "download_failed");
    return failedOutcome(attachmentId, "download_failed");
  }
  const inputBytes = new Uint8Array(await data.arrayBuffer());

  let result: MetadataStripResult;
  try {
    result = stripImageMetadata({
      mimeType: att.mimeType,
      bytes: inputBytes,
    });
  } catch (e) {
    await markFailed(
      attachmentId,
      `strip_threw:${e instanceof Error ? e.message : "unknown"}`,
    );
    return failedOutcome(attachmentId, "strip_threw");
  }

  if (result.status === "failed") {
    await markFailed(attachmentId, result.reason ?? "strip_failed");
    return failedOutcome(
      attachmentId,
      result.reason ?? "strip_failed",
      Number(att.sizeBytes),
    );
  }

  // Decide whether to re-upload. We only re-upload when the byte
  // content actually changed; saves a write and preserves checksums
  // for `not_required` paths.
  let processedSize = Number(att.sizeBytes);
  if (result.bytes && result.changed) {
    const upload = await admin.storage
      .from(att.storageBucket || ATTACHMENT_BUCKET)
      .upload(att.storagePath, Buffer.from(result.bytes), {
        contentType: att.mimeType,
        upsert: true,
      });
    if (upload.error) {
      await markFailed(
        attachmentId,
        `upload_back_failed:${upload.error.message}`,
      );
      return failedOutcome(attachmentId, "upload_back_failed");
    }
    processedSize = result.bytes.length;
  }

  await db
    .update(guestAiHandoffReplyAttachments)
    .set({
      metadataStatus: result.status,
      metadataStrippedAt: new Date(),
      metadataError: null,
      originalSizeBytes: att.sizeBytes,
      processedSizeBytes: BigInt(processedSize),
      securityScanStatus: result.scan,
      securityScanNotes:
        result.removed.length > 0
          ? `Removed: ${result.removed.join(", ")}`
          : null,
    })
    .where(eq(guestAiHandoffReplyAttachments.id, attachmentId));

  return {
    attachmentId,
    ok: true,
    status: result.status,
    scan: result.scan,
    changed: result.changed,
    removed: result.removed,
    reason: result.reason,
    originalSize: Number(att.sizeBytes),
    processedSize,
  };
}

async function markFailed(
  attachmentId: string,
  reason: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(guestAiHandoffReplyAttachments)
    .set({
      metadataStatus: "failed",
      metadataError: reason.slice(0, 240),
      securityScanStatus: "failed",
    })
    .where(eq(guestAiHandoffReplyAttachments.id, attachmentId));
}

function failedOutcome(
  attachmentId: string,
  reason: string,
  originalSize: number | null = null,
): ProcessOutcome {
  return {
    attachmentId,
    ok: false,
    status: "failed",
    scan: "failed",
    changed: false,
    removed: [],
    reason,
    originalSize,
    processedSize: null,
  };
}

/**
 * Sweep `pending` rows and process them. Used by the admin
 * "Strip pending metadata" button + the cron cleanup job.
 */
export async function processPendingAttachments(opts?: {
  limit?: number;
}): Promise<{
  scanned: number;
  succeeded: number;
  failed: number;
  warnings: number;
}> {
  const db = getDb();
  if (!db)
    return { scanned: 0, succeeded: 0, failed: 0, warnings: 0 };
  const rows = await db
    .select({ id: guestAiHandoffReplyAttachments.id })
    .from(guestAiHandoffReplyAttachments)
    .where(eq(guestAiHandoffReplyAttachments.metadataStatus, "pending"))
    .limit(opts?.limit ?? 50);
  let succeeded = 0;
  let failed = 0;
  let warnings = 0;
  for (const r of rows) {
    const out = await processAttachmentMetadata(r.id);
    if (!out.ok) failed++;
    else if (out.status === "warning") warnings++;
    else succeeded++;
  }
  return { scanned: rows.length, succeeded, failed, warnings };
}
