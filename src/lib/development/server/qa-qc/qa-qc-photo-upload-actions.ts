import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { qaQcIssues, qaQcIssuePhotos } from "@/lib/db/schema/qa-qc";
import { documents } from "@/lib/db/schema/documents";
import { projects } from "@/lib/db/schema/projects";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * QA/QC issue photo upload pipeline. Mirrors the site-report photo
 * pipeline in `photo-upload-actions.ts` — the only differences are the
 * target table (`qa_qc_issue_photos`) and the role enum / entity type.
 *
 * Flow:
 *   1. Permission gate (internal staff only).
 *   2. Validate MIME type + size.
 *   3. Resolve the issue + its project slug for the storage path.
 *   4. If `SUPABASE_SERVICE_ROLE_KEY` is configured: upload bytes to the
 *      `dev-os-site-photos` bucket at path
 *      `{projectSlug}/qa-qc/{issueCode}/{uuid}.{ext}`.
 *   5. Otherwise: dry-run mode — `documents.storage_bucket = 'dry_run'`
 *      and `storage_path` records the would-be path. The UI shows a
 *      placeholder thumbnail.
 *   6. Atomically insert `documents` + `qa_qc_issue_photos` rows.
 *   7. Return both IDs + the public/signed URL (dry-run returns null URL).
 *
 * The existing `attachQaQcPhoto` action is the persist-only half (it
 * assumes the document already exists). This action wraps byte upload +
 * persist so the UI has a single end-to-end entry point.
 */

const SUPABASE_BUCKET = "dev-os-site-photos";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const uploadSchema = z.object({
  issueId: z.string().uuid(),
  photoRole: z.enum([
    "initial_defect",
    "work_in_progress",
    "resolution_proof",
    "reinspection",
  ]),
  inspectionId: z.string().uuid().optional().nullable(),
  caption: z.string().max(500).optional().nullable(),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(64),
  sizeBytes: z.number().int().min(1),
  /** Base64-encoded contents (transport-safe). */
  fileBase64: z.string().min(1),
});

export interface QaQcPhotoUploadResult {
  documentId: string;
  photoId: string;
  storagePath: string;
  storageBucket: string;
  url: string | null;
  /** True when SUPABASE_SERVICE_ROLE_KEY isn't configured — bytes were not actually persisted. */
  dryRun: boolean;
  notes: string;
}

export async function uploadQaQcPhoto(
  input: z.input<typeof uploadSchema>,
): Promise<QaQcPhotoUploadResult> {
  const parsed = uploadSchema.parse(input);

  // 1. Permission.
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  if (!ctx.appUser?.id) {
    throw new Error("uploadQaQcPhoto: requires authenticated app user");
  }

  // 2. Validate MIME + size.
  if (!ALLOWED_MIME.has(parsed.mimeType)) {
    throw new Error(
      `Unsupported MIME type ${parsed.mimeType}. Allowed: ${[...ALLOWED_MIME].join(", ")}`,
    );
  }
  if (parsed.sizeBytes > MAX_BYTES) {
    throw new Error(
      `File too large: ${parsed.sizeBytes} bytes (max ${MAX_BYTES})`,
    );
  }

  const db = requireDb();

  // 3. Resolve issue + project for the storage path.
  const [issue] = await db
    .select({
      id: qaQcIssues.id,
      issueCode: qaQcIssues.issueCode,
      projectId: qaQcIssues.projectId,
      organizationId: qaQcIssues.organizationId,
    })
    .from(qaQcIssues)
    .where(eq(qaQcIssues.id, parsed.issueId))
    .limit(1);
  if (!issue) throw new Error("QA/QC issue not found");
  if (issue.organizationId !== organizationId) {
    throw new Error("QA/QC issue does not belong to your organization");
  }

  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, issue.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  // 4. Build storage path.
  const ext = inferExtension(parsed.fileName, parsed.mimeType);
  const photoUuid = crypto.randomUUID();
  const storagePath = `${project.slug}/qa-qc/${issue.issueCode}/${photoUuid}.${ext}`;

  // 5. Upload bytes (real or dry-run).
  const admin = getSupabaseAdmin();
  let publicUrl: string | null = null;
  let dryRun = false;
  let notes = "";
  if (admin) {
    const bytes = Buffer.from(parsed.fileBase64, "base64");
    const { error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, bytes, {
        contentType: parsed.mimeType,
        upsert: false,
      });
    if (error) {
      // Common: bucket doesn't exist. Surface a clear error.
      throw new Error(
        `Supabase storage upload failed: ${error.message}. Verify bucket "${SUPABASE_BUCKET}" exists in the Supabase Dashboard.`,
      );
    }
    // Generate a signed URL valid for 1 hour. The viewer fetches a fresh
    // URL each time it renders — we don't persist URLs in the document
    // table because they expire.
    const { data: signed } = await admin.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(storagePath, 3600);
    publicUrl = signed?.signedUrl ?? null;
    notes = "Uploaded to Supabase Storage";
  } else {
    dryRun = true;
    notes =
      "DRY RUN: SUPABASE_SERVICE_ROLE_KEY not set. Photo metadata recorded; bytes not persisted.";
  }

  // 6. Atomic insert: documents + qa_qc_issue_photos in one transaction.
  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        // TENANCY-FINANCE-DOCS — operator context; org from the session.
        organizationId,
        title: parsed.caption ?? parsed.fileName,
        documentType: "photo",
        entityType: "qa_qc_issue",
        entityId: parsed.issueId,
        storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
        storagePath,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        visibility: "internal",
        uploadedBy: ctx.appUser!.id,
      })
      .returning({ id: documents.id });

    const [photo] = await tx
      .insert(qaQcIssuePhotos)
      .values({
        organizationId,
        issueId: parsed.issueId,
        documentId: doc.id,
        photoRole: parsed.photoRole,
        inspectionId: parsed.inspectionId ?? null,
        caption: parsed.caption ?? null,
        uploadedBy: ctx.appUser!.id,
      })
      .returning({ id: qaQcIssuePhotos.id });

    return {
      documentId: doc.id,
      photoId: photo.id,
      storagePath,
      storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
      url: publicUrl,
      dryRun,
      notes,
    };
  });
}

