import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { siteReportPhotos } from "@/lib/db/schema/site-operations";
import { documents } from "@/lib/db/schema/documents";
import { getSiteReportPhotoUrl } from "@/lib/development/server/photo-upload-actions";
import type { PhotoEvidenceItem } from "@/components/award";

/**
 * Sprint MD-2.A — Photo aggregator for the
 * <PhotoEvidenceGrid> consumer on the site-report detail page.
 *
 * Joins `site_report_photos` to `documents` (the polymorphic storage
 * table) and resolves a signed URL via the existing
 * `getSiteReportPhotoUrl` helper. Status is derived from the URL
 * resolution + the `documents.storage_bucket` sentinel value:
 *
 *   - bucket = "dry_run"            → "local"   (no signed URL ever)
 *   - signed URL resolved           → "uploaded"
 *   - bucket present but no URL     → "failed"
 *
 * `uploaded_by` is not surfaced by the existing photo schema, so the
 * `PhotoEvidenceItem.alt` falls back to the caption. RLS continues
 * to live on the parent `site_reports.org_id` boundary as before.
 */

export async function loadSiteReportPhotos(
  siteReportId: string,
): Promise<PhotoEvidenceItem[]> {
  const db = getDb();
  if (!db) return [];

  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      id: siteReportPhotos.id,
      caption: siteReportPhotos.caption,
      photoTakenAt: siteReportPhotos.photoTakenAt,
      bucket: documents.storageBucket,
    })
    .from(siteReportPhotos)
    .innerJoin(documents, eq(documents.id, siteReportPhotos.documentId))
    .where(
      and(
        eq(siteReportPhotos.siteReportId, siteReportId),
        eq(siteReportPhotos.organizationId, organizationId),
      ),
    )
    .orderBy(desc(siteReportPhotos.photoTakenAt));

  if (rows.length === 0) return [];

  // Resolve signed URLs in parallel (1h TTL via Supabase admin).
  const urlEntries = await Promise.all(
    rows.map(async (r) => {
      try {
        const out = await getSiteReportPhotoUrl(r.id);
        return [r.id, out] as const;
      } catch {
        return [
          r.id,
          { url: null as string | null, dryRun: false },
        ] as const;
      }
    }),
  );
  const urlById = new Map(urlEntries);

  return rows.map((r): PhotoEvidenceItem => {
    const resolved = urlById.get(r.id) ?? { url: null, dryRun: false };
    const isDryRun = r.bucket === "dry_run" || resolved.dryRun;
    const status: PhotoEvidenceItem["status"] = isDryRun
      ? "local"
      : resolved.url
        ? "uploaded"
        : "failed";
    return {
      id: r.id,
      thumbnailUrl: resolved.url ?? "",
      fullUrl: resolved.url ?? undefined,
      status,
      caption: r.caption ?? undefined,
      timestamp: r.photoTakenAt
        ? new Date(r.photoTakenAt).toLocaleString()
        : undefined,
      alt: r.caption ?? "Site photo",
    };
  });
}
