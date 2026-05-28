"use client";

/**
 * Phase 2.4 mgmt-03 — IdOcrPreview.
 *
 * Renders OCR result (name, nationality, expiry, number) with
 * inline manual override. Used inside CheckinFlow step 1 — staff
 * must verify before advancing.
 *
 * Each override is audit-logged via onOverride which the parent
 * persists.
 */

import * as React from "react";

export interface OcrPayload {
  name?: string;
  nationality?: string;
  documentNumber?: string;
  expiresAt?: string;
  type?: "passport" | "kitas" | "ktp";
  confidence?: number;
}

export interface IdOcrPreviewProps {
  /** Null while OCR is pending. */
  ocr: OcrPayload | null;
  scanUrl?: string;
  onChange?: (next: OcrPayload) => void;
  /** Called when a field is manually corrected — for audit trail. */
  onOverride?: (field: keyof OcrPayload, prev: string | undefined, next: string) => void;
  className?: string;
}

const FIELDS: { key: keyof OcrPayload; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "nationality", label: "Nationality" },
  { key: "documentNumber", label: "Document #" },
  { key: "expiresAt", label: "Expires" },
];

export function IdOcrPreview({ ocr, scanUrl, onChange, onOverride, className }: IdOcrPreviewProps) {
  const [draft, setDraft] = React.useState<OcrPayload>(ocr ?? {});
  React.useEffect(() => setDraft(ocr ?? {}), [ocr]);

  function set(key: keyof OcrPayload, value: string) {
    const prev = (draft[key] ?? "") as string;
    if (prev === value) return;
    const next = { ...draft, [key]: value };
    setDraft(next);
    onChange?.(next);
    if (ocr && ocr[key] !== value) onOverride?.(key, ocr[key] as string | undefined, value);
  }

  return (
    <div className={`id-ocr-preview${className ? ` ${className}` : ""}`}>
      <div className="ocr-scan">
        {scanUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scanUrl} alt="ID scan" />
        ) : (
          <div className="ocr-scan-empty mono">No scan</div>
        )}
      </div>
      <div className="ocr-fields">
        <header className="ocr-head">
          <span className="ocr-conf mono">
            {ocr?.confidence != null ? `OCR ${Math.round((ocr.confidence ?? 0) * 100)}%` : "Pending OCR"}
          </span>
          <span className="ocr-kind mono">{draft.type ?? "passport"}</span>
        </header>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label className="field-label">{f.label}</label>
            <input
              className="input"
              value={(draft[f.key] as string) ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