const deleteSchema = z.object({
  photoId: z.string().uuid(),
});

/**
 * Atomically deletes the `qa_qc_issue_photos` row + the `documents`
 * row. Also attempts to remove the file from Supabase Storage if
 * configured. Storage delete failures are warnings (DB rows are
 * already removed).
 */
export async function deleteQaQcPhoto(
  input: z.input<typeof deleteSchema>,
): Promise<{ deleted: boolean; storageRemoved: boolean }> {
  const parsed = deleteSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();

  const result = await db.transaction(async (tx) => {
    const [photo] = await tx
      .select({
        id: qaQcIssuePhotos.id,
        documentId: qaQcIssuePhotos.documentId,
      })
      .from(qaQcIssuePhotos)
      .where(eq(qaQcIssuePhotos.id, parsed.photoId))
      .limit(1);
    if (!photo) throw new Error("Photo not found");

    const [doc] = await tx
      .select({
        bucket: documents.storageBucket,
        path: documents.storagePath,
      })
      .from(documents)
      .where(eq(documents.id, photo.documentId))
      .limit(1);

    await tx.delete(qaQcIssuePhotos).where(eq(qaQcIssuePhotos.id, photo.id));
    await tx.delete(documents).where(eq(documents.id, photo.documentId));

    return {
      bucket: doc?.bucket ?? null,
      path: doc?.path ?? null,
    };
  });

  // Best-effort storage cleanup (after DB tx commits — no rollback risk).
  let storageRemoved = false;
  const admin = getSupabaseAdmin();
  if (admin && result.bucket === SUPABASE_BUCKET && result.path) {
    const { error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .remove([result.path]);
    storageRemoved = !error;
    if (error) {
      // Don't throw — the DB rows are already gone. Operator can
      // clean up the orphaned blob via the Supabase Dashboard if it
      // matters.
      console.warn(
        `[deleteQaQcPhoto] Storage delete failed: ${error.message}`,
      );
    }
  }

  return { deleted: true, storageRemoved };
}

/**
 * Generates a fresh 1-hour signed URL for a stored photo. UI components
 * call this on render — URLs expire so we never persist them.
 */
export async function getQaQcPhotoUrl(
  photoId: string,
): Promise<{ url: string | null; dryRun: boolean }> {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .select({
      bucket: documents.storageBucket,
      path: documents.storagePath,
    })
    .from(qaQcIssuePhotos)
    .innerJoin(documents, eq(documents.id, qaQcIssuePhotos.documentId))
    .where(eq(qaQcIssuePhotos.id, photoId))
    .limit(1);
  if (!row) return { url: null, dryRun: false };
  if (row.bucket === "dry_run") return { url: null, dryRun: true };

  const admin = getSupabaseAdmin();
  if (!admin) return { url: null, dryRun: true };
  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(row.path ?? "", 3600);
  if (error) return { url: null, dryRun: false };
  return { url: data?.signedUrl ?? null, dryRun: false };
}

function inferExtension(fileName: string, mimeType: string): string {
  // Prefer the file extension when it matches the MIME, otherwise
  // fall back to a sensible default per MIME.
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
