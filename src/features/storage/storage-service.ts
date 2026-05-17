import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { documents } from "@/lib/db/schema/documents";

/**
 * Sprint STORAGE-1 — Supabase Storage backend.
 *
 * Wraps the @supabase/supabase-js admin client + writes paired
 * `documents` rows. Storage path convention:
 *
 *   <bucket>/org/{orgId}/{entityType}/{entityId}/{documentId}.{ext}
 *
 * Single bucket `arconique-documents` (created on demand). RLS lives
 * on the database side via the `documents.visibility` column + downstream
 * reader queries — Supabase Storage bucket is private and access flows
 * through signed URLs generated server-side.
 *
 * Schema note: existing `documents.visibility` enum is the legacy
 * `internal | owner | guest | public`. We map the broader spec
 * `operator_only | owner_visible | investor_visible | public` to that
 * via the helper below, until DEMO-3-SCHEMA-2 widens the column.
 */

const BUCKET_NAME = "arconique-documents";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1h

export type DocumentEntityType =
  | "project"
  | "villa"
  | "owner"
  | "booking"
  | "supplier"
  | "task"
  | "maintenance"
  | "statement"
  | "site_report";

export type DocumentVisibility =
  | "operator_only"
  | "owner_visible"
  | "investor_visible"
  | "public";

// DEMO-3-SCHEMA-2: documents.visibility CHECK widened to accept the
// broader spec vocabulary. Identity mapping now — legacy aliases
// preserved at READ time elsewhere when filtering.
const VISIBILITY_TO_DB: Record<DocumentVisibility, string> = {
  operator_only: "operator_only",
  owner_visible: "owner_visible",
  investor_visible: "investor_visible",
  public: "public",
};

interface BucketState {
  exists: boolean;
  created: boolean;
  error: string | null;
}

let bucketEnsuredAt: number | null = null;

async function ensureBucket(): Promise<BucketState> {
  const admin = getSupabaseAdmin();
  if (!admin) return { exists: false, created: false, error: "Admin client not configured" };
  // Cache for 5 minutes — bucket creation is idempotent but rate-limit-prone.
  if (bucketEnsuredAt && Date.now() - bucketEnsuredAt < 5 * 60 * 1000) {
    return { exists: true, created: false, error: null };
  }
  const { data: list, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    return { exists: false, created: false, error: listError.message };
  }
  if (list?.find((b) => b.name === BUCKET_NAME)) {
    bucketEnsuredAt = Date.now();
    return { exists: true, created: false, error: null };
  }
  const { error: createError } = await admin.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024, // 25 MB ceiling per upload
  });
  if (createError && !/already exists/i.test(createError.message)) {
    return { exists: false, created: false, error: createError.message };
  }
  bucketEnsuredAt = Date.now();
  return { exists: true, created: true, error: null };
}

function extFromMime(mimeType: string, fallback = "bin"): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/webm": "weba",
    "text/plain": "txt",
  };
  return map[mimeType] ?? fallback;
}

export interface UploadDocumentInput {
  organizationId: string;
  entityType: DocumentEntityType;
  entityId: string;
  documentType: string; // contract | invoice | receipt | photo | statement | ...
  title: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array | Buffer;
  visibility?: DocumentVisibility;
  uploadedBy?: string | null;
}

export interface UploadDocumentResult {
  ok: boolean;
  documentId?: string;
  storagePath?: string;
  error?: string;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Supabase admin client not configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  const bucket = await ensureBucket();
  if (bucket.error) return { ok: false, error: bucket.error };

  // Pre-allocate a documents row id by inserting first so the path
  // includes the document id (helps downstream auditing).
  const visibility = input.visibility ?? "operator_only";
  const dbVisibility = VISIBILITY_TO_DB[visibility];
  const ext = extFromMime(input.mimeType, input.fileName.split(".").pop() ?? "bin");

  const [docRow] = await db
    .insert(documents)
    .values({
      title: input.title,
      documentType: input.documentType,
      entityType: input.entityType,
      entityId: input.entityId,
      storageBucket: BUCKET_NAME,
      storagePath: "", // updated after upload
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      visibility: dbVisibility,
      status: "active",
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning({ id: documents.id });
  if (!docRow) return { ok: false, error: "Failed to insert documents row" };

  const storagePath = `org/${input.organizationId}/${input.entityType}/${input.entityId}/${docRow.id}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, input.bytes, {
      contentType: input.mimeType,
      upsert: false,
    });
  if (uploadError) {
    // Roll back the documents row.
    await db.delete(documents).where(eq(documents.id, docRow.id));
    return { ok: false, error: uploadError.message };
  }

  await db
    .update(documents)
    .set({ storagePath, updatedAt: new Date() })
    .where(eq(documents.id, docRow.id));

  return { ok: true, documentId: docRow.id, storagePath };
}

export interface SignedUrlResult {
  ok: boolean;
  signedUrl?: string;
  expiresAt?: string;
  error?: string;
}

export async function getDocumentSignedUrl(
  documentId: string,
): Promise<SignedUrlResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Supabase admin client not configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  const [doc] = await db
    .select({
      bucket: documents.storageBucket,
      path: documents.storagePath,
      visibility: documents.visibility,
      status: documents.status,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found" };
  if (doc.status !== "active") return { ok: false, error: "Document archived" };
  if (!doc.path || !doc.bucket) return { ok: false, error: "Document has no storage path" };

  const { data, error } = await admin.storage
    .from(doc.bucket)
    .createSignedUrl(doc.path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) return { ok: false, error: error?.message ?? "signed-url-failed" };
  return {
    ok: true,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
  };
}

export interface DeleteDocumentResult {
  ok: boolean;
  error?: string;
}

export async function deleteDocument(documentId: string): Promise<DeleteDocumentResult> {
  const admin = getSupabaseAdmin();
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const [doc] = await db
    .select({ bucket: documents.storageBucket, path: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found" };
  if (admin && doc.bucket && doc.path) {
    await admin.storage.from(doc.bucket).remove([doc.path]).catch(() => null);
  }
  await db.delete(documents).where(eq(documents.id, documentId));
  return { ok: true };
}

export interface DocumentListRow {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  visibility: string;
  createdAt: Date;
}

export async function listDocumentsByEntity(
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DocumentListRow[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: documents.id,
      title: documents.title,
      documentType: documents.documentType,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      visibility: documents.visibility,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.entityType, entityType),
        eq(documents.entityId, entityId),
        eq(documents.status, "active"),
      ),
    );
}

export { BUCKET_NAME };
