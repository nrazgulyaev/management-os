import "server-only";

import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { taskAttachments } from "@/lib/db/schema/operations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PhotoEvidenceItem } from "@/components/award";

const TASK_ATTACHMENTS_BUCKET = "task-attachments";

/**
 * Sprint MD-2.C — Photo aggregator for the
 * <PhotoEvidenceGrid> consumer on the Housekeeping cabinet apex.
 *
 * Joins `task_attachments` (polymorphic on taskId / checklistItemId
 * / maintenanceTicketId) to surface photo evidence per operation
 * task. The Housekeeping consumer passes a set of taskIds (today's
 * scheduled housekeeping tasks) and gets back at most `limit` photos
 * across them.
 *
 * Status is derived from `upload_status` + bucket presence:
 *   - upload_status = "uploaded" + bucket present → "uploaded"
 *   - upload_status = "uploaded" + bucket = "dry_run" → "local"
 *   - upload_status = "failed"                       → "failed"
 *   - upload_status = "pending"                      → "syncing"
 *
 * Signed URLs are issued via the Supabase admin client (1h TTL),
 * mirroring `getSiteReportPhotoUrl`.
 */

export async function loadOperationTaskPhotos(
  taskIds: string[],
  limit = 12,
): Promise<PhotoEvidenceItem[]> {
  if (taskIds.length === 0) return [];
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: taskAttachments.id,
      caption: taskAttachments.caption,
      storageBucket: taskAttachments.storageBucket,
      storagePath: taskAttachments.storagePath,
      uploadStatus: taskAttachments.uploadStatus,
      attachmentType: taskAttachments.attachmentType,
      createdAt: taskAttachments.createdAt,
    })
    .from(taskAttachments)
    .where(inArray(taskAttachments.taskId, taskIds))
    .orderBy(desc(taskAttachments.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // Filter to photo attachments only.
  const photoRows = rows.filter(
    (r) => (r.attachmentType ?? "photo").toLowerCase() === "photo",
  );

  const admin = getSupabaseAdmin();

  const items: PhotoEvidenceItem[] = await Promise.all(
    photoRows.map(async (r): Promise<PhotoEvidenceItem> => {
      const isDryRun = r.storageBucket === "dry_run";
      let url: string | null = null;
      if (!isDryRun && admin && r.storagePath) {
        try {
          const { data, error } = await admin.storage
            .from(r.storageBucket ?? TASK_ATTACHMENTS_BUCKET)
            .createSignedUrl(r.storagePath, 3600);
          if (!error) url = data?.signedUrl ?? null;
        } catch {
          url = null;
        }
      }

      let status: PhotoEvidenceItem["status"];
      if (r.uploadStatus === "failed") status = "failed";
      else if (r.uploadStatus === "pending") status = "syncing";
      else if (isDryRun) status = "local";
      else if (url) status = "uploaded";
      else status = "failed";

      return {
        id: r.id,
        thumbnailUrl: url ?? "",
        fullUrl: url ?? undefined,
        status,
        caption: r.caption ?? undefined,
        timestamp: r.createdAt
          ? new Date(r.createdAt).toLocaleString()
          : undefined,
        alt: r.caption ?? "Task photo",
      };
    }),
  );

  return items;
}
