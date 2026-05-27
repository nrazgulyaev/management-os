"use client";

/**
 * Phase 2.2 dev-03 — ImportBoqModal.
 *
 * Form-lg 3-step wizard:
 *   1. Upload — CSV / XLSX
 *   2. Map    — column → field auto-detect + manual override
 *   3. Reconcile — diff-view (added/removed/changed) before commit
 *
 * Real CSV parsing + the upload server action land in 2.2 data. The
 * skeleton wires the step UI + the diff-view contract.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalSteps } from "@/components/ui/modal";

export interface ImportBoqModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectLabel: string;
  onSubmit?: () => Promise<void> | void;
}

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map" },
  { id: "reconcile", label: "Reconcile" },
];

export function ImportBoqModal({ open, onOpenChange, projectLabel, onSubmit }: ImportBoqModalProps) {
  const [step, setStep] = React.useState(0);
  const [filename, setFilename] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setStep(0);
      setFilename(null);
    }
  }, [open]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" dirty={filename !== null} ariaLabel="Import BOQ">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        }
        glyphTone="accent"
        title="Import BOQ"
        description={`${projectLabel} · step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}
        onClose={() => onOpenChange(false)}
      />
      <ModalSteps
        steps={STEPS.map((s, i) => ({
          id: s.id,
          label: s.label,
          state: i < step ? "done" : i === step ? "on" : "todo",
        }))}
      />
      <ModalBody>
        {step === 0 && (
          <div className="field">
            <label className="field-label">CSV or XLSX file</label>
            <input
              className="input"
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setFilename(e.target.files?.[0]?.name ?? null)}
            />
            <div className="field-help">First column is the BOQ code (e.g. <code>WP-04.18.a</code>).</div>
          </div>
        )}
        {step === 1 && (
          <div className="field">
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
              Auto-detected mapping. Override below if a column lands on the wrong field.
            </p>
            <table className="data">
              <thead><tr><th>BOQ field</th><th>CSV column</th></tr></thead>
              <tbody>
                <tr><td>Code</td><td className="mono">col A</td></tr>
                <tr><td>Description</td><td className="mono">col B</td></tr>
                <tr><td>WP code</td><td className="mono">col C</td></tr>
                <tr><td>Unit</td><td className="mono">col D</td></tr>
                <tr><td>Planned qty</td><td className="mono">col E</td></tr>
                <tr><td>Planned rate</td><td className="mono">col F</td></tr>
              </tbody>
            </table>
          </div>
        )}
        {step === 2 && (
          <div className="boq-diff">
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
              Diff against the current revision. Confirm to publish a new revision.
            </p>
            <ul>
              <li className="diff added">
                <span className="diff-tag mono">+</span>
                <span className="mono">WP-04.18.c</span> Marble Hindari 80×80 · 220 m² · 58.10
              </li>
              <li className="diff removed">
                <span className="diff-tag mono">−</span>
                <span className="mono">WP-04.17.b</span> Old terrazzo · 110 m²
              </li>
              <li className="diff changed">
                <span className="diff-tag mono">~</span>
                <span className="mono">WP-04.18.b</span> Marble Hindari 60×60 · qty 340 → 420
              </li>
            </ul>
          </div>
        )}
      </ModalBody>
      <ModalFooter help={step === STEPS.length - 1 ? "⌘ + Enter to publish" : undefined}>
        {step > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !filename}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await onSubmit?.();
              onOpenChange(false);
            }}
          >
            Publish revision
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
