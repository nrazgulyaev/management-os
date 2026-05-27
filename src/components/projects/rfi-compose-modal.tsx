"use client";

/**
 * Phase 2.2 dev-01 — RFIComposeModal.
 *
 * Form-md. Question + optional discipline override. Submit fires
 * the `rfi-router` agent (stub today) which picks the right
 * discipline contact + opens the RFI.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export type RfiDiscipline = "architecture" | "structural" | "mep" | "interior" | "other";

export interface RfiComposeValues {
  question: string;
  disciplineHint: RfiDiscipline | "auto";
  /** Optional code prefix (e.g. "RFI-EV08"). */
  refPrefix?: string;
  attachLinks?: string;
}

export interface RfiComposeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectCode: string;
  onSubmit?: (values: RfiComposeValues) => Promise<{ ref: string; routedTo: string } | void> | void;
}

const INITIAL: RfiComposeValues = {
  question: "",
  disciplineHint: "auto",
  attachLinks: "",
};

const DISCIPLINE_OPTIONS: { value: RfiComposeValues["disciplineHint"]; label: string }[] = [
  { value: "auto", label: "Auto-route" },
  { value: "architecture", label: "Architecture" },
  { value: "structural", label: "Structural" },
  { value: "mep", label: "MEP" },
  { value: "interior", label: "Interior" },
  { value: "other", label: "Other" },
];

export function RfiComposeModal({
  open,
  onOpenChange,
  projectCode,
  onSubmit,
}: RfiComposeModalProps) {
  const [values, setValues] = React.useState<RfiComposeValues>(INITIAL);
  const [routed, setRouted] = React.useState<{ ref: string; routedTo: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setValues(INITIAL);
      setRouted(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    if (!values.question.trim()) return;
    setBusy(true);
    try {
      const result = await onSubmit?.(values);
      if (result) setRouted(result);
      else
        setRouted({
          ref: `RFI-${projectCode}-${String(Date.now()).slice(-4)}`,
          routedTo: "Auto-routed",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      dirty={values.question.length > 0 && !routed}
      ariaLabel="Compose RFI"
    >
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
        glyphTone="accent"
        title={routed ? "RFI opened" : "Compose RFI"}
        description={
          routed
            ? `Reference ${routed.ref} · routed to ${routed.routedTo}. The team is notified.`
            : `Project ${projectCode}. The rfi-router agent picks a discipline unless you override below.`
        }
        onClose={() => onOpenChange(false)}
      />
      {!routed ? (
        <ModalBody>
          <div className="field">
            <label className="field-label">Question</label>
            <textarea
              className="textarea"
              value={values.question}
              onChange={(e) => setValues((p) => ({ ...p, question: e.target.value }))}
              placeholder="Describe the technical question — the agent reads this to pick a discipline."
              rows={5}
            />
          </div>
          <div className="field">
            <label className="field-label">Discipline hint</label>
            <select
              className="select"
              value={values.disciplineHint}
              onChange={(e) =>
                setValues((p) => ({
                  ...p,
                  disciplineHint: e.target.value as RfiComposeValues["disciplineHint"],
                }))
              }
            >
              {DISCIPLINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Attach links (one per line)</label>
            <textarea
              className="textarea"
              value={values.attachLinks}
              onChange={(e) => setValues((p) => ({ ...p, attachLinks: e.target.value }))}
              rows={2}
              placeholder="https://drive.google.com/…"
            />
          </div>
        </ModalBody>
      ) : (
        <ModalBody>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
            The RFI will appear in the project Overview tab and the discipline
            contact’s inbox. Reply tracking lands in 2.2 data-wiring.
          </p>
        </ModalBody>
      )}
      <ModalFooter help={routed ? undefined : "⌘ + Enter to open RFI"}>
        {routed ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenChange(false)}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={busy || values.question.trim().length === 0}
            >
              {busy ? "Routing…" : "Open RFI"}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
