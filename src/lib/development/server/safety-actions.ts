import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { safetyIncidents } from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import { documents } from "@/lib/db/schema/documents";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  SAFETY_CATEGORIES,
  SAFETY_SEVERITIES,
  SAFETY_STATUSES,
} from "@/lib/development/constants/safety-constants";

const incidentCreateSchema = z.object({
  incidentCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  projectId: z.string().uuid(),
  zoneId: z.string().uuid().optional().nullable(),
  relatedSiteReportId: z.string().uuid().optional().nullable(),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incidentTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional()
    .nullable(),
  severity: z.enum(SAFETY_SEVERITIES),
  category: z.enum(SAFETY_CATEGORIES),
  affectedWorkersCount: z.number().int().min(0).default(0),
  vendorEngagementId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  immediateActionsTaken: z.string().optional().nullable(),
  reportedToAuthorities: z.boolean().default(false),
  authorityReportReference: z.string().optional().nullable(),
});

/**
 * safety_incidents has no organization_id; it anchors org through its
 * project. Verify the incident exists AND its project belongs to the
 * caller's org before any mutation, so a client cannot flip / resolve
 * another tenant's incident by posting its raw id. Throws on mismatch.
 */
async function assertIncidentInOrg(
  db: ReturnType<typeof requireDb>,
  incidentId: string,
  organizationId: string,
): Promise<void> {
  const [hit] = await db
    .select({ id: safetyIncidents.id })
    .from(safetyIncidents)
    .innerJoin(projects, eq(projects.id, safetyIncidents.projectId))
    .where(
      and(
        eq(safetyIncidents.id, incidentId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!hit) {
    throw new Error("Safety incident not found in your organization");
  }
}

/**
 * Records a safety incident. The cron job
 * `runOpenSafetyIncidentEscalation` watches for `severe` / `fatal`
 * incidents and escalates after 24h if still open. We don't fire any
 * notification synchronously here — keeps the action fast and lets
 * the cron pipeline handle delivery.
 */
export async function recordSafetyIncident(
  input: z.input<typeof incidentCreateSchema>,
): Promise<{ id: string; incidentCode: string }> {
  const parsed = incidentCreateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  // safety_incidents has no org column; anchor via the project. Reject a
  // client-supplied projectId that is not in the caller's org.
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, parsed.projectId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!proj) {
    throw new Error("recordSafetyIncident: project not found in your organization");
  }
  const [row] = await db
    .insert(safetyIncidents)
    .values({
      incidentCode: parsed.incidentCode,
      projectId: parsed.projectId,
      zoneId: parsed.zoneId ?? null,
      relatedSiteReportId: parsed.relatedSiteReportId ?? null,
      incidentDate: parsed.incidentDate,
      incidentTime: parsed.incidentTime ?? null,
      severity: parsed.severity,
      category: parsed.category,
      affectedWorkersCount: parsed.affectedWorkersCount,
      vendorEngagementId: parsed.vendorEngagementId ?? null,
      description: parsed.description,
      immediateActionsTaken: parsed.immediateActionsTaken ?? null,
      reportedToAuthorities: parsed.reportedToAuthorities,
      authorityReportReference: parsed.authorityReportReference ?? null,
    })
    .returning({
      id: safetyIncidents.id,
      incidentCode: safetyIncidents.incidentCode,
    });
  return row;
}

export async function setSafetyIncidentStatus(
  id: string,
  status: (typeof SAFETY_STATUSES)[number],
): Promise<void> {
  const parsed = z.enum(SAFETY_STATUSES).parse(status);
  const db = requireDb();
  const organizationId = await requireOrgId();
  await assertIncidentInOrg(db, id, organizationId);
  const updates: Record<string, unknown> = {
    status: parsed,
    updatedAt: new Date(),
  };
  if (parsed === "resolved" || parsed === "closed") {
    updates.resolvedAt = new Date();
  }
  await db.update(safetyIncidents).set(updates).where(eq(safetyIncidents.id, id));
}

export async function resolveSafetyIncident(
  id: string,
  resolutionNotes: string,
): Promise<void> {
  if (!resolutionNotes || resolutionNotes.trim().length < 3) {
    throw new Error("resolveSafetyIncident: resolutionNotes required (≥3 chars)");
  }
  const db = requireDb();
  const organizationId = await requireOrgId();
  await assertIncidentInOrg(db, id, organizationId);
  await db
    .update(safetyIncidents)
    .set({
      status: "resolved",
      resolutionNotes,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(safetyIncidents.id, id));
}

/* ------------------------------------------------------------------ */
/* Safety evidence upload — photos[] + investigation report.          */
/* ------------------------------------------------------------------ */

const SUPABASE_BUCKET = "dev-os-site-photos";
const MAX_BYTES = 25 * 1024 * 1024; // reports can be PDFs — allow a bit more.
const ALLOWED_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const ALLOWED_REPORT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const uploadEvidenceSchema = z.object({
  incidentId: z.string().uuid(),
  /**
   * 'photo' appends the new document id onto safety_incidents.photo_document_ids;
   * 'report' sets safety_incidents.report_document_id (single canonical report).
   */
  kind: z.enum(["photo", "report"]),
  caption: z.string().max(500).optional().nullable(),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().min(1),
  /** Base64-encoded contents (transport-safe). */
  fileBase64: z.string().min(1),
});

export interface SafetyEvidenceUploadResult {
  documentId: string;
  kind: "photo" | "report";
  storagePath: string;
  storageBucket: string;
  url: string | null;
  /** True when SUPABASE_SERVICE_ROLE_KEY isn't configured — bytes were not actually persisted. */
  dryRun: boolean;
  notes: string;
}

/**
 * Uploads a safety-evidence file (incident photo OR investigation
 * report) and links it to the incident. Mirrors the QA/QC photo
 * pipeline — bytes go to Supabase Storage (or dry-run when no service
 * key), a `documents` row is written, then the new document id is
 * appended to `photo_document_ids[]` (kind=photo) or stored in
 * `report_document_id` (kind=report). Org is anchored through the
 * incident's project; a foreign incident id is rejected.
 */
export async function uploadSafetyEvidence(
  input: z.input<typeof uploadEvidenceSchema>,
): Promise<SafetyEvidenceUploadResult> {
  const parsed = uploadEvidenceSchema.parse(input);
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  if (!ctx.appUser?.id) {
    throw new Error("uploadSafetyEvidence: requires authenticated app user");
  }

  const allowed =
    parsed.kind === "report" ? ALLOWED_REPORT_MIME : ALLOWED_PHOTO_MIME;
  if (!allowed.has(parsed.mimeType)) {
    throw new Error(
      `Unsupported MIME type ${parsed.mimeType}. Allowed: ${[...allowed].join(", ")}`,
    );
  }
  if (parsed.sizeBytes > MAX_BYTES) {
    throw new Error(
      `File too large: ${parsed.sizeBytes} bytes (max ${MAX_BYTES})`,
    );
  }

  const db = requireDb();

  // Anchor org through the incident's project + resolve project slug for the path.
  const [hit] = await db
    .select({
      incidentCode: safetyIncidents.incidentCode,
      projectSlug: projects.slug,
    })
    .from(safetyIncidents)
    .innerJoin(projects, eq(projects.id, safetyIncidents.projectId))
    .where(
      and(
        eq(safetyIncidents.id, parsed.incidentId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!hit) {
    throw new Error("Safety incident not found in your organization");
  }

  const ext = inferEvidenceExtension(parsed.fileName, parsed.mimeType);
  const fileUuid = crypto.randomUUID();
  const storagePath = `${hit.projectSlug}/safety/${hit.incidentCode}/${parsed.kind}-${fileUuid}.${ext}`;

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
      throw new Error(
        `Supabase storage upload failed: ${error.message}. Verify bucket "${SUPABASE_BUCKET}" exists in the Supabase Dashboard.`,
      );
    }
    const { data: signed } = await admin.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(storagePath, 3600);
    publicUrl = signed?.signedUrl ?? null;
    notes = "Uploaded to Supabase Storage";
  } else {
    dryRun = true;
    notes =
      "DRY RUN: SUPABASE_SERVICE_ROLE_KEY not set. Evidence metadata recorded; bytes not persisted.";
  }

  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        organizationId,
        title: parsed.caption ?? parsed.fileName,
        documentType: parsed.kind === "report" ? "other" : "photo",
        entityType: "safety_incident",
        entityId: parsed.incidentId,
        storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
        storagePath,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        visibility: "internal",
        uploadedBy: ctx.appUser!.id,
      })
      .returning({ id: documents.id });

    if (parsed.kind === "report") {
      await tx
        .update(safetyIncidents)
        .set({ reportDocumentId: doc.id, updatedAt: new Date() })
        .where(eq(safetyIncidents.id, parsed.incidentId));
    } else {
      // Append to the array (NULL-safe via coalesce to an empty array).
      await tx
        .update(safetyIncidents)
        .set({
          photoDocumentIds: sql`array_append(coalesce(${safetyIncidents.photoDocumentIds}, '{}'::uuid[]), ${doc.id}::uuid)`,
          updatedAt: new Date(),
        })
        .where(eq(safetyIncidents.id, parsed.incidentId));
    }

    return {
      documentId: doc.id,
      kind: parsed.kind,
      storagePath,
      storageBucket: dryRun ? "dry_run" : SUPABASE_BUCKET,
      url: publicUrl,
      dryRun,
      notes,
    };
  });
}

