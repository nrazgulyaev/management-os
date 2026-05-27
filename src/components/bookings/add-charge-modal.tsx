"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-01 — AddChargeModal.
 *
 * Form-md. Ad-hoc charge on a booking (cleaning, late check-out,
 * pet fee, damage, F&B, transfers). Currency inherits from booking.
 */

export interface AddChargeValues {
  bookingId: string;
  kind: "cleaning" | "late-checkout" | "pet" | "damage" | "fnb" | "transfer" | "other";
  amount: number;
  notes: string;
}

export interface AddChargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingCode: string;
  bookingId: string;
  onSubmit?: (values: AddChargeValues) => Promise<void> | void;
}

const KIND_OPTIONS: { value: AddChargeValues["kind"]; label: string }[] = [
  { value: "cleaning", label: "Cleaning surcharge" },
  { value: "late-checkout", label: "Late check-out" },
  { value: "pet", label: "Pet fee" },
  { value: "damage", label: "Damage / replacement" },
  { value: "fnb", label: "F&B" },
  { value: "transfer", label: "Airport transfer" },
  { value: "other", label: "Other" },
];

export function AddChargeModal({ open, onOpenChange, bookingCode, bookingId, onSubmit }: AddChargeModalProps) {
  const [kind, setKind] = React.useState<AddChargeValues["kind"]>("other");
  const [amount, setAmount] = React.useState(0);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setKind("other");
      setAmount(0);
      setNotes("");
    }
  }, [open]);

  const dirty = amount > 0;

  async function submit() {
    if (!dirty) return;
    await onSubmit?.({ bookingId, kind, amount, notes });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Add charge">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
        glyphTone="accent"
        title="Add charge"
        description={`Booking ${bookingCode} · ad-hoc charge`}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Charge kind</label>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as AddChargeValues["kind"])}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Amount</label>
          <input className="input mono" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <div className="field">
          <label className="field-label">Notes (visible to guest)</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to save">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!dirty}>
          Add charge
        </button>
      </ModalFooter>
    </Modal>
  );
}
