"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-03 — EditCommissionModal.
 *
 * Form-md. Director-only — the page hides the trigger for other
 * roles. Captures the new pct + a mandatory change reason that
 * lands in the audit log.
 */

export interface EditCommissionValues {
  ownerId: string;
  commissionPct: number;
  effectiveDate: string;
  reason: string;
}

export interface EditCommissionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: { id: string; name: string; commissionPct: number } | null;
  onSubmit?: (values: EditCommissionValues) => Promise<void> | void;
}

export function EditCommissionModal({ open, onOpenChange, owner, onSubmit }: EditCommissionModalProps) {
  const [pct, setPct] = React.useState(0);
  const [date, setDate] = React.useState("");
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open && owner) {
      setPct(owner.commissionPct);
      setDate(new Date().toISOString().slice(0, 10));
      setReason("");
    }
  }, [open, owner]);

  const dirty = owner ? pct !== owner.commissionPct : false;

  async function submit() {
    if (!owner || !dirty || !reason.trim()) return;
    await onSubmit?.({
      ownerId: owner.id,
      commissionPct: pct,
      effectiveDate: date,
      reason: reason.trim(),
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Edit commission">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
        glyphTone="accent"
        title="Edit commission"
        description={owner ? `${owner.name} · current ${owner.commissionPct}%` : ""}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field-row">
          <div className="field">
            <label className="field-label">New commission %</label>
            <input className="input mono" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="field-label">Effective date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Reason (audited)</label>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is the commission changing?" />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to save">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!dirty || !reason.trim()}>
          Save new commission
        </button>
      </ModalFooter>
    </Modal>
  );
}
