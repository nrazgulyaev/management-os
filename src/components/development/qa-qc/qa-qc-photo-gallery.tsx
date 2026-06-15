import "server-only";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { getQaQcPhotoUrl } from "@/lib/development/server/qa-qc/qa-qc-photo-upload-actions";
import { QaQcPhotoDeleteButton } from "@/app/(development-app)/development-os/qa-qc/[code]/_photo-delete-button";

export interface QaQcGalleryPhoto {
  id: string;
  documentId: string;
  photoRole: string;
  caption: string | null;
  uploadedAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  initial_defect: "Initial defect",
  work_in_progress: "Work in progress",
  resolution_proof: "Resolution proof",
  reinspection: "Reinspection",
};

const ROLE_ORDER = [
  "initial_defect",
  "work_in_progress",
  "resolution_proof",
  "reinspection",
];

/**
 * QA/QC issue photo gallery. Renders a grid of thumbnails grouped by
 * `photoRole`. Each thumbnail loads its signed URL on the server (1h
 * TTL). Click a thumbnail → opens the signed URL in a new tab.
 *
 * Cloned from the site-report `PhotoGallery`; the zone-grouping + AI
 * reanalyze button are dropped — QA/QC photos group by lifecycle role
 * instead.
 */
export async function QaQcPhotoGallery({
  photos,
  issueCode,
}: {
  photos: QaQcGalleryPhoto[];
  /** When provided, each thumbnail gets a delete control. */
  issueCode?: string;
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
          Site evidence uploaded to this issue appears here, grouped by role.
        </p>
      </div>
    );
  }

  // Pre-resolve signed URLs in parallel.
  const urlEntries = await Promise.all(
    photos.map(async (p) => {
      const r = await getQaQcPhotoUrl(p.id).catch(() => ({
        url: null,
        dryRun: false,
      }));
      return [p.id, r.url] as const;
    }),
  );
  const urlsById = new Map<string, string | null>(urlEntries);

  const grouped = new Map<string, QaQcGalleryPhoto[]>();
  for (const p of photos) {
    const arr = grouped.get(p.photoRole) ?? [];
    arr.push(p);
    grouped.set(p.photoRole, arr);
  }

  // Known roles in lifecycle order first, then any unknown roles.
  const orderedKeys = [...grouped.keys()].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a);
    const bi = ROLE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="space-y-4">
      {orderedKeys.map((role) => {
        const groupPhotos = grouped.get(role) ?? [];
        return (
          <div key={role}>
            <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
              {ROLE_LABELS[role] ?? role}
            </h4>
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {groupPhotos.map((p) => {
                const url = urlsById.get(p.id);
                return (
                  <li
                    key={p.id}
                    className="rounded-md overflow-hidden border border-line-soft bg-surface"
                  >
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
                          alt={p.caption ?? "QA/QC photo"}
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-ink-tertiary">
                          {new Date(p.uploadedAt).toLocaleDateString()}
                        </div>
                        {issueCode && (
                          <QaQcPhotoDeleteButton
                            photoId={p.id}
                            issueCode={issueCode}
                          />
                        )}
                      </div>
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
