"use client";

/**
 * Safety incident evidence upload zone. Cloned from the QA/QC
 * photo-upload-zone — supports drag/drop + multi-file select + camera
 * capture (mobile). Each file is sent as base64 to the
 * `uploadSafetyEvidence` server action via the
 * `/api/development/safety/evidence/upload` Route Handler (we don't post
 * FormData so the action keeps its zod schema).
 *
 * The QA/QC `photoRole` select is replaced with an evidence-`kind`
 * select (photo → appended to photo_document_ids[]; report → set as the
 * single report_document_id). Reports also accept PDF.
 */

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Camera, X, AlertCircle } from "lucide-react";

type EvidenceKind = "photo" | "report";

const KINDS: { value: EvidenceKind; label: string }[] = [
  { value: "photo", label: "Incident photo" },
  { value: "report", label: "Investigation report" },
];

interface PendingFile {
  localId: string;
  file: File;
  preview: string;
  caption: string;
  kind: EvidenceKind;
  status: "pending" | "uploading" | "uploaded" | "failed";
  error?: string;
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const ALLOWED_TYPES = [...PHOTO_TYPES, "application/pdf"];
const MAX_BYTES = 25 * 1024 * 1024;

export function SafetyEvidenceUploadZone({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    const next: PendingFile[] = [];
    for (const f of Array.from(list)) {
      // Default kind: PDFs are reports, images are photos.
      const defaultKind: EvidenceKind =
        f.type === "application/pdf" ? "report" : "photo";
      if (!ALLOWED_TYPES.includes(f.type)) {
        next.push({
          localId: crypto.randomUUID(),
          file: f,
          preview: "",
          caption: "",
          kind: defaultKind,
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
          kind: defaultKind,
          status: "failed",
          error: `File ${(f.size / 1024 / 1024).toFixed(1)}MB exceeds 25MB`,
        });
        continue;
      }
      next.push({
        localId: crypto.randomUUID(),
        file: f,
        preview: PHOTO_TYPES.includes(f.type) ? URL.createObjectURL(f) : "",
        caption: "",
        kind: defaultKind,
        status: "pending",
      });
    }
    setFiles((prev) => [...prev, ...next]);
  }

  async function uploadOne(localId: string) {
    setFiles((prev) =>
      prev.map((p) =>
        p.localId === localId ? { ...p, status: "uploading" } : p,
      ),
    );
    const item = files.find((p) => p.localId === localId);
    if (!item) return;
    try {
      const buf = await item.file.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      const res = await fetch("/api/development/safety/evidence/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incidentId,
          kind: item.kind,
          caption: item.caption || null,
          fileName: item.file.name,
          mimeType: item.file.type,
          sizeBytes: item.file.size,
          fileBase64: base64,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setFiles((prev) =>
        prev.map((p) =>
          p.localId === localId ? { ...p, status: "uploaded" } : p,
        ),
      );
      // Refresh the server detail so the new evidence appears in the gallery.
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFiles((prev) =>
        prev.map((p) =>
          p.localId === localId ? { ...p, status: "failed", error: msg } : p,
        ),
      );
    }
  }

  function uploadAll() {
    for (const p of files.filter((p) => p.status === "pending")) {
      void uploadOne(p.localId);
    }
  }

  function remove(localId: string) {
    setFiles((prev) => prev.filter((p) => p.localId !== localId));
  }

  function update(localId: string, patch: Partial<PendingFile>) {
    setFiles((prev) =>
      prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)),
    );
  }

  const pendingCount = files.filter((p) => p.status === "pending").length;

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
          Drag photos or a report here, or click to select
        </p>
        <p className="text-xs text-ink-tertiary mb-3">
          JPG/PNG/WEBP/HEIC or PDF, max 25 MB each
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

      {files.length > 0 && (
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
            {files.map((p) => (
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
                        value={p.kind}
                        onChange={(e) =>
                          update(p.localId, {
                            kind: e.target.value as EvidenceKind,
                          })
                        }
                        className="w-full text-[11px] rounded border border-line-soft bg-surface px-1 py-0.5"
                      >
                        {KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
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
