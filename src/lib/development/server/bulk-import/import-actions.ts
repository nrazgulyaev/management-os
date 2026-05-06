"use server";

import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { bulkImportJobs, BULK_IMPORT_ENTITY_TYPES, BULK_IMPORT_SOURCE_TYPES, type BulkImportEntityType, type BulkImportSourceType, type BulkImportJobStatus } from "@/lib/db/schema/bulk-import";
import { requireInternalUser } from "@/features/auth/permissions";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { parseCsv } from "./csv-parser-helpers";
import { parseXlsx } from "./xlsx-parser-helpers";
import { applyMapping, type FieldMapping } from "./field-mapper-helpers";
import { validateRow } from "./validator-helpers";
import { dispatchEntityInserts } from "./entity-dispatcher";
import { recordAuditEvent } from "@/features/audit/services";

/**
 * Stage 6.P0.7-B — Bulk import server orchestration.
 *
 * Six actions implementing the launch-prompt FSM:
 *   pending → validating → ready → processing → completed | failed | cancelled
 *
 * Storage: per the migration's `source_content` column — CSV/JSON
 * stored as text, XLSX as base64. The cron processor (P0.7-B.2) reads
 * from this column. Documents-table integration is reserved for
 * future iterations (replay + signed-URL audit).
 *
 * Authorization: every action goes through `requireInternalUser()`.
 * RLS on `bulk_import_jobs` enforces per-organization isolation.
 */

// ===========================================================================
// Helpers
// ===========================================================================

/** Parse the inline source content into rows + headers based on source_type. */
function parseSource(
  sourceType: BulkImportSourceType,
  content: string,
): { headers: string[]; rows: Array<Record<string, string>>; parseErrors: Array<{ row: number; message: string }> } {
  if (sourceType === "csv") {
    return parseCsv(content);
  }
  if (sourceType === "xlsx") {
    // Decode base64 → bytes → parse
    const bytes = Buffer.from(content, "base64");
    return parseXlsx(bytes);
  }
  if (sourceType === "json") {
    try {
      const data = JSON.parse(content);
      const arr: unknown[] = Array.isArray(data) ? data : [data];
      if (arr.length === 0) {
        return { headers: [], rows: [], parseErrors: [] };
      }
      const headerSet = new Set<string>();
      for (const r of arr) {
        if (r && typeof r === "object") {
          for (const k of Object.keys(r)) headerSet.add(k);
        }
      }
      const headers = [...headerSet];
      const rows = arr.map((r) => {
        const row: Record<string, string> = {};
        if (r && typeof r === "object") {
          for (const h of headers) {
            const v = (r as Record<string, unknown>)[h];
            row[h] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          }
        }
        return row;
      });
      return { headers, rows, parseErrors: [] };
    } catch (e) {
      return { headers: [], rows: [], parseErrors: [{ row: -1, message: `JSON parse error: ${(e as Error).message}` }] };
    }
  }
  // google_sheets — we don't decode here; OAuth flow (P0.7-D) will populate source_content already-parsed-into-CSV.
  return parseCsv(content);
}

