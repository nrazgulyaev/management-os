"use client";

import { useState, useRef } from "react";
import { Upload, Camera, X, AlertCircle } from "lucide-react";
import type { SiteZoneListItem } from "@/lib/development/server/site-reports";

/**
 * Site report photo upload zone. Supports drag/drop + multi-file
 * select + camera capture (mobile). Each file is sent as base64 to the
 * `uploadSiteReportPhoto` server action via a Route Handler endpoint;
 * we don't post FormData directly so the action keeps its zod schema.
 *
 * EXIF GPS extraction is deliberately NOT included — adds a dep
 * (`exifr`) and the GPS field on `site_report_photos` is optional.
 * Operators on mobile that have GPS-tagged photos can paste the
 * coordinates manually for now; the field stays available for the
 * Stage 3 AI pipeline to populate from raw EXIF.
 */

interface PendingPhoto {
  localId: string;
  file: File;
  preview: string;
  caption: string;
  zoneId: string | "";
  status: "pending" | "uploading" | "uploaded" | "failed";
  error?: string;
  uploadedPhotoId?: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 10 * 1024 * 1024;

export function PhotoUploadZone({
  reportId,
  zones,
  onPhotoUploaded,
}: {
  reportId: string;
  zones: SiteZoneListItem[];
  onPhotoUploaded?: (photoId: string) => void;
}) {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const next: PendingPhoto[] = [];
    for (const f of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        next.push({
          localId: crypto.randomUUID(),
          file: f,
          preview: "",
          caption: "",
          zoneId: "",
          status: "failed",
          error: `Unsupported type ${f.type}`,
        });
        continue;
      }
      if (f.size > MAX_BYTES) {
        next.push({
          localId: crypto.randomUUID(),
          file: f,
          preview: "",
          caption: "",
          zoneId: "",
          status: "failed",
          error: `File ${(f.size / 1024 / 1024).toFixed(1)}MB exceeds 10MB`,
        });
        continue;
      }
      next.push({
        localId: crypto.randomUUID(),
        file: f,
        preview: URL.createObjectURL(f),
        caption: "",
        zoneId: "",
        status: "pending",
      });
    }
    setPhotos((prev) => [...prev, ...next]);
  }

  async function uploadOne(localId: string) {
    setPhotos((prev) =>
      prev.map((p) => (p.localId === localId ? { ...p, status: "uploading" } : p)),
    );
    const photo = photos.find((p) => p.localId === localId);
    if (!photo) return;
    try {
      const buf = await photo.file.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      const res = await fetch("/api/development/site-reports/photos/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId,
          zoneId: photo.zoneId || null,
          caption: photo.caption || null,
          fileName: photo.file.name,
          mimeType: photo.file.type,
          sizeBytes: photo.file.size,
          fileBase64: base64,
          takenAt: photo.file.lastModified
            ? new Date(photo.file.lastModified).toISOString()
            : null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as { photoId: string; dryRun: boolean };
      setPhotos((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, status: "uploaded", uploadedPhotoId: result.photoId }
            : p,
        ),
      );
      onPhotoUploaded?.(result.photoId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhotos((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, status: "failed", error: msg }
            : p,
        ),
      );
    }
  }

  function uploadAll() {
    for (const p of photos.filter((p) => p.status === "pending")) {
      void uploadOne(p.localId);
    }
  }

  function remove(localId: string) {
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
  }

  function update(localId: string, patch: Partial<PendingPhoto>) {
    setPhotos((prev) =>
      prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)),
    );
  }

  const pendingCount = photos.filter((p) => p.status === "pending").length;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragOver ? "border-accent bg-accent/5" : "border-line-soft bg-surface"}`}
      >
        <Upload
          className="w-8 h-8 mx-auto text-ink-tertiary mb-2"
          strokeWidth={1.5}
        />
        <p className="text-sm text-ink mb-1">
          Drag photos here, or click to select
        </p>
        <p className="text-xs text-ink-tertiary mb-3">
          JPG/PNG/WEBP/HEIC, max 10 MB each
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700"
          >
            Select files
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="rounded-md border border-line-soft bg-surface px-3 py-1.5 text-xs hover:bg-muted/40 inline-flex items-center gap-1"
          >
            <Camera className="w-3 h-3" /> Camera
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </div>

      {photos.length > 0 && (
        <div className="space-y-2">
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={uploadAll}
              className="rounded-md bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700"
            >
              Upload {pendingCount} pending
            </button>
          )}
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {photos.map((p) => (
              <li
                key={p.localId}
                className="rounded-md border border-line-soft bg-surface p-2 flex gap-2"
              >
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.preview}
                    alt={p.file.name}
                    className="w-20 h-20 object-cover rounded-md"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-ink-tertiary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono truncate flex-1">
                      {p.file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(p.localId)}
                      aria-label="Remove"
                      className="text-ink-tertiary hover:text-ink"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {p.status === "failed" ? (
                    <div className="text-[11px] text-danger">{p.error}</div>
                  ) : p.status === "uploaded" ? (
                    <div className="text-[11px] text-success">✓ Uploaded</div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Caption (optional)"
                        value={p.caption}
                        onChange={(e) =>
                          update(p.localId, { caption: e.target.value })
                        }
                        className="w-full text-[11px] rounded border border-line-soft bg-surface px-1 py-0.5 mb-1"
                      />
                      <select
                        value={p.zoneId}
                        onChange={(e) =>
                          update(p.localId, { zoneId: e.target.value })
                        }
                        className="w-full text-[11px] rounded border border-line-soft bg-surface px-1 py-0.5"
                      >
                        <option value="">No zone</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.zoneCode} · {z.zoneName}
                          </option>
                        ))}
                      </select>
                      {p.status === "uploading" && (
                        <div className="text-[11px] text-ink-tertiary mt-1">
                          Uploading…
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
