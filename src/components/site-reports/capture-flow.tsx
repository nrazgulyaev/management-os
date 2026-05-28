"use client";

/**
 * Phase 2.4 dev-01 — CaptureFlow.
 *
 * 3-step PWA flow for the site capture page (mobile only):
 *   1. camera  — getUserMedia + GPS lock
 *   2. caption — voice or text
 *   3. tag     — kind (milestone / incident / qa / progress) +
 *                optional milestone link
 *
 * Critical UX rule 1: this is the only ingestion path for site
 * frames. No desktop uploads.
 * Submit blocks while GPS coord is missing (unless overridden by
 * project setting).
 */

import * as React from "react";

export type CaptureKind = "milestone" | "incident" | "qa" | "progress";

export interface CaptureDraft {
  photoBlobUrl: string | null;
  gps: { lat: number; lng: number } | null;
  takenAt: string;
  caption: string;
  narration: string;
  kind: CaptureKind;
  milestoneId?: string | null;
}

export interface CaptureFlowProps {
  /** Pass false during testing to bypass the GPS lock. */
  requireGps?: boolean;
  /** Optional milestone picker options. */
  milestones?: { id: string; label: string }[];
  onSubmit?: (draft: CaptureDraft) => Promise<void> | void;
  onCancel?: () => void;
}

const STEPS = ["camera", "caption", "tag"] as const;
type Step = (typeof STEPS)[number];

const KINDS: { value: CaptureKind; label: string }[] = [
  { value: "milestone", label: "Milestone" },
  { value: "progress", label: "Progress" },
  { value: "incident", label: "Incident" },
  { value: "qa", label: "QA flag" },
];

function nowIso(): string {
  return new Date().toISOString();
}

export function CaptureFlow({ requireGps = true, milestones = [], onSubmit, onCancel }: CaptureFlowProps) {
  const [step, setStep] = React.useState<Step>("camera");
  const [draft, setDraft] = React.useState<CaptureDraft>({
    photoBlobUrl: null,
    gps: null,
    takenAt: nowIso(),
    caption: "",
    narration: "",
    kind: "progress",
    milestoneId: null,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function lockGps() {
    if (!navigator.geolocation) return setError("Geolocation not supported on this device.");
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft((d) => ({ ...d, gps: { lat: p.coords.latitude, lng: p.coords.longitude } })),
      (e) => setError(`GPS error: ${e.message}`),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function pickPhoto(file: File) {
    const url = URL.createObjectURL(file);
    setDraft((d) => ({ ...d, photoBlobUrl: url, takenAt: nowIso() }));
  }

  const canAdvanceCamera = draft.photoBlobUrl && (!requireGps || draft.gps);
  const canAdvanceCaption = draft.caption.trim().length > 0;
  const canSubmit = canAdvanceCamera && canAdvanceCaption && draft.kind;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit?.(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="capture-flow">
      <ol className="cap-steps mono">
        {STEPS.map((s, i) => (
          <li key={s} className={`${STEPS.indexOf(step) >= i ? "is-on" : ""}`}>
            {i + 1} · {s}
          </li>
        ))}
      </ol>

      {error && <div className="cap-error mono">{error}</div>}

      {step === "camera" && (
        <section className="cap-step">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
          />
          {draft.photoBlobUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.photoBlobUrl} alt="capture preview" className="cap-preview" />
          )}
          <div className="cap-gps">
            {draft.gps ? (
              <span className="mono">GPS locked · {draft.gps.lat.toFixed(5)}, {draft.gps.lng.toFixed(5)}</span>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={lockGps}>
                Lock GPS
              </button>
            )}
          </div>
          <footer className="cap-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canAdvanceCamera}
              onClick={() => setStep("caption")}
            >
              Next
            </button>
          </footer>
        </section>
      )}

      {step === "caption" && (
        <section className="cap-step">
          <div className="field">
            <label className="field-label">Caption</label>
            <input
              className="input"
              value={draft.caption}
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
              placeholder="One line — what is this?"
            />
          </div>
          <div className="field">
            <label className="field-label">Narration</label>
            <textarea
              className="textarea"
              rows={3}
              value={draft.narration}
              onChange={(e) => setDraft({ ...draft, narration: e.target.value })}
              placeholder="Optional — the full story"
            />
          </div>
          <footer className="cap-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep("camera")}>Back</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canAdvanceCaption}
              onClick={() => setStep("tag")}
            >
              Next
            </button>
          </footer>
        </section>
      )}

      {step === "tag" && (
        <section className="cap-step">
          <div className="field">
            <label className="field-label">Kind</label>
            <div className="cap-kinds">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  className={`cap-kind${draft.kind === k.value ? " is-on" : ""}`}
                  onClick={() => setDraft({ ...draft, kind: k.value })}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          {milestones.length > 0 && (
            <div className="field">
              <label className="field-label">Link to milestone (optional)</label>
              <select
                className="select"
                value={draft.milestoneId ?? ""}
                onChange={(e) => setDraft({ ...draft, milestoneId: e.target.value || null })}
              >
                <option value="">— none —</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
          <footer className="cap-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep("caption")}>Back</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!canSubmit || busy} onClick={submit}>
              {busy ? "Posting…" : "Post to log"}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
