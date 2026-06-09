"use client";

/**
 * W4 — read-only mount of the DrawingViewer takeoff primitive on the
 * drawing detail page. The page previously showed only documentId.slice(0,8)
 * and never rendered the actual drawing.
 *
 * The server resolves the active (IFC) / latest revision's document into a
 * signed image URL (see _resolve-revision-image.ts) and passes it here.
 * DrawingViewer is mounted `readOnly` so the toolbar is hidden and clicks do
 * nothing — pan + the existing measurement overlay only, no persistence.
 *
 * Strokes are intentionally empty: this is a pure preview, not a takeoff
 * session (that lives in /boq/takeoff). The DrawingViewer footer still shows
 * the "scale not set" hint, which is correct for a read-only preview.
 */

import { DrawingViewer } from "@/components/ui/primitives";

export function RevisionImageViewer({
  imageUrl,
  imageAlt,
}: {
  imageUrl: string;
  imageAlt: string;
}) {
  return (
    <DrawingViewer
      imageUrl={imageUrl}
      imageAlt={imageAlt}
      strokes={[]}
      readOnly
    />
  );
}
