"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.3 owner-02 — DisputeModal.
 *
 * Form-md. Reason radio (4 options) + free-text. On submit, the
 * cross-cabinet event opens a Mgmt Inbox thread + flags the
 * statement in Mgmt Finance.
 */

export type DisputeReasonKind = "line_wrong" | "missing_revenue" | "fees_too_high" | "other";

export interface DisputeValues {
  statementId: string;
  reasonKind: DisputeReasonKind;
  detail: string;
}

export interface DisputeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementId: string;
  statementCode: string;
  onSubmit?: (values: DisputeValues) => Promise<void> | void;
}

const REASONS: { value: DisputeReasonKind; label: string; hint: string }[] = [
  { value: "line_wrong", label: "A specific line looks wrong", hint: "Wrong amount, wrong category, double-counted, etc." },
  { value: "missing_revenue", label: "Missing revenue", hint: "Booking I expect to see isn't reflected." },
  { value: "fees_too_high", label: "Fees / costs look too high", hint: "Channel or shared expense feels off vs prior periods." },
  { value: "other", label: "Other", hint: "Tell us what's on your mind." },
];

export function DisputeModal({ open, onOpenChange, statementId, statementCode, onSubmit }: DisputeModalProps) {
  const [reason, setReason] = React.useState<DisputeReasonKind>("line_wrong");
  const [detail, setDetail] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setReason("line_wrong");
      setDetail("");
    }
  }, [open]);

  async function submit() {
    if (!detail.trim()) return;
    await onSubmit?.({ statementId, reasonKind: reason, detail: detail.trim() });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={detail.length > 0} ariaLabel="Open dispute">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
        glyphTone="warn"
        title={`Open a dispute on ${statementCode}`}
        description="We'll open a thread with our finance team. Resolution timeline is usually 3-5 business days."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Reason</label>
          <div className="dispute-reasons">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`dispute-reason${reason === r.value ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="dispute-reason"
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <div>
                  <div className="dr-title">{r.label}</div>
                  <div className="dr-hint">{r.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Detail</label>
          <textarea
            className="textarea"
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Tell us what's off — line code, expected vs actual amount, etc."
          />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to open">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!detail.trim()}>
          Open dispute
        </button>
      </ModalFooter>
    </Modal>
  );
}
