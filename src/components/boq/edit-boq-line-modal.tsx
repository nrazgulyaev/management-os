"use client";

/**
 * Phase 2.2 dev-03 — EditBoqLineModal.
 *
 * Form-md. Update planned qty + rate on a BOQ line. The mutation
 * is audited (`boq_revisions` snapshot) so the variance queue
 * shows the right baseline after the edit.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export interface EditBoqLineValues {
  qtyPlanned: number;
  ratePlanned: number;
  changeReason: string;
}

export interface EditBoqLineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: {
    id: string;
    code: string;
    description: string;
    unit: string;
    qtyPlanned: number;
    ratePlanned: number;
  } | null;
  onSubmit?: (values: EditBoqLineValues) => Promise<void> | void;
}

export function EditBoqLineModal({ open, onOpenChange, line, onSubmit }: EditBoqLineModalProps) {
  const [qty, setQty] = React.useState(0);
  const [rate, setRate] = React.useState(0);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open && line) {
      setQty(line.qtyPlanned);
      setRate(line.ratePlanned);
      setReason("");
    }
  }, [open, line]);

  const dirty = line ? qty !== line.qtyPlanned || rate !== line.ratePlanned : false;

  async function submit() {
    if (!dirty || !reason.trim()) return;
    await onSubmit?.({ qtyPlanned: qty, ratePlanned: rate, changeReason: reason.trim() });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Edit BOQ line">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        }
        glyphTone="accent"
        title="Edit BOQ line"
        description={line ? `${line.code} · ${line.description}` : "Pick a line to edit"}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Planned qty ({line?.unit ?? "—"})</label>
            <input className="input mono" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="field-label">Planned rate</label>
            <input className="input mono" type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Change reason (audited)</label>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is the plan changing?"
          />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to save">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={!dirty || !reason.trim()}
        >
          Save line (new revision)
        </button>
      </ModalFooter>
    </Modal>
  );
}