/**
 * Generates a fresh 1-hour signed URL for a stored safety-evidence
 * document. UI components call this on render — URLs expire so we never
 * persist them. Scoped to the caller's org via the document row.
 */
export async function getSafetyEvidenceUrl(
  documentId: string,
): Promise<{ url: string | null; dryRun: boolean; fileName: string | null; mimeType: string | null }> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  const [row] = await db
    .select({
      bucket: documents.storageBucket,
      path: documents.storagePath,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId),
        eq(documents.entityType, "safety_incident"),
      ),
    )
    .limit(1);
  if (!row) return { url: null, dryRun: false, fileName: null, mimeType: null };
  if (row.bucket === "dry_run")
    return { url: null, dryRun: true, fileName: row.fileName, mimeType: row.mimeType };
  const admin = getSupabaseAdmin();
  if (!admin)
    return { url: null, dryRun: true, fileName: row.fileName, mimeType: row.mimeType };
  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(row.path ?? "", 3600);
  if (error)
    return { url: null, dryRun: false, fileName: row.fileName, mimeType: row.mimeType };
  return {
    url: data?.signedUrl ?? null,
    dryRun: false,
    fileName: row.fileName,
    mimeType: row.mimeType,
  };
}

function inferEvidenceExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpe?g|png|webp|heic|pdf)$/.test(fromName)) {
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
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}