/** Generate a job code in the form IMPORT-YYYY-NNNNNN. */
async function nextJobCode(): Promise<string> {
  const db = requireDb();
  const year = new Date().getFullYear();
  const prefix = `IMPORT-${year}-`;
  const existing = await db.execute(
    sql`SELECT job_code FROM bulk_import_jobs WHERE job_code LIKE ${prefix + "%"} ORDER BY job_code DESC LIMIT 1`,
  );
  const rows = existing as unknown as Array<{ job_code: string }>;
  let next = 1;
  if (rows[0]?.job_code) {
    const m = /-(\d{6})$/.exec(rows[0].job_code);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

/** Resolve the active organization for the current user. */
async function resolveActiveOrgId(): Promise<string> {
  // P0.7 ships with single-tenant default-org behaviour; P1+ will route
  // through the org-switcher cookie when multi-org becomes routine.
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    throw new Error("ARCONIQUE_DEFAULT organization not found — apply migration 0071");
  }
  return org.id;
}

// ===========================================================================
// 1) createBulkImportJob
// ===========================================================================

const createSchema = z.object({
  entityType: z.enum(BULK_IMPORT_ENTITY_TYPES as unknown as [BulkImportEntityType, ...BulkImportEntityType[]]),
  sourceType: z.enum(BULK_IMPORT_SOURCE_TYPES as unknown as [BulkImportSourceType, ...BulkImportSourceType[]]),
  sourceFilename: z.string().max(255).optional(),
  sourceSizeBytes: z.number().int().nonnegative().optional(),
  /** CSV/JSON text or XLSX base64 */
  sourceContent: z.string().min(1, "Source content is required"),
  /** External-column-name → internal-field map (with optional transform/default). */
  fieldMapping: z.record(
    z.string(),
    z.object({
      internalField: z.string(),
      transform: z.enum(["none", "trim", "lowercase", "uppercase"]).optional(),
      defaultValue: z.string().optional(),
    }),
  ),
  saveMappingAs: z.string().max(120).optional(),
});

export interface CreateBulkImportJobResult {
  ok: boolean;
  jobId?: string;
  jobCode?: string;
  totalRows?: number;
  error?: string;
}

/**
 * Create a new bulk-import job. Parses the source to get totalRows,
 * stores the content + mapping, and leaves the job in `ready` state
 * for the cron processor to pick up. The wizard typically calls
 * `validateBulkImportJob` immediately after to populate the preview.
 */
export async function createBulkImportJob(
  input: z.input<typeof createSchema>,
): Promise<CreateBulkImportJobResult> {
  const ctx = await requireInternalUser();
  if (!ctx.appUser) {
    return { ok: false, error: "Authenticated user required" };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Quick parse to compute totalRows; we don't surface parse errors
  // here (validateBulkImportJob does). If parse fails, we still create
  // the job in `pending` so the user can see it in the jobs list.
  const parsedSource = parseSource(data.sourceType, data.sourceContent);

  const db = requireDb();
  const orgId = await resolveActiveOrgId();
  const jobCode = await nextJobCode();

  const [row] = await db
    .insert(bulkImportJobs)
    .values({
      organizationId: orgId,
      jobCode,
      entityType: data.entityType,
      sourceType: data.sourceType,
      sourceFilename: data.sourceFilename ?? null,
      sourceSizeBytes:
        data.sourceSizeBytes !== undefined
          ? BigInt(data.sourceSizeBytes)
          : null,
      sourceContent: data.sourceContent,
      fieldMapping: data.fieldMapping as never,
      saveMappingAs: data.saveMappingAs ?? null,
      totalRows: parsedSource.rows.length,
      status: "pending",
      initiatedBy: ctx.appUser.id,
    })
    .returning({ id: bulkImportJobs.id, jobCode: bulkImportJobs.jobCode });

  return {
    ok: true,
    jobId: row.id,
    jobCode: row.jobCode,
    totalRows: parsedSource.rows.length,
  };
}

// ===========================================================================
// 2) validateBulkImportJob
// ===========================================================================

export interface ValidateBulkImportJobResult {
  ok: boolean;
  jobId: string;
  status?: BulkImportJobStatus;
  totalRows?: number;
  validRowCount?: number;
  invalidRowCount?: number;
  /** First-100 row preview with per-row validity */
  preview?: Array<{
    rowIndex: number;
    valid: boolean;
    errors?: Array<{ field: string; message: string }>;
    raw: Record<string, string>;
  }>;
  error?: string;
}

const PREVIEW_ROW_CAP = 100;

/**
 * Read the source file, apply mapping, validate first 100 rows.
 * Sets status to `ready` if validation succeeded, `failed` if the
 * source can't be parsed at all.
 */
export async function validateBulkImportJob(input: {
  jobId: string;
}): Promise<ValidateBulkImportJobResult> {
  await requireInternalUser();
  const db = requireDb();
  const jobs = await db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.id, input.jobId))
    .limit(1);
  const job = jobs[0];
  if (!job) return { ok: false, jobId: input.jobId, error: "Job not found" };

  await db
    .update(bulkImportJobs)
    .set({ status: "validating", updatedAt: new Date() })
    .where(eq(bulkImportJobs.id, job.id));

  if (!job.sourceContent) {
    await db
      .update(bulkImportJobs)
      .set({
        status: "failed",
        errorLog: [{ row: -1, message: "No source_content stored on job row" }] as never,
        updatedAt: new Date(),
      })
      .where(eq(bulkImportJobs.id, job.id));
    return {
      ok: false,
      jobId: job.id,
      status: "failed",
      error: "No source content available",
    };
  }

  const parsedSource = parseSource(job.sourceType as BulkImportSourceType, job.sourceContent);
  if (parsedSource.parseErrors.length > 0 && parsedSource.rows.length === 0) {
    await db
      .update(bulkImportJobs)
      .set({
        status: "failed",
        errorLog: parsedSource.parseErrors as never,
        updatedAt: new Date(),
      })
      .where(eq(bulkImportJobs.id, job.id));
    return {
      ok: false,
      jobId: job.id,
      status: "failed",
      error: parsedSource.parseErrors[0]?.message ?? "Parse failed",
    };
  }

  const mapping = job.fieldMapping as FieldMapping;
  const previewRows = parsedSource.rows.slice(0, PREVIEW_ROW_CAP);

  const preview: ValidateBulkImportJobResult["preview"] = [];
  let validCount = 0;
  for (let i = 0; i < previewRows.length; i++) {
    const raw = previewRows[i];
    const mapped = applyMapping(raw, mapping);
    const result = validateRow(job.entityType, mapped);
    if (result.ok) validCount += 1;
    preview.push({
      rowIndex: i,
      valid: result.ok,
      errors: result.errors,
      raw,
    });
  }
  const invalidCount = previewRows.length - validCount;

  await db
    .update(bulkImportJobs)
    .set({
      status: "ready",
      totalRows: parsedSource.rows.length,
      validatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, job.id));

  return {
    ok: true,
    jobId: job.id,
    status: "ready",
    totalRows: parsedSource.rows.length,
    validRowCount: validCount,
    invalidRowCount: invalidCount,
    preview,
  };
}

