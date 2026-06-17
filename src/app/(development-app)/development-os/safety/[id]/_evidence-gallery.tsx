import "server-only";

import { FileText, ImageIcon } from "lucide-react";
import { getSafetyEvidenceUrl } from "@/lib/development/server/safety-actions";

/**
 * Renders the evidence linked to a safety incident: the photos in
 * `photo_document_ids[]` as a thumbnail grid + the single investigation
 * report (`report_document_id`) as a download link. Each document mints
 * a fresh 1-hour signed URL on the server; we never persist URLs.
 */
export async function SafetyEvidenceGallery({
  photoDocumentIds,
  reportDocumentId,
}: {
  photoDocumentIds: string[];
  reportDocumentId: string | null;
}) {
  const [photos, report] = await Promise.all([
    Promise.all(
      photoDocumentIds.map(async (id) => ({ id, ...(await getSafetyEvidenceUrl(id)) })),
    ),
    reportDocumentId ? getSafetyEvidenceUrl(reportDocumentId) : null,
  ]);

  const hasAny = photos.length > 0 || !!report;
  if (!hasAny) {
    return (
      <div className="rounded-md border border-line-soft bg-surface p-6 text-center">
        <ImageIcon
          className="w-8 h-8 mx-auto text-ink-tertiary mb-2"
          strokeWidth={1.5}
        />
        <p className="text-sm text-ink-secondary">No evidence yet</p>
        <p className="text-xs text-ink-tertiary mt-1">
          Photos and the investigation report uploaded below appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {report && (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
            Investigation report
          </h4>
          {report.url ? (
            <a
              href={report.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-line-soft bg-surface px-3 py-2 text-sm hover:bg-muted/40"
            >
              <FileText className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
              {report.fileName ?? "Open report"}
            </a>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-md border border-line-soft bg-muted/40 px-3 py-2 text-sm text-ink-tertiary">
              <FileText className="w-4 h-4" strokeWidth={1.75} />
              {report.fileName ?? "Report"}
              {report.dryRun ? " · dry-run (no bytes stored)" : ""}
            </div>
          )}
        </div>
      )}

      {photos.length > 0 && (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
            Photos ({photos.length})
          </h4>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {photos.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-line-soft bg-surface overflow-hidden"
              >
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.fileName ?? "Incident photo"}
                      className="w-full h-28 object-cover"
                    />
                  </a>
                ) : (
                  <div className="w-full h-28 bg-muted flex flex-col items-center justify-center text-center px-2">
                    <ImageIcon
                      className="w-5 h-5 text-ink-tertiary mb-1"
                      strokeWidth={1.5}
                    />
                    <span className="text-[10px] text-ink-tertiary">
                      {p.dryRun ? "dry-run" : "unavailable"}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
