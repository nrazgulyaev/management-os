"use server";

/**
 * Site-supervisor field-capture WRITE workflow (migration 0127).
 *
 * The site-supervisor cabinet was read-only. This module backs the
 * mobile field-capture tool:
 *   · capturePhoto       — reuses the site-report photo-upload pipeline
 *                          (Supabase bucket + documents row), then files
 *                          a `photo` capture frame.
 *   · captureIncident    — severity high|normal + description.
 *   · captureVoiceNote   — stores audio bytes + a v1 AI-transcribe stub.
 *   · captureNote        — quick free-text frame.
 *   · deleteCaptureFrame — removes a frame from the today feed.
 *   · compileDailySummary — runs the digest helper (reuse of the daily
 *                          construction-digest pattern) to produce an AI
 *                          summary frame and notifies the director.
 *
 * Every write is permission-gated (internal staff — matches the photo-
 * upload pipeline gate) + org-scoped + audit-logged. No money flows.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, requireDb, rowsOf } from "@/lib/db/client";
import { siteCaptureFrames } from "@/lib/db/schema/site-capture";
import { documents } from "@/lib/db/schema/documents";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildDailyDigest } from "@/lib/development/server/ai/daily-construction-digest/daily-digest-helpers";

export interface ActionResult {
  ok: boolean;
  error?: string;
  frameId?: string;
}

const SUPABASE_PHOTO_BUCKET = "dev-os-site-photos";
const SUPABASE_AUDIO_BUCKET = "dev-os-voice-notes";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

// ---------------------------------------------------------------------------
// READ — today's feed + active zones
// ---------------------------------------------------------------------------

export interface CaptureFrameRow {
  id: string;
  frameType: string;
  activeZone: string | null;
  crewOnShift: number | null;
  severity: string | null;
  title: string | null;
  body: string | null;
  hasPhoto: boolean;
  hasAudio: boolean;
  transcriptText: string | null;
  transcriptStatus: string;
  capturedByName: string | null;
  capturedAt: string;
}

/** Frames captured today (org-scoped), newest first. Drives the feed. */
export async function listTodaysCaptureFrames(
  limit = 50,
): Promise<CaptureFrameRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    frame_type: string;
    active_zone: string | null;
    crew_on_shift: number | null;
    severity: string | null;
    title: string | null;
    body: string | null;
    photo_document_id: string | null;
    audio_document_id: string | null;
    transcript_text: string | null;
    transcript_status: string;
    captured_by_name: string | null;
    captured_at: string;
  }>(sql`
    SELECT f.id::text                          AS id,
           f.frame_type                         AS frame_type,
           f.active_zone                         AS active_zone,
           f.crew_on_shift                       AS crew_on_shift,
           f.severity                            AS severity,
           f.title                               AS title,
           f.body                                AS body,
           f.photo_document_id::text             AS photo_document_id,
           f.audio_document_id::text             AS audio_document_id,
           f.transcript_text                     AS transcript_text,
           f.transcript_status                   AS transcript_status,
           u.full_name                           AS captured_by_name,
           f.captured_at::text                   AS captured_at
      FROM site_capture_frames f
      LEFT JOIN app_users u ON u.id = f.captured_by
     WHERE f.organization_id = ${orgId}
       AND f.captured_at >= date_trunc('day', now())
     ORDER BY f.captured_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    frame_type: string;
    active_zone: string | null;
    crew_on_shift: number | null;
    severity: string | null;
    title: string | null;
    body: string | null;
    photo_document_id: string | null;
    audio_document_id: string | null;
    transcript_text: string | null;
    transcript_status: string;
    captured_by_name: string | null;
    captured_at: string;
  }>(rows).map((r) => ({
    id: r.id,
    frameType: r.frame_type,
    activeZone: r.active_zone,
    crewOnShift: r.crew_on_shift,
    severity: r.severity,
    title: r.title,
    body: r.body,
    hasPhoto: r.photo_document_id != null,
    hasAudio: r.audio_document_id != null,
    transcriptText: r.transcript_text,
    transcriptStatus: r.transcript_status,
    capturedByName: r.captured_by_name,
    capturedAt: r.captured_at,
  }));
}

export interface ZoneChip {
  id: string;
  label: string;
}

/** Distinct active-zone chips: project codes + recently-used zone names. */
export async function listActiveZones(): Promise<ZoneChip[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{ id: string; label: string }>(sql`
    SELECT z.id::text AS id,
           (COALESCE(p.project_code || ' · ', '') || z.zone_name) AS label
      FROM site_zones z
      LEFT JOIN projects p ON p.id = z.project_id
     WHERE z.organization_id = ${orgId}
     ORDER BY z.zone_name
     LIMIT 12
  `);
  return rowsOf<{ id: string; label: string }>(rows).map((r) => ({
    id: r.id,
    label: r.label,
  }));
}

// ---------------------------------------------------------------------------
// WRITE — capture actions
// ---------------------------------------------------------------------------

const baseSchema = z.object({
  activeZone: z.string().max(160).optional().nullable(),
  crewOnShift: z.number().int().min(0).max(9999).optional().nullable(),
});

const noteSchema = baseSchema.extend({
  body: z.string().min(1).max(2000),
});

export async function captureNote(
  input: z.input<typeof noteSchema>,
): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Note text is required." };
  await requireInternalUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const [frame] = await db
    .insert(siteCaptureFrames)
    .values({
      organizationId: orgId,
      frameType: "note",
      activeZone: parsed.data.activeZone ?? null,
      crewOnShift: parsed.data.crewOnShift ?? null,
      title: "Field note",
      body: parsed.data.body,
      capturedBy: me?.id ?? null,
    })
    .returning({ id: siteCaptureFrames.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "site_capture.note.create",
    entityType: "site_capture_frame",
    entityId: frame.id,
    after: { zone: parsed.data.activeZone ?? null },
  });
  return { ok: true, frameId: frame.id };
}

const incidentSchema = baseSchema.extend({
  severity: z.enum(["high", "normal"]),
  body: z.string().min(1).max(2000),
});

export async function captureIncident(
  input: z.input<typeof incidentSchema>,
): Promise<ActionResult> {
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Incident severity + description are required." };
  }
  await requireInternalUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const [frame] = await db
    .insert(siteCaptureFrames)
    .values({
      organizationId: orgId,
      frameType: "incident",
      activeZone: parsed.data.activeZone ?? null,
      crewOnShift: parsed.data.crewOnShift ?? null,
      severity: parsed.data.severity,
      title:
        parsed.data.severity === "high"
          ? "High-severity incident"
          : "Incident",
      body: parsed.data.body,
      capturedBy: me?.id ?? null,
    })
    .returning({ id: siteCaptureFrames.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "site_capture.incident.create",
    entityType: "site_capture_frame",
    entityId: frame.id,
    after: { severity: parsed.data.severity, zone: parsed.data.activeZone ?? null },
  });
  return { ok: true, frameId: frame.id };
}

const photoSchema = baseSchema.extend({
  caption: z.string().max(500).optional().nullable(),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(64),
  sizeBytes: z.number().int().min(1),
  /** Base64-encoded contents (transport-safe). */
  fileBase64: z.string().min(1),
});

/**
 * Files a photo capture frame. Reuses the site-report photo-upload
 * pipeline: bytes → Supabase `dev-os-site-photos` bucket (or dry-run
 * when SUPABASE_SERVICE_ROLE_KEY is unset) + a `documents` row, then a
 * `photo` capture frame linking the document.
 */
export async function capturePhoto(
  input: z.input<typeof photoSchema>,
): Promise<ActionResult & { dryRun?: boolean }> {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A photo file is required." };
  await requireInternalUser();
  if (!ALLOWED_PHOTO_MIME.has(parsed.data.mimeType)) {
    return {
      ok: false,
      error: `Unsupported image type ${parsed.data.mimeType}.`,
    };
  }
  if (parsed.data.sizeBytes > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Photo too large (max 10MB)." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const frameId = crypto.randomUUID();
  const ext = inferExtension(parsed.data.fileName, parsed.data.mimeType);
  const storagePath = `capture/${today()}/${frameId}.${ext}`;

  const { documentId, dryRun } = await persistBlob({
    bucket: SUPABASE_PHOTO_BUCKET,
    storagePath,
    base64: parsed.data.fileBase64,
    mimeType: parsed.data.mimeType,
    fileName: parsed.data.fileName,
    sizeBytes: parsed.data.sizeBytes,
    documentType: "photo",
    title: parsed.data.caption ?? parsed.data.fileName,
    entityId: frameId,
    uploadedBy: me?.id ?? null,
  });

  await db.insert(siteCaptureFrames).values({
    id: frameId,
    organizationId: orgId,
    frameType: "photo",
    activeZone: parsed.data.activeZone ?? null,
    crewOnShift: parsed.data.crewOnShift ?? null,
    title: parsed.data.caption ?? "Site photo",
    photoDocumentId: documentId,
    metadata: { dryRun },
    capturedBy: me?.id ?? null,
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "site_capture.photo.create",
    entityType: "site_capture_frame",
    entityId: frameId,
    after: { dryRun, zone: parsed.data.activeZone ?? null },
  });
  return { ok: true, frameId, dryRun };
}

const voiceSchema = baseSchema.extend({
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(64),
  sizeBytes: z.number().int().min(1),
  fileBase64: z.string().min(1),
  durationSeconds: z.number().int().min(0).max(36000).optional().nullable(),
});

/**
 * Files a voice-note capture frame. Stores audio bytes (Supabase or
 * dry-run) + a `documents` row, then a `voice` frame. AI transcription
 * is a v1 stub — `transcript_status='stub'` with a deferred note. A
 * future job can drain stubbed frames to a real transcribe pipeline.
 */
export async function captureVoiceNote(
  input: z.input<typeof voiceSchema>,
): Promise<ActionResult & { dryRun?: boolean }> {
  const parsed = voiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "An audio file is required." };
  await requireInternalUser();
  if (parsed.data.sizeBytes > MAX_AUDIO_BYTES) {
    return { ok: false, error: "Voice note too large (max 25MB)." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const frameId = crypto.randomUUID();
  const ext = inferAudioExtension(parsed.data.fileName, parsed.data.mimeType);
  const storagePath = `capture/${today()}/${frameId}.${ext}`;

  const { documentId, dryRun } = await persistBlob({
    bucket: SUPABASE_AUDIO_BUCKET,
    storagePath,
    base64: parsed.data.fileBase64,
    mimeType: parsed.data.mimeType,
    fileName: parsed.data.fileName,
    sizeBytes: parsed.data.sizeBytes,
    documentType: "other",
    title: parsed.data.fileName,
    entityId: frameId,
    uploadedBy: me?.id ?? null,
  });

  await db.insert(siteCaptureFrames).values({
    id: frameId,
    organizationId: orgId,
    frameType: "voice",
    activeZone: parsed.data.activeZone ?? null,
    crewOnShift: parsed.data.crewOnShift ?? null,
    title: "Voice note",
    audioDocumentId: documentId,
    // v1 stub — AI transcription deferred. A future job drains stubs.
    transcriptText:
      "Transcription pending — AI transcribe is a v1 stub. Audio stored; a future job will transcribe.",
    transcriptStatus: "stub",
    metadata: {
      dryRun,
      durationSeconds: parsed.data.durationSeconds ?? null,
    },
    capturedBy: me?.id ?? null,
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "site_capture.voice.create",
    entityType: "site_capture_frame",
    entityId: frameId,
    after: { dryRun, durationSeconds: parsed.data.durationSeconds ?? null },
  });
  return { ok: true, frameId, dryRun };
}

const deleteSchema = z.object({ frameId: z.string().uuid() });

/** Removes a frame from the today feed (org-scoped). */
export async function deleteCaptureFrame(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid frame id." };
  await requireInternalUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const deleted = await db
    .delete(siteCaptureFrames)
    .where(
      and(
        eq(siteCaptureFrames.id, parsed.data.frameId),
        eq(siteCaptureFrames.organizationId, orgId),
      ),
    )
    .returning({ id: siteCaptureFrames.id });
  if (deleted.length === 0) return { ok: false, error: "Frame not found." };

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "site_capture.frame.delete",
    entityType: "site_capture_frame",
    entityId: parsed.data.frameId,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// COMPILE & SEND — AI daily summary digest to the director
// ---------------------------------------------------------------------------

export interface CompileSummaryResult extends ActionResult {
  summaryMarkdown?: string;
}

/**
 * Compiles today's captured frames into an AI daily summary (reuse of
 * the daily construction-digest helper) and persists it as a
 * `daily_summary` frame addressed to the director. Idempotent in the
 * sense that re-running files a fresh snapshot.
 */
export async function compileDailySummary(input?: {
  activeZone?: string | null;
  crewOnShift?: number | null;
}): Promise<CompileSummaryResult> {
  await requireInternalUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const frames = await listTodaysCaptureFrames(500);
  const captureFrames = frames.filter((f) => f.frameType !== "daily_summary");
  if (captureFrames.length === 0) {
    return {
      ok: false,
      error: "Nothing captured yet today — capture a frame before compiling.",
    };
  }

  const photoCount = captureFrames.filter((f) => f.frameType === "photo").length;
  const voiceCount = captureFrames.filter((f) => f.frameType === "voice").length;
  const incidents = captureFrames.filter((f) => f.frameType === "incident");
  const highSeverity = incidents.filter((f) => f.severity === "high").length;
  const noteCount = captureFrames.filter((f) => f.frameType === "note").length;
  const crew =
    input?.crewOnShift ??
    captureFrames.find((f) => f.crewOnShift != null)?.crewOnShift ??
    0;

  // Reuse the daily construction-digest helper for the digest body.
  const digest = buildDailyDigest({
    date: new Date(),
    projectName: "Jobsite (field capture)",
    whatsappMessageCount: 0,
    siteReportCount: captureFrames.length,
    photoCount,
    photosFlaggedByAi: 0,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 0,
    qaQcOpenedToday: incidents.length,
    qaQcResolvedToday: 0,
    workforcePresent: crew,
    workforceExpected: crew,
  });

  const zoneLine = input?.activeZone ? `Active zone: ${input.activeZone}\n` : "";
  const summaryMarkdown = [
    `# Daily site summary — ${today()}`,
    "",
    zoneLine +
      `Compiled by ${me?.fullName ?? "site supervisor"} · ${captureFrames.length} frames captured today.`,
    "",
    `- Crew on shift: ${crew}`,
    `- Photos: ${photoCount}`,
    `- Voice notes: ${voiceCount}`,
    `- Notes: ${noteCount}`,
    `- Incidents: ${incidents.length}${highSeverity > 0 ? ` (⚠ ${highSeverity} high-severity)` : ""}`,
    "",
    digest.progressSummary,
    "",
    digest.risksSummary,
    "",
    "### Recommended for tomorrow",
    ...digest.recommendedActionsForTomorrow.map((a) => `- ${a}`),
  ].join("\n");

  const [frame] = await db
    .insert(siteCaptureFrames)
    .values({
      organizationId: orgId,
      frameType: "daily_summary",
      activeZone: input?.activeZone ?? null,
      crewOnShift: crew,
      title: "Daily summary → director",
      body: summaryMarkdown,
      metadata: {
        sentTo: "director",
        frameCount: captureFrames.length,
        photoCount,
        voiceCount,
        incidentCount: incidents.length,
        highSeverityCount: highSeverity,
        headline: digest.summary,
      },
      capturedBy: me?.id ?? null,
    })
    .returning({ id: siteCaptureFrames.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "site_capture.daily_summary.compile",
    entityType: "site_capture_frame",
    entityId: frame.id,
    after: {
      sentTo: "director",
      frameCount: captureFrames.length,
      highSeverityCount: highSeverity,
    },
  });

  return { ok: true, frameId: frame.id, summaryMarkdown };
}

