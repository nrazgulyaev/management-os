"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-03 — DismissInsightModal.
 *
 * Form-sm. Reason picker + free-text. The dismissal trains the
 * owner-intelligence model — picking "False positive" weights
 * the signal down for similar future cases.
 */

export type DismissReason =
  | "false_positive"
  | "already_handled"
  | "owner_aware"
  | "duplicate"
  | "other";

export interface DismissInsightValues {
  insightId: string;
  reason: DismissReason;
  freeText: string;
}

export interface DismissInsightModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insight: { id: string; kind: string } | null;
  onConfirm?: (values: DismissInsightValues) => Promise<void> | void;
}

const REASON_OPTIONS: { value: DismissReason; label: string }[] = [
  { value: "false_positive", label: "False positive — signal misread the data" },
  { value: "already_handled", label: "Already handled — emailed/called the owner" },
  { value: "owner_aware", label: "Owner is aware and OK with it" },
  { value: "duplicate", label: "Duplicate of an existing insight" },
  { value: "other", label: "Other" },
];

export function DismissInsightModal({ open, onOpenChange, insight, onConfirm }: DismissInsightModalProps) {
  const [reason, setReason] = React.useState<DismissReason>("already_handled");
  const [freeText, setFreeText] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setReason("already_handled");
      setFreeText("");
    }
  }, [open]);

  async function submit() {
    if (!insight) return;
    await onConfirm?.({ insightId: insight.id, reason, freeText: freeText.trim() });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={freeText.length > 0} ariaLabel="Dismiss insight">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        }
        glyphTone="warn"
        title="Dismiss insight"
        description={insight ? `Kind: ${insight.kind.replace(/_/g, " ")}` : "Pick an insight"}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Reason</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {REASON_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 6px", borderRadius: 4 }}>
                <input
                  type="radio"
                  name="dismiss-reason"
                  checked={reason === opt.value}
                  onChange={() => setReason(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Notes (optional)</label>
          <textarea className="textarea" value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={2} placeholder="Anything else the model should know?" />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
          Dismiss
        </button>
      </ModalFooter>
    </Modal>
  );
}
