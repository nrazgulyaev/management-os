import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  siteReports,
  siteReportPhotos,
  siteZones,
} from "@/lib/db/schema/site-operations";
import { documents } from "@/lib/db/schema/documents";
import { projects } from "@/lib/db/schema/projects";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Site report photo upload pipeline.
 *
 * Flow:
 *   1. Permission gate (internal staff only).
 *   2. Validate report exists and is in draft/submitted state (cannot
 *      add photos to reviewed/flagged reports — those are immutable).
 *   3. Validate MIME type + size.
 *   4. If `SUPABASE_SERVICE_ROLE_KEY` is configured: upload bytes to
 *      `dev-os-site-photos` bucket at path
 *      `{projectSlug}/{reportDate}/{uuid}.{ext}`.
 *   5. Otherwise: dry-run mode — `documents.storage_bucket = 'dry_run'`
 *      and `storage_path` records the would-be path. The UI shows a
 *      placeholder thumbnail.
 *   6. Atomically insert `documents` + `site_report_photos` rows.
 *   7. Return both IDs + the public/signed URL (dry-run returns null URL).
 *
 * Bucket setup is documented in the architecture doc and is operator-
 * driven via the Supabase Dashboard. The action does NOT auto-create
 * the bucket — that requires admin permissions and should be a one-
 * time deployment step.
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
  reportId: z.string().uuid(),
  zoneId: z.string().uuid().optional().nullable(),
  caption: z.string().max(500).optional().nullable(),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(64),
  sizeBytes: z.number().int().min(1),
  /** Base64-encoded contents (transport-safe). */
  fileBase64: z.string().min(1),
  takenAt: z.string().optional().nullable(),
  gpsLat: z.number().min(-90).max(90).optional().nullable(),
  gpsLng: z.number().min(-180).max(180).optional().nullable(),
});

export interface PhotoUploadResult {
  documentId: string;
  photoId: string;
  storagePath: string;
  storageBucket: string;
  url: string | null;
  /** True when SUPABASE_SERVICE_ROLE_KEY isn't configured — bytes were not actually persisted. */
  dryRun: boolean;
  notes: string;
}

export async function uploadSiteReportPhoto(
  input: z.input<typeof uploadSchema>,
): Promise<PhotoUploadResult> {
  const parsed = uploadSchema.parse(input);

  // 1. Permission.
  await requireInternalUser();
  const organizationId = await requireOrgId();

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

  // 3. Resolve report + project for the storage path.
  const [report] = await db
    .select({
      id: siteReports.id,
      status: siteReports.status,
      reportDate: siteReports.reportDate,
      projectId: siteReports.projectId,
    })
    .from(siteReports)
    .where(eq(siteReports.id, parsed.reportId))
    .limit(1);
  if (!report) throw new Error("Site report not found");
  if (report.status !== "draft" && report.status !== "submitted") {
    throw new Error(
      `Cannot add photos to a ${report.status} report — only draft/submitted accept new photos`,
    );
  }

  // 4. Resolve project slug for the storage path.
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, report.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  // 5. Validate zone (if provided) belongs to the same project.
  if (parsed.zoneId) {
    const [zone] = await db
      .select({ projectId: siteZones.projectId })
      .from(siteZones)
      .where(eq(siteZones.id, parsed.zoneId))
      .limit(1);
    if (!zone || zone.projectId !== report.projectId) {
      throw new Error(
        `Zone ${parsed.zoneId} does not belong to project of report`,
      );
    }
  }

  // 6. Build storage path.
  const ext = inferExtension(parsed.fileName, parsed.mimeType);
  const photoUuid = crypto.randomUUID();
  const storagePath = `${project.slug}/${String(report.reportDate)}/${photoUuid}.${ext}`;

  // 7. Upload bytes (real or dry-run).
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

  // 8. Atomic insert: documents + site_report_photos in one transaction.
  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        // TENANCY-FINANCE-DOCS — operator context; org from the session.
        organizationId,
        title: parsed.caption ?? parsed.fileName,
        documentType: "photo",
        entityType: "site_report",
        entityId: parsed.reportId,
        storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
        storagePath,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        visibility: "internal",
      })
      .returning({ id: documents.id });

    const [photo] = await tx
      .insert(siteReportPhotos)
      .values({
        organizationId,
        siteReportId: parsed.reportId,
        zoneId: parsed.zoneId ?? null,
        documentId: doc.id,
        caption: parsed.caption ?? null,
        photoTakenAt: parsed.takenAt ? new Date(parsed.takenAt) : new Date(),
        gpsLat: parsed.gpsLat != null ? parsed.gpsLat.toFixed(7) : null,
        gpsLng: parsed.gpsLng != null ? parsed.gpsLng.toFixed(7) : null,
      })
      .returning({ id: siteReportPhotos.id });

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
 * Atomically deletes the `site_report_photos` row + the `documents`
 * row. Also attempts to remove the file from Supabase Storage if
 * configured. Storage delete failures are warnings (DB rows are
 * already removed).
 */
export async function deleteSiteReportPhoto(
  input: z.input<typeof deleteSchema>,
): Promise<{ deleted: boolean; storageRemoved: boolean }> {
  const parsed = deleteSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();

  const result = await db.transaction(async (tx) => {
    const [photo] = await tx
      .select({
        id: siteReportPhotos.id,
        documentId: siteReportPhotos.documentId,
      })
      .from(siteReportPhotos)
      .where(eq(siteReportPhotos.id, parsed.photoId))
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

    await tx.delete(siteReportPhotos).where(eq(siteReportPhotos.id, photo.id));
    await tx.delete(documents).where(eq(documents.id, photo.documentId));

    return {
      bucket: doc?.bucket ?? null,
      path: doc?.path ?? null,
    };
  });

  // Best-effort storage cleanup (after DB tx commits — no rollback risk).
  let storageRemoved = false;
  const admin = getSupabaseAdmin();
  if (
    admin &&
    result.bucket === SUPABASE_BUCKET &&
    result.path
  ) {
    const { error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .remove([result.path]);
    storageRemoved = !error;
    if (error) {
      // Don't throw — the DB rows are already gone. Operator can
      // clean up the orphaned blob via the Supabase Dashboard if it
      // matters.
      console.warn(
        `[deleteSiteReportPhoto] Storage delete failed: ${error.message}`,
      );
    }
  }

  return { deleted: true, storageRemoved };
}

/**
 * Generates a fresh 1-hour signed URL for a stored photo. UI components
 * call this on render — URLs expire so we never persist them.
 */
export async function getSiteReportPhotoUrl(
  photoId: string,
): Promise<{ url: string | null; dryRun: boolean }> {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .select({
      bucket: documents.storageBucket,
      path: documents.storagePath,
    })
    .from(siteReportPhotos)
    .innerJoin(documents, eq(documents.id, siteReportPhotos.documentId))
    .where(eq(siteReportPhotos.id, photoId))
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
