import "server-only";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { getSiteReportPhotoUrl } from "@/lib/development/server/photo-upload-actions";
import { canRunPhotoAnalyst } from "@/lib/development/server/photo-analyst-actions";
import { PhotoReanalyzeButton } from "./photo-reanalyze-button";

export interface GalleryPhoto {
  id: string;
  documentId: string;
  zoneId: string | null;
  caption: string | null;
  photoTakenAt: string;
  aiAnalyzedAt?: string | null;
}

export interface GalleryZone {
  id: string;
  zoneCode: string;
  zoneName: string;
}

/**
 * Photo gallery component. Renders a grid of thumbnails grouped by
 * zone. Each thumbnail loads its signed URL on the server (1h TTL);
 * "no zone" photos render in a final ungrouped section.
 *
 * Click a thumbnail → opens the signed URL in a new tab. A full
 * lightbox (prev/next navigation, GPS map, AI panel) is deferred to a
 * polish pass — the basic grid is enough to verify uploads worked
 * end-to-end and gives ops a quick visual scan.
 *
 * AI fields render when present (Stage 3 forward-compat).
 */
export async function PhotoGallery({
  photos,
  zones,
  reportId,
}: {
  photos: GalleryPhoto[];
  zones: GalleryZone[];
  reportId?: string;
}) {
  if (photos.length === 0) {
    return (
      <div className="rounded-md border border-line-soft bg-surface p-6 text-center">
        <ImageIcon
          className="w-8 h-8 mx-auto text-ink-tertiary mb-2"
          strokeWidth={1.5}
        />
        <p className="text-sm text-ink-secondary">No photos yet</p>
        <p className="text-xs text-ink-tertiary mt-1">
          Photos uploaded to this report appear here, organized by zone.
        </p>
      </div>
    );
  }

  // Pre-resolve signed URLs + budget gate in parallel.
  const [urlEntries, budget] = await Promise.all([
    Promise.all(
      photos.map(async (p) => {
        const r = await getSiteReportPhotoUrl(p.id).catch(() => ({
          url: null,
          dryRun: false,
        }));
        return [p.id, r.url] as const;
      }),
    ),
    canRunPhotoAnalyst().catch(() => ({
      allowed: true,
      reason: undefined as string | undefined,
    })),
  ]);
  const urlsById = new Map<string, string | null>(urlEntries);

  const zoneNameById = new Map(zones.map((z) => [z.id, z]));
  const grouped = new Map<string | null, GalleryPhoto[]>();
  for (const p of photos) {
    const key = p.zoneId ?? null;
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }

  // Sort: keyed zones first by zoneCode, then null group.
  const orderedKeys = [...grouped.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    const ax = zoneNameById.get(a)?.zoneCode ?? a;
    const bx = zoneNameById.get(b)?.zoneCode ?? b;
    return ax.localeCompare(bx);
  });

  return (
    <div className="space-y-4">
      {orderedKeys.map((zoneId) => {
        const groupPhotos = grouped.get(zoneId) ?? [];
        const zone = zoneId ? zoneNameById.get(zoneId) : null;
        return (
          <div key={zoneId ?? "__no_zone__"}>
            <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
              {zone ? `${zone.zoneCode} · ${zone.zoneName}` : "No zone tag"}
            </h4>
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {groupPhotos.map((p) => {
                const url = urlsById.get(p.id);
                return (
                  <li key={p.id} className="rounded-md overflow-hidden border border-line-soft bg-surface">
                    {url ? (
                      <Link
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={p.caption ?? "Site photo"}
                          className="w-full h-32 object-cover group-hover:opacity-90 transition-opacity"
                          loading="lazy"
                        />
                      </Link>
                    ) : (
                      <div className="w-full h-32 bg-muted flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-ink-tertiary" />
                      </div>
                    )}
                    <div className="p-2 text-xs">
                      {p.caption && (
                        <div className="truncate text-ink">{p.caption}</div>
                      )}
                      <div className="text-[10px] text-ink-tertiary">
                        {new Date(p.photoTakenAt).toLocaleDateString()}
                      </div>
                      {p.aiAnalyzedAt && (
                        <div className="text-[10px] text-accent">
                          AI analyzed
                        </div>
                      )}
                      {reportId && (
                        <PhotoReanalyzeButton
                          photoId={p.id}
                          reportId={reportId}
                          budgetAllowed={budget.allowed}
                          budgetReason={budget.reason}
                          alreadyAnalyzed={Boolean(p.aiAnalyzedAt)}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
