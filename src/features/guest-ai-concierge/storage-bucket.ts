import "server-only";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffReplyAttachments } from "@/lib/db/schema/guest-ai-concierge";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET } from "./attachments-pure";

/**
 * V9L — bucket health checks for the guest concierge attachment
 * pipeline. Reports a structured status the admin storage page
 * renders, and an exception-free `validateGuestRequestAttachmentBucketAction`
 * an operator can hit from the UI.
 *
 * Supabase's storage SDK doesn't expose enough metadata to verify
 * "private" cleanly, so we report `unknown` for the privacy flag
 * when the API doesn't help. The intent is documented in
 * ADR-0023 + the README.
 */

export type CheckOutcome = "ok" | "unknown" | "warning" | "failed";

export interface StorageHealth {
  checkedAt: string;
  bucketName: string;
  bucketExists: CheckOutcome;
  bucketPrivate: CheckOutcome;
  signedUploadWorks: CheckOutcome;
  signedDownloadWorks: CheckOutcome;
  pendingAttachments: number;
  pendingMetadata: number;
  failedMetadata: number;
  stalePending: number;
  notes: string[];
}

export async function getGuestRequestAttachmentStorageHealth(): Promise<StorageHealth> {
  const checkedAt = new Date().toISOString();
  const baseNotes: string[] = [];
  const counts = await fetchAttachmentCounts();

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      checkedAt,
      bucketName: ATTACHMENT_BUCKET,
      bucketExists: "unknown",
      bucketPrivate: "unknown",
      signedUploadWorks: "unknown",
      signedDownloadWorks: "unknown",
      ...counts,
      notes: [
        ...baseNotes,
        "Supabase admin client is not configured; bucket checks skipped.",
      ],
    };
  }

  let bucketExists: CheckOutcome = "unknown";
  let bucketPrivate: CheckOutcome = "unknown";
  try {
    const list = await admin.storage.listBuckets();
    if (list.error) {
      baseNotes.push(`listBuckets failed: ${list.error.message}`);
      bucketExists = "warning";
    } else {
      const match = (list.data ?? []).find(
        (b) => b.name === ATTACHMENT_BUCKET,
      );
      if (!match) {
        bucketExists = "failed";
        baseNotes.push(
          `Bucket "${ATTACHMENT_BUCKET}" not found. Create it as a private bucket in the Supabase dashboard.`,
        );
      } else {
        bucketExists = "ok";
        const isPublic = (match as { public?: boolean }).public;
        if (isPublic === true) {
          bucketPrivate = "failed";
          baseNotes.push(
            `Bucket "${ATTACHMENT_BUCKET}" is marked PUBLIC. Flip it to private — guest attachments must never be world-readable.`,
          );
        } else if (isPublic === false) {
          bucketPrivate = "ok";
        } else {
          bucketPrivate = "unknown";
          baseNotes.push(
            "Supabase storage API didn't expose a privacy flag for this bucket; verify in the dashboard.",
          );
        }
      }
    }
  } catch (e) {
    baseNotes.push(
      `Bucket lookup threw: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }

  // Signed upload + download dry-run on a probe path. We never
  // actually upload bytes; we just confirm the SDK can mint URLs.
  const probePath = `_health-probes/${randomUUID()}.bin`;
  let signedUploadWorks: CheckOutcome = "unknown";
  let signedDownloadWorks: CheckOutcome = "unknown";
  if (bucketExists === "ok") {
    try {
      const upload = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUploadUrl(probePath);
      if (upload.error || !upload.data?.signedUrl) {
        signedUploadWorks = "failed";
        baseNotes.push(
          `Signed upload probe failed: ${upload.error?.message ?? "no signedUrl"}.`,
        );
      } else {
        signedUploadWorks = "ok";
      }
    } catch (e) {
      signedUploadWorks = "failed";
      baseNotes.push(
        `Signed upload probe threw: ${e instanceof Error ? e.message : "unknown"}.`,
      );
    }
    try {
      const download = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(probePath, 60);
      if (download.error || !download.data?.signedUrl) {
        signedDownloadWorks = "warning";
        baseNotes.push(
          `Signed download probe didn't return a URL (object likely doesn't exist; this is expected for a fresh probe path). Real-attachment downloads still need to be verified by uploading once.`,
        );
      } else {
        signedDownloadWorks = "ok";
      }
    } catch (e) {
      signedDownloadWorks = "failed";
      baseNotes.push(
        `Signed download probe threw: ${e instanceof Error ? e.message : "unknown"}.`,
      );
    }
  }

  return {
    checkedAt,
    bucketName: ATTACHMENT_BUCKET,
    bucketExists,
    bucketPrivate,
    signedUploadWorks,
    signedDownloadWorks,
    ...counts,
    notes: baseNotes,
  };
}

async function fetchAttachmentCounts(): Promise<{
  pendingAttachments: number;
  pendingMetadata: number;
  failedMetadata: number;
  stalePending: number;
}> {
  const db = getDb();
  if (!db)
    return {
      pendingAttachments: 0,
      pendingMetadata: 0,
      failedMetadata: 0,
      stalePending: 0,
    };
  const [agg] = await db
    .select({
      pendingAttachments: sql<number>`count(*) filter (where ${guestAiHandoffReplyAttachments.uploadStatus} = 'pending')`,
      pendingMetadata: sql<number>`count(*) filter (where ${guestAiHandoffReplyAttachments.uploadStatus} = 'uploaded' and ${guestAiHandoffReplyAttachments.metadataStatus} = 'pending')`,
      failedMetadata: sql<number>`count(*) filter (where ${guestAiHandoffReplyAttachments.metadataStatus} = 'failed')`,
      stalePending: sql<number>`count(*) filter (where ${guestAiHandoffReplyAttachments.uploadStatus} = 'pending' and ${guestAiHandoffReplyAttachments.createdAt} < now() - interval '24 hours')`,
    })
    .from(guestAiHandoffReplyAttachments);
  return {
    pendingAttachments: Number(agg?.pendingAttachments ?? 0),
    pendingMetadata: Number(agg?.pendingMetadata ?? 0),
    failedMetadata: Number(agg?.failedMetadata ?? 0),
    stalePending: Number(agg?.stalePending ?? 0),
  };
}

/**
 * Boot-time check used by the admin route. Returns true when the
 * bucket exists; otherwise the admin sees a configuration banner.
 */
export async function ensureGuestRequestAttachmentBucketConfigured(): Promise<boolean> {
  const health = await getGuestRequestAttachmentStorageHealth();
  return health.bucketExists === "ok";
}
