/**
 * V9L — client-side image resize / re-encode for the concierge upload
 * flow. Runs in the browser only; the server still re-validates size
 * + MIME after the upload.
 *
 * Behaviour:
 *   • Refuses non-image MIMEs (PDFs, etc.) — returns the original.
 *   • For images already ≤ 8 MB, returns the original.
 *   • For oversize images, draws into an OffscreenCanvas (or a normal
 *     canvas fallback), shrinks longest-edge to a target dimension,
 *     and re-encodes to JPEG/PNG/WEBP at decreasing quality until the
 *     output drops below 8 MB or we run out of options.
 *   • Returns `{ ok: false, reason }` when no resize succeeds — the
 *     UI surfaces a friendly "file too large" message and asks the
 *     guest to pick a smaller image.
 *
 * No external dependency. Stays browser-bundle-safe — no `node:`
 * imports, no `server-only`. Tested via the static-source / API-shape
 * tests in v9k+v9l; the canvas pipeline itself isn't exercised in
 * the test runner (no DOM).
 */

const TARGET_MAX_BYTES = 8 * 1024 * 1024;
const RESIZABLE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const QUALITY_LADDER = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5];

export type ResizeOutcome =
  | { ok: true; file: File; resized: boolean }
  | {
      ok: false;
      reason:
        | "not_resizable_pdf"
        | "not_an_image"
        | "still_too_large"
        | "browser_unsupported"
        | "decode_failed";
    };

export async function maybeResizeAttachment(
  file: File,
): Promise<ResizeOutcome> {
  if (file.type === "application/pdf") {
    if (file.size <= TARGET_MAX_BYTES) {
      return { ok: true, file, resized: false };
    }
    return { ok: false, reason: "not_resizable_pdf" };
  }
  if (!RESIZABLE_MIMES.has(file.type)) {
    return { ok: false, reason: "not_an_image" };
  }
  if (file.size <= TARGET_MAX_BYTES) {
    return { ok: true, file, resized: false };
  }
  if (
    typeof document === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return { ok: false, reason: "browser_unsupported" };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "decode_failed" };
  }

  // Walk the longest-edge ladder + a quality ladder. Stop the moment
  // we land under 8 MB.
  const longestEdgeLadder = [2400, 2000, 1600, 1280, 1024];
  for (const edge of longestEdgeLadder) {
    const { canvas, width, height } = drawScaled(bitmap, edge);
    if (canvas === null) continue;
    for (const quality of QUALITY_LADDER) {
      const blob = await canvasToBlob(canvas, file.type, quality);
      if (!blob) continue;
      if (blob.size <= TARGET_MAX_BYTES) {
        const renamed = renameForResize(file.name, file.type);
        const out = new File([blob], renamed, {
          type: file.type,
          lastModified: Date.now(),
        });
        bitmap.close?.();
        // Width / height are exposed on the file via a one-off
        // attached property the uploader can read for diagnostics.
        Object.defineProperty(out, "_resizedTo", {
          value: { width, height, quality },
          enumerable: false,
        });
        return { ok: true, file: out, resized: true };
      }
    }
  }
  bitmap.close?.();
  return { ok: false, reason: "still_too_large" };
}

function drawScaled(
  bitmap: ImageBitmap,
  longestEdge: number,
): { canvas: HTMLCanvasElement | null; width: number; height: number } {
  const { width: bw, height: bh } = bitmap;
  const scale = Math.min(longestEdge / Math.max(bw, bh), 1);
  const width = Math.max(1, Math.round(bw * scale));
  const height = Math.max(1, Math.round(bh * scale));
  let canvas: HTMLCanvasElement | null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { canvas: null, width, height };
    ctx.drawImage(bitmap, 0, 0, width, height);
  } catch {
    return { canvas: null, width, height };
  }
  return { canvas, width, height };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mime,
      mime === "image/png" ? undefined : quality,
    );
  });
}

function renameForResize(name: string, mime: string): string {
  const ext =
    mime === "image/jpeg"
      ? ".jpg"
      : mime === "image/png"
        ? ".png"
        : mime === "image/webp"
          ? ".webp"
          : "";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}-resized${ext}`;
}
