/**
 * Phase 2.3 owner-06 / Packet C PR 2 — generateOwnerBundle.
 *
 * Stitches owner-visible documents into a single download. Two kinds:
 *   - "year-end"        — every statement PDF + tax summary for the year
 *   - "monthly-tax"     — 12 months of PHR + WHT certs
 *
 * Single-PDF output when every source is already PDF (uses
 * stitchPdfs). Otherwise wrapped as a ZIP with MANIFEST.txt via
 * bundleZip.
 *
 * Cached 24h via unstable_cache, keyed on (ownerId, kind, year).
 * Invalidation on documents writes is the caller's concern (revalidatePath).
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { auditEvents } from "@/lib/db/schema/audit";
import { stitchPdfs, bundleZip } from "@/lib/pdf";
import { getStorageProvider } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BundleKind = "year-end" | "monthly-tax";

export interface BundleResult {
  url: string | null;
  filename: string;
  generatedAt: string;
  cached: boolean;
  fileCount: number;
  sizeBytes: number;
  format: "pdf" | "zip" | "none";
}

const BUNDLE_BUCKET = "owner-bundles";

function manifestText(args: {
  ownerId: string;
  kind: BundleKind;
  year: number;
  files: Array<{ filename: string; title: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`Arconique Owner Portal — bundle ${args.kind} ${args.year}`);
  lines.push(`Owner: ${args.ownerId}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Files: ${args.files.length}`);
  lines.push("");
  for (const f of args.files) {
    lines.push(`- ${f.filename}  (${f.title})`);
  }
  return lines.join("\n");
}

async function uploadBundle(
  filename: string,
  data: Buffer,
  contentType: string,
): Promise<{ url: string | null; storagePath: string }> {
  const admin = getSupabaseAdmin();
  const storagePath = `${filename}`;
  if (!admin) {
    // Fall back to dry-run: storage isn't configured, leave url null.
    return { url: null, storagePath };
  }
  const { error } = await admin.storage
    .from(BUNDLE_BUCKET)
    .upload(storagePath, data, { contentType, upsert: true });
  if (error) {
    throw new Error(`generate-bundle: upload failed — ${error.message}`);
  }
  const storage = getStorageProvider();
  const signed = await storage.createSignedUrl(BUNDLE_BUCKET, storagePath, {
    expirySeconds: 60 * 60, // 1h
  });
  return { url: signed, storagePath };
}

async function build(
  ownerId: string,
  kind: BundleKind,
  year: number,
): Promise<BundleResult> {
  const db = getDb();
  const filename = `${kind}-${year}-${ownerId.slice(0, 8)}.pdf`;
  const generatedAt = new Date().toISOString();

  if (!db) {
    return {
      url: null,
      filename,
      generatedAt,
      cached: false,
      fileCount: 0,
      sizeBytes: 0,
      format: "none",
    };
  }

  // Resolve target document set per bundle kind.
  // year-end: all statement PDFs + tax summary docs in the year
  // monthly-tax: certificate docs (tax_cert / WHT) in the year
  const yearStart = `${year}-01-01T00:00:00Z`;
  const yearEnd = `${year}-12-31T23:59:59Z`;
  const docTypeFilter = kind === "year-end"
    ? ["statement", "certificate"]
    : ["certificate"];

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      documentType: documents.documentType,
      storageBucket: documents.storageBucket,
      storagePath: documents.storagePath,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(
      and(
        eq(documents.entityType, "owner"),
        eq(documents.entityId, ownerId),
        eq(documents.status, "active"),
        eq(documents.visibleToOwner, true),
        gte(documents.createdAt, new Date(yearStart)),
        lte(documents.createdAt, new Date(yearEnd)),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(120);

  const inScope = rows.filter((r) => docTypeFilter.includes(r.documentType));
  if (inScope.length === 0) {
    return {
      url: null,
      filename,
      generatedAt,
      cached: false,
      fileCount: 0,
      sizeBytes: 0,
      format: "none",
    };
  }

  // Resolve signed URLs for each source via the storage provider.
  const storage = getStorageProvider();
  const sources = await Promise.all(
    inScope.map(async (r) => {
      const url = r.storageBucket && r.storagePath
        ? await storage.createSignedUrl(r.storageBucket, r.storagePath, { expirySeconds: 60 * 10 })
        : null;
      return {
        id: r.id,
        title: r.title,
        url,
        fileName: r.fileName ?? `${r.id}.pdf`,
        mimeType: r.mimeType ?? "application/pdf",
      };
    }),
  );
  const fetchable = sources.filter((s): s is typeof s & { url: string } => s.url !== null);

  // Stitch path — single PDF when every source is PDF.
  const allPdf = fetchable.every((s) => s.mimeType === "application/pdf");
  let buffer: Buffer;
  let contentType: string;
  let format: "pdf" | "zip";
  let fileCount: number;

  if (allPdf && fetchable.length > 0) {
    const result = await stitchPdfs({
      sources: fetchable.map((s) => ({ url: s.url, label: s.title })),
      title: `${kind} ${year}`,
      metadata: { author: "Arconique Management", subject: `Owner ${ownerId} ${kind} ${year}` },
    });
    buffer = result.buffer;
    contentType = "application/pdf";
    format = "pdf";
    fileCount = result.sources.length;
  } else {
    // ZIP path — fetch each file then pack.
    const entries = await Promise.all(
      fetchable.map(async (s) => {
        const res = await fetch(s.url);
        if (!res.ok) throw new Error(`generate-bundle: fetch ${s.url} → ${res.status}`);
        return {
          filename: s.fileName,
          data: Buffer.from(await res.arrayBuffer()),
          mimeType: s.mimeType,
        };
      }),
    );
    const result = await bundleZip({
      entries,
      manifestText: manifestText({
        ownerId,
        kind,
        year,
        files: fetchable.map((s) => ({ filename: s.fileName, title: s.title })),
      }),
    });
    buffer = result.buffer;
    contentType = "application/zip";
    format = "zip";
    fileCount = result.fileCount;
  }

  const finalFilename = format === "pdf"
    ? filename
    : filename.replace(/\.pdf$/, ".zip");
  const { url } = await uploadBundle(finalFilename, buffer, contentType);

  // Audit log — fire-and-forget; bundle generation must not fail if the
  // log insert errors.
  try {
    await db.insert(auditEvents).values({
      action: "owner.bundle.generated",
      entityType: "owner",
      entityId: ownerId,
      metadata: {
        kind,
        year,
        format,
        fileCount,
        sizeBytes: buffer.byteLength,
        sourceDocumentIds: inScope.map((r) => r.id),
      },
    });
  } catch {
    // Swallow; the bundle is generated either way.
  }

  return {
    url,
    filename: finalFilename,
    generatedAt,
    cached: false,
    fileCount,
    sizeBytes: buffer.byteLength,
    format,
  };
}

export function generateOwnerBundle(ownerId: string, kind: BundleKind, year: number) {
  const fn = unstable_cache(
    () => build(ownerId, kind, year),
    ["owner-bundle", ownerId, kind, String(year)],
    { revalidate: 60 * 60 * 24 },
  );
  return fn();
}
