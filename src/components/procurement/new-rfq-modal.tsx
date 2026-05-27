"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalSteps } from "@/components/ui/modal";

/**
 * Phase 2.2 dev-04 — NewRfqModal.
 *
 * Form-lg 3 steps: scope · vendors · deadline.
 */

export interface NewRfqValues {
  projectId: string;
  scope: string;
  vendorIds: string[];
  deadline: string;
}

export interface NewRfqModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; label: string }[];
  vendors: { id: string; name: string; category: string }[];
  onSubmit?: (values: NewRfqValues) => Promise<void> | void;
}

const STEPS = [
  { id: "scope", label: "Scope" },
  { id: "vendors", label: "Vendors" },
  { id: "deadline", label: "Deadline" },
];

export function NewRfqModal({ open, onOpenChange, projects, vendors, onSubmit }: NewRfqModalProps) {
  const [step, setStep] = React.useState(0);
  const [projectId, setProjectId] = React.useState("");
  const [scope, setScope] = React.useState("");
  const [vendorIds, setVendorIds] = React.useState<string[]>([]);
  const [deadline, setDeadline] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setStep(0);
      setProjectId("");
      setScope("");
      setVendorIds([]);
      setDeadline("");
    }
  }, [open]);

  const dirty = scope.length > 0 || vendorIds.length > 0;

  function toggleVendor(id: string) {
    setVendorIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function finish() {
    await onSubmit?.({ projectId, scope, vendorIds, deadline });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" dirty={dirty} ariaLabel="New RFQ">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        }
        glyphTone="accent"
        title="New RFQ"
        description={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step].label}`}
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
          <>
            <div className="field">
              <label className="field-label">Project</label>
              <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Pick a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Scope description</label>
              <textarea
                className="textarea"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                rows={5}
                placeholder="What are you buying? Quantities, specs, delivery window…"
              />
            </div>
          </>
        )}
        {step === 1 && (
          <div className="field">
            <label className="field-label">Vendors to invite ({vendorIds.length} selected)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
              {vendors.length === 0 ? (
                <span style={{ color: "var(--ink-3)", fontSize: 13, padding: 8 }}>No vendors yet — register one first.</span>
              ) : (
                vendors.map((v) => (
                  <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 6px", borderRadius: 4 }}>
                    <input type="checkbox" checked={vendorIds.includes(v.id)} onChange={() => toggleVendor(v.id)} />
                    <span style={{ flex: 1 }}>{v.name}</span>
                    <span className="mono" style={{ color: "var(--ink-3)", fontSize: 11 }}>{v.category}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="field">
            <label className="field-label">Quote deadline</label>
            <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <div className="field-help">Vendors will receive an automated invite + reminder at T-2 days.</div>
          </div>
        )}
      </ModalBody>
      <ModalFooter help={step === STEPS.length - 1 ? "⌘ + Enter to issue RFQ" : undefined}>
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
            disabled={step === 0 && (!projectId || !scope) || (step === 1 && vendorIds.length < 2)}
          >
            Next →
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={finish} disabled={!deadline}>
            Issue RFQ
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
