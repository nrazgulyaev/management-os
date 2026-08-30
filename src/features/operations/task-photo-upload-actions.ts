import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { operationTasks, taskAttachments } from "@/lib/db/schema/operations";
import { documents } from "@/lib/db/schema/documents";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";

/**
 * OFFLINE-FIELD-PHOTO-FIX — task photo upload pipeline (the missing
 * destination for the field PWA's offline photo queue).
 *
 * The field capture block (`field-capture-block.tsx`) queues photos to
 * IndexedDB tagged with a `taskId`, but there was NO server endpoint to
 * persist them into `task_attachments`, and the service-worker drain never
 * touched the photos store — so offline field photos were stranded forever
 * (P0 data loss found in the 2026-07 platform audit). This mirrors the proven
 * `uploadSiteReportPhoto` pipeline for operation-task photos; the client-side
 * drain (`drainPendingPhotos`) POSTs each queued photo here on reconnect.
 *
 * `task_attachments` has no organization_id column, so org-scoping is enforced
 * via the parent task (`operation_tasks.organization_id`). Dry-run when
 * SUPABASE_SERVICE_ROLE_KEY is unset (metadata recorded, bytes not persisted).
 */

const SUPABASE_BUCKET = "task-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const uploadSchema = z.object({
  taskId: z.string().uuid(),
  caption: z.string().max(500).optional().nullable(),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(64),
  sizeBytes: z.number().int().min(1),
  /** Base64-encoded contents (transport-safe). */
  fileBase64: z.string().min(1),
  gpsLat: z.number().min(-90).max(90).optional().nullable(),
  gpsLng: z.number().min(-180).max(180).optional().nullable(),
});

export interface TaskPhotoUploadResult {
  documentId: string;
  attachmentId: string;
  storagePath: string;
  storageBucket: string;
  dryRun: boolean;
}

export async function uploadTaskPhoto(
  input: z.input<typeof uploadSchema>,
): Promise<TaskPhotoUploadResult> {
  const parsed = uploadSchema.parse(input);

  await requireInternalUser();
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  if (!ALLOWED_MIME.has(parsed.mimeType)) {
    throw new Error(
      `Unsupported MIME type ${parsed.mimeType}. Allowed: ${[...ALLOWED_MIME].join(", ")}`,
    );
  }
  if (parsed.sizeBytes > MAX_BYTES) {
    throw new Error(`File too large: ${parsed.sizeBytes} bytes (max ${MAX_BYTES})`);
  }

  const db = requireDb();

  // Org-scope via the parent task — task_attachments has no org column.
  const [task] = await db
    .select({ id: operationTasks.id })
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, parsed.taskId),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!task) throw new Error("Task not found");

  // Fold the capture geo (if any) into the caption — task_attachments has no
  // GPS columns, so preserve it as text rather than dropping it.
  const captionParts = [
    parsed.caption?.trim() || null,
    parsed.gpsLat != null && parsed.gpsLng != null
      ? `(GPS ${parsed.gpsLat.toFixed(6)}, ${parsed.gpsLng.toFixed(6)})`
      : null,
  ].filter(Boolean);
  const caption = captionParts.length ? captionParts.join(" ") : null;

  const ext = inferExtension(parsed.fileName, parsed.mimeType);
  const photoUuid = crypto.randomUUID();
  const storagePath = `${organizationId}/${parsed.taskId}/${photoUuid}.${ext}`;

  const admin = getSupabaseAdmin();
  let dryRun = false;
  if (admin) {
    const bytes = Buffer.from(parsed.fileBase64, "base64");
    const { error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, bytes, { contentType: parsed.mimeType, upsert: false });
    if (error) {
      throw new Error(
        `Supabase storage upload failed: ${error.message}. Verify bucket "${SUPABASE_BUCKET}" exists.`,
      );
    }
  } else {
    dryRun = true;
  }

  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        organizationId,
        title: caption ?? parsed.fileName,
        documentType: "photo",
        entityType: "operation_task",
        entityId: parsed.taskId,
        storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
        storagePath,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        visibility: "internal",
      })
      .returning({ id: documents.id });

    const [attachment] = await tx
      .insert(taskAttachments)
      .values({
        taskId: parsed.taskId,
        documentId: doc.id,
        attachmentType: "photo",
        caption,
        uploadedBy: me?.id ?? null,
        storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
        storagePath,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        uploadStatus: dryRun ? "dry_run" : "uploaded",
      })
      .returning({ id: taskAttachments.id });

    return {
      documentId: doc.id,
      attachmentId: attachment.id,
      storagePath,
      storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
      dryRun,
    };
  });
}

function inferExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpe?g|png|webp|heic)$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "bin";
  }
}
