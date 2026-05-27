"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

/**
 * Phase 2.3 owner-03 — PhotoGrid.
 *
 * 4-col aspect-ratio grid (collapses to 2-col ≤720px). Click a
 * photo → lightbox dialog. Esc closes.
 */

export interface PhotoGridItem {
  id: string;
  url: string;
  alt?: string;
  caption?: string;
}

export interface PhotoGridProps {
  photos: PhotoGridItem[];
  className?: string;
}

export function PhotoGrid({ photos, className }: PhotoGridProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <div className={`photo-grid${className ? ` ${className}` : ""}`}>
        {photos.map((p, i) => (
          <button
            type="button"
            key={p.id}
            className="pg-cell"
            style={{ backgroundImage: `url(${p.url})` }}
            onClick={() => setActiveIdx(i)}
            aria-label={p.alt ?? `Photo ${i + 1}`}
          />
        ))}
      </div>
      <Dialog.Root open={activeIdx !== null} onOpenChange={(o) => { if (!o) setActiveIdx(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="photo-lightbox-overlay" />
          <Dialog.Content className="photo-lightbox">
            {activeIdx !== null && (
              <>
                <Dialog.Title className="sr-only">{photos[activeIdx].alt ?? "Photo"}</Dialog.Title>
                <Dialog.Description className="sr-only">{photos[activeIdx].caption ?? ""}</Dialog.Description>
                <img src={photos[activeIdx].url} alt={photos[activeIdx].alt ?? ""} />
                {photos[activeIdx].caption && (
                  <div className="photo-lightbox-caption">{photos[activeIdx].caption}</div>
                )}
                <button
                  type="button"
                  className="photo-lightbox-close"
                  onClick={() => setActiveIdx(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