// ===========================================================================
// 3) processBulkImportJob — stub for cron-driven processing
// ===========================================================================

export interface ProcessBulkImportJobResult {
  ok: boolean;
  jobId: string;
  status?: BulkImportJobStatus;
  processed?: number;
  successful?: number;
  failed?: number;
  error?: string;
}

const PROCESS_BATCH_SIZE = 1000;

/**
 * Process one batch of rows from a `ready` job. Idempotent: re-running
 * picks up where `processed_rows` left off.
 *
 * Pipeline per row:
 *   raw → applyMapping → validateRow → (if valid) dispatchEntityInserts → DB write
 *
 * Validation failures and dispatcher failures both land in `errorLog`
 * with absolute row indices. Created entity IDs accumulate in
 * `created_entity_ids`. Status transitions to `completed` only if zero
 * rows failed; otherwise `failed` once all batches are processed.
 */
export async function processBulkImportJob(input: {
  jobId: string;
}): Promise<ProcessBulkImportJobResult> {
  const db = requireDb();
  const jobs = await db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.id, input.jobId))
    .limit(1);
  const job = jobs[0];
  if (!job) return { ok: false, jobId: input.jobId, error: "Job not found" };

  if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
    return { ok: true, jobId: job.id, status: job.status as BulkImportJobStatus };
  }

  if (!job.sourceContent) {
    return { ok: false, jobId: job.id, error: "No source content" };
  }

  await db
    .update(bulkImportJobs)
    .set({
      status: "processing",
      startedAt: job.startedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, job.id));

  const parsedSource = parseSource(job.sourceType as BulkImportSourceType, job.sourceContent);
  const mapping = job.fieldMapping as FieldMapping;
  const startIdx = job.processedRows ?? 0;
  const batchEnd = Math.min(startIdx + PROCESS_BATCH_SIZE, parsedSource.rows.length);
  const batch = parsedSource.rows.slice(startIdx, batchEnd);
  const mappedBatch = batch.map((r) => applyMapping(r, mapping));

  // Step 1: validation gate. Walk row-by-row so we keep a stable map
  // from each valid (parsed) row back to its source row index — both
  // for absolute error reporting and so the dispatcher's relative
  // indices can be remapped back to the source file.
  const validRows: Array<Record<string, unknown>> = [];
  const validRowMap: number[] = []; // batch-relative index for each valid row
  const validationErrors: Array<{ rowIndex: number; field: string; message: string }> = [];
  for (let i = 0; i < mappedBatch.length; i++) {
    const r = validateRow(job.entityType, mappedBatch[i]);
    if (r.ok && r.value) {
      validRows.push(r.value);
      validRowMap.push(i);
    } else if (r.errors) {
      for (const e of r.errors) {
        validationErrors.push({ rowIndex: i, field: e.field, message: e.message });
      }
    }
  }
  const validationFailedRowCount = mappedBatch.length - validRows.length;

  // Step 2: dispatch valid rows to entity insert handlers. Pass 0 as
  // rowIndexOffset — we remap below using validRowMap so insert errors
  // reference the source file's row index, not the batch position.
  let insertResult = {
    successCount: 0,
    failCount: 0,
    createdIds: [] as string[],
    errors: [] as Array<{ rowIndex: number; field?: string; message: string }>,
  };
  if (validRows.length > 0) {
    const r = await dispatchEntityInserts(job.entityType as BulkImportEntityType, {
      rows: validRows,
      rowIndexOffset: 0,
      options: { skipInvalid: true },
    });
    insertResult = {
      successCount: r.successCount,
      failCount: r.failCount,
      createdIds: r.createdIds,
      errors: r.errors.map((e) => ({
        ...e,
        rowIndex: startIdx + validRowMap[e.rowIndex],
      })),
    };
  }

  const validationErrorsAbsolute = validationErrors.map((e) => ({
    rowIndex: startIdx + e.rowIndex,
    field: e.field,
    message: e.message,
  }));
  const existingErrors =
    (job.errorLog as Array<{ rowIndex: number; field?: string; message: string }>) ?? [];
  const combinedErrors = [
    ...existingErrors,
    ...validationErrorsAbsolute,
    ...insertResult.errors,
  ];

  const newProcessed = batchEnd;
  const newSuccessful = (job.successfulRows ?? 0) + insertResult.successCount;
  const newFailed =
    (job.failedRows ?? 0) + validationFailedRowCount + insertResult.failCount;
  const isDone = newProcessed >= parsedSource.rows.length;

  const existingCreatedIds =
    (job.createdEntityIds as string[] | null) ?? [];
  const combinedCreatedIds = [...existingCreatedIds, ...insertResult.createdIds];

  const finalStatus: BulkImportJobStatus = isDone
    ? newFailed === 0
      ? "completed"
      : "failed"
    : "ready";

  await db
    .update(bulkImportJobs)
    .set({
      processedRows: newProcessed,
      successfulRows: newSuccessful,
      failedRows: newFailed,
      errorLog: combinedErrors as never,
      createdEntityIds: combinedCreatedIds,
      status: finalStatus,
      completedAt: isDone ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, job.id));

  // Audit-log emit on terminal transition. Cron path has no request
  // context — pass explicit ip/userAgent nulls so recordAuditEvent
  // skips its headers() lookup.
  if (isDone) {
    await recordAuditEvent({
      actorUserId: job.initiatedBy,
      action:
        finalStatus === "completed"
          ? "bulk_import.completed"
          : "bulk_import.failed",
      entityType: "bulk_import_job",
      entityId: job.id,
      metadata: {
        jobCode: job.jobCode,
        importedEntityType: job.entityType,
        sourceType: job.sourceType,
        sourceFilename: job.sourceFilename,
        totalRows: parsedSource.rows.length,
        successfulRows: newSuccessful,
        failedRows: newFailed,
        createdEntityIdCount: combinedCreatedIds.length,
      },
      ipAddress: null,
      userAgent: null,
    });
  }

  return {
    ok: true,
    jobId: job.id,
    status: isDone ? finalStatus : "processing",
    processed: newProcessed,
    successful: newSuccessful,
    failed: newFailed,
  };
}

