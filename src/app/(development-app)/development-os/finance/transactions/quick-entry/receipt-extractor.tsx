"use client";

/**
 * Sprint 4.5 — Receipt extractor card.
 *
 * Operator snaps / uploads a receipt photo; client strips the data
 * URL prefix and forwards bytes to `extractReceipt()`; the model's
 * JSON gets surfaced as an editable confirmation panel + a single
 * "Add this transaction" button that wires the values into the
 * parent quick-entry form (parent supplies `onConfirm`).
 *
 * Three states: idle (mount the camera/file affordance), pending
 * (AI call in flight), result (extracted fields + confirm CTA).
 *
 * Per Sprint 4.5 scope: this widget is the *companion* to the
 * SpreadsheetView — it pre-fills a single new row that the operator
 * can edit before saving. The full "click camera icon ON a
 * spreadsheet cell" inline pattern needs SpreadsheetView API
 * changes (cell-level event hooks) and lands in a future polish
 * sprint.
 */

import * as React from "react";
import { useTransition } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { extractReceipt } from "@/lib/development/server/receipt-ocr-actions";
import type { ExtractedReceipt } from "@/lib/development/server/receipt-ocr-actions";
import { cn } from "@/lib/utils";

export interface ReceiptDraftRow {
  date: string;
  direction: "inflow" | "outflow";
  amountMajor: string;
  currency: string;
  vendor: string;
  description: string;
  /** Operator-facing category guess; not resolved to an ID. */
  categorySuggestion: string;
}

export function ReceiptExtractor({
  onConfirm,
}: {
  /**
   * Invoked when the operator clicks "Add to quick entry". The
   * parent should append the row to its grid state OR call the
   * bulk-record action directly. The widget then resets to idle.
   */
  onConfirm: (row: ReceiptDraftRow) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [extracted, setExtracted] = React.useState<ExtractedReceipt | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = React.useState<string | null>(null);

  function reset(): void {
    setExtracted(null);
    setError(null);
    setPhotoDataUrl(null);
  }

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setExtracted(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setPhotoDataUrl(dataUrl);
      const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (!match) {
        setError(
          "Unsupported image format. Use JPEG, PNG, WebP, or GIF.",
        );
        return;
      }
      const [, mediaType, base64] = match;
      startTransition(async () => {
        try {
          const out = await extractReceipt({
            imageBase64: base64,
            mediaType: mediaType as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
          });
          if (!out.ok) {
            // HF-7: friendlier surface for the well-known
            // `ai_not_configured` reason so the operator sees a
            // human-readable hint instead of the raw code.
            if (out.reason.startsWith("ai_not_configured")) {
              setError(
                "Receipt OCR needs an AI key. Ask the platform admin to set ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY) in the deployment environment.",
              );
            } else {
              setError(out.reason);
            }
            return;
          }
          setExtracted(out.extracted);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    };
    reader.readAsDataURL(file);
  }

  function handleConfirm(): void {
    if (!extracted) return;
    onConfirm({
      date: extracted.date ?? new Date().toISOString().slice(0, 10),
      direction: "outflow",
      amountMajor:
        extracted.amountMajor !== null
          ? String(extracted.amountMajor)
          : "",
      currency: extracted.currency ?? "USD",
      vendor: extracted.vendor ?? "",
      description:
        extracted.description ??
        (extracted.vendor ? `Receipt from ${extracted.vendor}` : "Receipt"),
      categorySuggestion: extracted.suggestedCategory ?? "",
    });
    reset();
  }

  return (
    <section
      className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-4"
      data-stage10="receipt-extractor"
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-ink inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.75} />
            Snap a receipt
          </h3>
          <p className="text-xs text-ink-tertiary leading-relaxed mt-1">
            Camera (mobile) or file upload. AI extracts date · amount ·
            vendor · category suggestion; you confirm before it lands
            in the grid.
          </p>
        </div>
        {extracted && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-ink-tertiary hover:text-ink inline-flex items-center gap-1"
            aria-label="Discard extraction"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            Discard
          </button>
        )}
      </header>

      {!extracted && (
        <label
          className={cn(
            "rounded-3xl border border-dashed border-line-soft bg-canvas px-6 py-8 flex flex-col items-center gap-2 text-center cursor-pointer hover:bg-muted/40 transition-colors",
            pending && "opacity-60 cursor-wait",
          )}
        >
          <Camera className="w-7 h-7 text-ink-tertiary" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ink">
            Tap to snap or upload a receipt
          </span>
          <span className="text-xs text-ink-tertiary">
            JPEG · PNG · WebP · GIF
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="sr-only"
          />
        </label>
      )}

      {pending && (
        <p className="inline-flex items-center gap-2 text-sm text-ink-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reading the receipt…
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {extracted && (
        <div className="flex flex-col md:flex-row gap-4">
          {photoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoDataUrl}
              alt="Receipt preview"
              className="w-full md:w-48 h-48 object-cover rounded-3xl border border-line-soft"
            />
          )}
          <div className="flex-1 flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {(
                [
                  ["Date", extracted.date],
                  ["Amount", extracted.amountMajor !== null ? String(extracted.amountMajor) : null],
                  ["Currency", extracted.currency],
                  ["Vendor", extracted.vendor],
                  ["Category", extracted.suggestedCategory],
                  ["Confidence", extracted.confidence],
                ] as const
              ).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-ink-tertiary">{k}</dt>
                  <dd className="text-ink font-medium tabular-nums">
                    {v ?? <span className="text-ink-tertiary">—</span>}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
            {extracted.description && (
              <p className="text-xs text-ink-secondary leading-relaxed">
                <span className="text-ink-tertiary">Description:</span>{" "}
                {extracted.description}
              </p>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 h-10 text-sm font-medium text-ink-inverse hover:bg-ink/90 self-start"
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              Add to quick entry
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
