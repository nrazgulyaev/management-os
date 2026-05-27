"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import type { TicketPriority } from "@/features/maintenance/sla";

export interface NewTicketValues {
  villaId: string;
  priority: TicketPriority;
  title: string;
  description: string;
  photoName: string | null;
}

export interface NewTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villas: { id: string; label: string }[];
  onSubmit?: (values: NewTicketValues) => Promise<void> | void;
}

const INITIAL: NewTicketValues = {
  villaId: "",
  priority: "P2",
  title: "",
  description: "",
  photoName: null,
};

export function NewTicketModal({ open, onOpenChange, villas, onSubmit }: NewTicketModalProps) {
  const [values, setValues] = React.useState<NewTicketValues>(INITIAL);

  React.useEffect(() => {
    if (!open) setValues(INITIAL);
  }, [open]);

  const dirty = values.title.length > 0 || values.description.length > 0;

  async function submit() {
    if (!values.title || !values.villaId) return;
    await onSubmit?.(values);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="New maintenance ticket">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 5l5 5-9 9-5-5 9-9zM12 7l5 5" />
          </svg>
        }
        glyphTone="accent"
        title="New ticket"
        description="Open a maintenance ticket. The arrival-prep + maintenance-triage agents react automatically."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Villa</label>
            <select className="select" value={values.villaId} onChange={(e) => setValues((p) => ({ ...p, villaId: e.target.value }))}>
              <option value="">Pick a villa</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Priority</label>
            <select className="select" value={values.priority} onChange={(e) => setValues((p) => ({ ...p, priority: e.target.value as TicketPriority }))}>
              <option value="P0">P0 · urgent (2h)</option>
              <option value="P1">P1 · high (8h)</option>
              <option value="P2">P2 · normal (48h)</option>
              <option value="P3">P3 · low (14d)</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Title</label>
          <input className="input" value={values.title} onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))} placeholder="What's broken?" />
        </div>
        <div className="field">
          <label className="field-label">Description</label>
          <textarea className="textarea" rows={3} value={values.description} onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))} placeholder="Specifics — location, severity, guest impact" />
        </div>
        <div className="field">
          <label className="field-label">Photo</label>
          <input type="file" accept="image/*" className="input" onChange={(e) => setValues((p) => ({ ...p, photoName: e.target.files?.[0]?.name ?? null }))} />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to open">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!values.title || !values.villaId}>
          Open ticket
        </button>
      </ModalFooter>
    </Modal>
  );
}