// ===========================================================================
// 4) cancelBulkImportJob
// ===========================================================================

export async function cancelBulkImportJob(input: {
  jobId: string;
  reason?: string;
}): Promise<{ ok: boolean; status?: BulkImportJobStatus; error?: string }> {
  await requireInternalUser();
  const db = requireDb();
  const jobs = await db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.id, input.jobId))
    .limit(1);
  const job = jobs[0];
  if (!job) return { ok: false, error: "Job not found" };
  if (job.status === "completed") {
    return { ok: false, status: "completed", error: "Cannot cancel a completed job" };
  }
  await db
    .update(bulkImportJobs)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, input.jobId));
  return { ok: true, status: "cancelled" };
}

// ===========================================================================
// 5) listBulkImportJobs
// ===========================================================================

const listFiltersSchema = z.object({
  status: z
    .enum([
      "pending",
      "validating",
      "ready",
      "processing",
      "completed",
      "failed",
      "cancelled",
    ])
    .optional(),
  entityType: z
    .enum(BULK_IMPORT_ENTITY_TYPES as unknown as [BulkImportEntityType, ...BulkImportEntityType[]])
    .optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export async function listBulkImportJobs(
  input: z.input<typeof listFiltersSchema> = {},
) {
  await requireInternalUser();
  const filters = listFiltersSchema.parse(input);
  const db = requireDb();
  const orgId = await resolveActiveOrgId();
  const conds = [eq(bulkImportJobs.organizationId, orgId)];
  if (filters.status) conds.push(eq(bulkImportJobs.status, filters.status));
  if (filters.entityType) conds.push(eq(bulkImportJobs.entityType, filters.entityType));
  return db
    .select({
      id: bulkImportJobs.id,
      jobCode: bulkImportJobs.jobCode,
      entityType: bulkImportJobs.entityType,
      sourceType: bulkImportJobs.sourceType,
      sourceFilename: bulkImportJobs.sourceFilename,
      status: bulkImportJobs.status,
      totalRows: bulkImportJobs.totalRows,
      processedRows: bulkImportJobs.processedRows,
      successfulRows: bulkImportJobs.successfulRows,
      failedRows: bulkImportJobs.failedRows,
      initiatedAt: bulkImportJobs.initiatedAt,
      completedAt: bulkImportJobs.completedAt,
    })
    .from(bulkImportJobs)
    .where(and(...conds))
    .orderBy(desc(bulkImportJobs.initiatedAt))
    .limit(filters.limit)
    .offset(filters.offset);
}

// ===========================================================================
// 6) getBulkImportJob
// ===========================================================================

export async function getBulkImportJob(input: { jobId: string }) {
  await requireInternalUser();
  const db = requireDb();
  const orgId = await resolveActiveOrgId();
  const rows = await db
    .select()
    .from(bulkImportJobs)
    .where(
      and(
        eq(bulkImportJobs.id, input.jobId),
        eq(bulkImportJobs.organizationId, orgId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
