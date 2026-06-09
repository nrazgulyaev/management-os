import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { getStorageProvider } from "@/lib/storage";

/**
 * W4 — resolve a displayable image URL for a drawing revision.
 *
 * A revision points at a `documents` row (revision.documentId). The real
 * bytes live in Supabase Storage at `<storage_bucket>/<storage_path>`. This
 * mirrors the signed-URL resolution pattern in
 * src/features/owner-portal/generate-bundle.ts: read the document's
 * bucket + path, then ask the storage provider for a short-lived signed URL
 * the browser can fetch.
 *
 * Self-contained (only this drawing-detail unit uses it). Returns null on
 * db-down / missing document / unconfigured storage so the page can fall
 * back to a clear empty state rather than break.
 *
 * PDF revisions are flagged via `isPdf`: DrawingViewer (Stage 10.B) renders
 * raster images only, so the page shows a "PDF — preview not yet supported"
 * note for those. Rasterising PDF pages is a follow-up.
 */
export interface ResolvedRevisionImage {
  /** Time-limited URL the browser can load into an <img>, or null. */
  url: string | null;
  /** True when the underlying document is a PDF (viewer can't raster it). */
  isPdf: boolean;
  /** Document title, for alt text / labelling. */
  title: string;
  /** True when a document row exists but has no stored file yet. */
  missingFile: boolean;
}

const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes

export async function resolveRevisionImage(
  documentId: string,
): Promise<ResolvedRevisionImage | null> {
  const db = getDb();
  if (!db) return null;

  const [doc] = await db
    .select({
      title: documents.title,
      storageBucket: documents.storageBucket,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      fileName: documents.fileName,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) return null;

  const isPdf =
    doc.mimeType === "application/pdf" ||
    (doc.fileName?.toLowerCase().endsWith(".pdf") ?? false);

  // No real file (e.g. dry-run bucket or metadata-only row).
  const hasFile =
    Boolean(doc.storageBucket && doc.storagePath) &&
    doc.storageBucket !== "dry_run";

  if (!hasFile || !doc.storageBucket || !doc.storagePath) {
    return { url: null, isPdf, title: doc.title, missingFile: true };
  }

  const storage = getStorageProvider();
  const url = await storage.createSignedUrl(doc.storageBucket, doc.storagePath, {
    expirySeconds: SIGNED_URL_TTL_SECONDS,
  });

  return { url, isPdf, title: doc.title, missingFile: url === null };
}
