"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  getGuestRequestAttachmentStorageHealth,
  type StorageHealth,
} from "./storage-bucket";

export type ValidateBucketResult =
  | { ok: true; health: StorageHealth }
  | { ok: false; error: string };

export async function validateGuestRequestAttachmentBucketAction(): Promise<ValidateBucketResult> {
  await requirePermission("guest_ai.handoff.attachments.write");
  const me = await getCurrentAppUser();
  try {
    const health = await getGuestRequestAttachmentStorageHealth();
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "guest_ai.handoff.attachment.bucket_validate",
      entityType: "guest_request_attachment_bucket",
      entityId: null,
      after: {
        bucketExists: health.bucketExists,
        bucketPrivate: health.bucketPrivate,
        signedUploadWorks: health.signedUploadWorks,
      },
    });
    revalidatePath("/dashboard/guest-ai/storage");
    return { ok: true, health };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Bucket check failed.";
    return { ok: false, error };
  }
}
