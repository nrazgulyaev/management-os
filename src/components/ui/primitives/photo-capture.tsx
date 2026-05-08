/**
 * Stage 10.B — PhotoCapture primitive.
 *
 * Mobile photo button + thumbnail strip. Uses the native <input type=
 * "file" accept="image/*" capture="environment"> pattern so it opens
 * the OS camera on iOS / Android (Stage 10 anti-WhatsApp pattern). On
 * desktop it falls back to file picker.
 *
 * Photo persistence (upload) is delegated via `onPhotoCapture(file,
 * dataUrl)`. Caller owns the upload pipeline (likely Supabase storage).
 *
 * Used by: 10.D Cleaner checklist photo gate, 10.F PM site report,
 * 10.H Procurement delivery acceptance.
 *
 * Client component (file-input + previews).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Camera, X } from "lucide-react";

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
  file?: File;
  uploadedUrl?: string | null;
  caption?: string;
}

export interface PhotoCaptureProps {
  photos: CapturedPhoto[];
  onPhotoCapture: (photo: CapturedPhoto) => void;
  onPhotoRemove?: (id: string) => void;
  /** Required count — UI shows progress like "2 / 3 photos". */
  required?: number;
  label?: string;
  /** Disable when at hard cap. */
  max?: number;
  className?: string;
}

export function PhotoCapture({
  photos,
  onPhotoCapture,
  onPhotoRemove,
  required,
  max,
  label = "Add photo",
  className,
}: PhotoCaptureProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const atCap = max != null && photos.length >= max;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (max != null && photos.length >= max) break;
        const dataUrl = await readDataUrl(file);
        onPhotoCapture({
          id: crypto.randomUUID(),
          dataUrl,
          file,
          uploadedUrl: null,
        });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={atCap || busy}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-line-soft bg-surface text-ink text-sm font-medium",
            "active:translate-y-[1px] active:bg-muted disabled:opacity-50 disabled:pointer-events-none",
          )}
        >
          <Camera className="w-4 h-4" />
          {label}
          {required != null && (
            <span className="text-xs text-ink-tertiary tabular-nums">
              ({photos.length} / {required})
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple={max == null || max > 1}
          className="sr-only"
          onChange={(e) => onFiles(e.target.files)}
        />
        {required != null && photos.length < required && (
          <span className="text-xs text-warning">
            {required - photos.length} more required
          </span>
        )}
      </div>
      {photos.length > 0 && (
        <ul
          className="flex gap-2 flex-wrap"
          aria-label="Captured photos"
        >
          {photos.map((p) => (
            <li
              key={p.id}
              className="relative w-20 h-20 rounded-sm overflow-hidden border border-line-soft bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.dataUrl}
                alt={p.caption ?? "Captured photo"}
                className="w-full h-full object-cover"
              />
              {p.uploadedUrl === null && (
                <span className="absolute bottom-0 inset-x-0 text-[10px] bg-warning/80 text-white text-center">
                  uploading…
                </span>
              )}
              {onPhotoRemove && (
                <button
                  type="button"
                  onClick={() => onPhotoRemove(p.id)}
                  aria-label="Remove photo"
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-ink/70 text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
