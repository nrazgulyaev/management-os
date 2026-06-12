"use client";

/**
 * Villa photo uploader for the management villa edit page. File input + preview
 * grid + delete. Calls the tenancy-scoped upload/delete server actions. The
 * first photo becomes the owner-facing hero. Uses <img> (not next/image) to
 * match the existing owner-portal photo rendering.
 */

import { useState, useTransition, useRef } from "react";
import {
  uploadVillaPhotoAction,
  deleteVillaPhotoAction,
} from "@/features/villas/photo-actions";

interface Photo {
  id: string;
  url: string;
  caption: string | null;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export function VillaPhotoUploader({
  villaId,
  photos: initial,
}: {
  villaId: string;
  photos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError("JPEG, PNG, or WEBP only.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be ≤ 10MB.");
      return;
    }
    const fd = new FormData();
    fd.set("villaId", villaId);
    fd.set("file", file);
    fd.set("kind", photos.length === 0 ? "hero" : "gallery");
    startTransition(async () => {
      const res = await uploadVillaPhotoAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Upload failed");
        return;
      }
      if (res.photoId && res.url) {
        setPhotos((p) => [...p, { id: res.photoId!, url: res.url!, caption: null }]);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("photoId", id);
      const res = await deleteVillaPhotoAction(fd);
      if (res.ok) setPhotos((p) => p.filter((x) => x.id !== id));
      else setError(res.error ?? "Delete failed");
    });
  }

  return (
    <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-label">Photos</span>
        <span className="text-xs text-ink-secondary">
          {photos.length} photo{photos.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
          {error}
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className="relative group rounded-md overflow-hidden border border-line-soft aspect-[4/3] bg-muted/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Villa photo"}
                className="w-full h-full object-cover"
              />
              {i === 0 && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5">
                  Hero
                </span>
              )}
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                disabled={pending}
                className="absolute top-1.5 right-1.5 rounded bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:text-white"
        />
        {pending && <p className="mt-2 text-xs text-ink-secondary">Uploading…</p>}
        <p className="mt-1.5 text-xs text-ink-secondary">
          First photo becomes the hero shown to owners. JPEG/PNG/WEBP, ≤ 10MB.
        </p>
      </div>
    </div>
  );
}