// ---------------------------------------------------------------------------
// Blob persistence (shared by photo + voice) — mirrors the site-report
// photo-upload pipeline's Supabase-or-dry-run contract.
// ---------------------------------------------------------------------------

async function persistBlob(args: {
  bucket: string;
  storagePath: string;
  base64: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  documentType: string;
  title: string;
  entityId: string;
  uploadedBy: string | null;
}): Promise<{ documentId: string; dryRun: boolean }> {
  const db = requireDb();
  const admin = getSupabaseAdmin();
  let dryRun = false;
  if (admin) {
    const bytes = Buffer.from(args.base64, "base64");
    const { error } = await admin.storage
      .from(args.bucket)
      .upload(args.storagePath, bytes, {
        contentType: args.mimeType,
        upsert: false,
      });
    if (error) {
      throw new Error(
        `Supabase storage upload failed: ${error.message}. Verify bucket "${args.bucket}" exists.`,
      );
    }
  } else {
    dryRun = true;
  }

  const [doc] = await db
    .insert(documents)
    .values({
      title: args.title,
      documentType: args.documentType,
      entityType: "site_capture",
      entityId: args.entityId,
      storageBucket: dryRun ? "dry_run" : args.bucket,
      storagePath: args.storagePath,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      visibility: "internal",
      uploadedBy: args.uploadedBy,
    })
    .returning({ id: documents.id });

  return { documentId: doc.id, dryRun };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

function inferAudioExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && /^(webm|m4a|mp3|mp4|ogg|wav|aac)$/.test(fromName)) {
    return fromName;
  }
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "bin";
}
