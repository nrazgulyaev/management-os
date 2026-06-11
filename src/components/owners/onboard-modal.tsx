"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalSteps } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-03 — OnboardOwnerModal.
 *
 * Form-lg 3 steps: Identity → Commission → Villas + portal.
 * Save-and-finish-later persists to `onboarding_drafts` (data PR).
 * The doc-checker agent validates the ID upload on step 1.
 */

export interface OnboardOwnerValues {
  displayName: string;
  legalName: string;
  email: string;
  taxResidency: string;
  idDocName: string | null;
  commissionPct: number;
  payoutCurrency: string;
  ibanRef: string;
  villaIds: string[];
  invitePortal: boolean;
}

export interface OnboardOwnerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableVillas: { id: string; label: string }[];
  resumeDraft?: OnboardOwnerValues | null;
  onSaveDraft?: (values: OnboardOwnerValues, step: number) => Promise<void> | void;
  onSubmit?: (values: OnboardOwnerValues) => Promise<void> | void;
}

const INITIAL: OnboardOwnerValues = {
  displayName: "",
  legalName: "",
  email: "",
  taxResidency: "",
  idDocName: null,
  commissionPct: 30,
  payoutCurrency: "USD",
  ibanRef: "",
  villaIds: [],
  invitePortal: true,
};

const STEPS = [
  { id: "identity", label: "Identity" },
  { id: "commission", label: "Commission" },
  { id: "villas", label: "Villas + portal" },
];

export function OnboardOwnerModal({
  open,
  onOpenChange,
  availableVillas,
  resumeDraft,
  onSaveDraft,
  onSubmit,
}: OnboardOwnerModalProps) {
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<OnboardOwnerValues>(resumeDraft ?? INITIAL);
  const [showResume, setShowResume] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(0);
      setValues(resumeDraft ?? INITIAL);
      setShowResume(Boolean(resumeDraft));
    }
  }, [open, resumeDraft]);

  function update<K extends keyof OnboardOwnerValues>(key: K, value: OnboardOwnerValues[K]) {
    setValues((p) => ({ ...p, [key]: value }));
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(INITIAL);

  async function saveDraft() {
    await onSaveDraft?.(values, step);
    onOpenChange(false);
  }

  async function finish() {
    await onSubmit?.(values);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" dirty={dirty} ariaLabel="Onboard owner">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
          </svg>
        }
        glyphTone="accent"
        title="Onboard owner"
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
      {showResume && (
        <div style={{ padding: "10px 24px 0", fontSize: 12, color: "var(--ink-3)" }}>
          Resuming a saved draft — edit any field to overwrite the saved values.
        </div>
      )}
      <ModalBody>
        {step === 0 && (
          <>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Display name</label>
                <input className="input" value={values.displayName} onChange={(e) => update("displayName", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Legal name</label>
                <input className="input" value={values.legalName} onChange={(e) => update("legalName", e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Email</label>
              <input className="input" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Tax residency</label>
              <input className="input" value={values.taxResidency} onChange={(e) => update("taxResidency", e.target.value)} placeholder="Singapore" />
            </div>
            <div className="field">
              <label className="field-label">Government ID (PDF/image)</label>
              <input
                type="file"
                className="input"
                accept=".pdf,image/*"
                onChange={(e) => update("idDocName", e.target.files?.[0]?.name ?? null)}
              />
              <div className="field-help">The doc-checker agent verifies legibility + matches name fields on submit.</div>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Commission %</label>
                <input className="input mono" type="number" min={0} max={100} value={values.commissionPct} onChange={(e) => update("commissionPct", Number(e.target.value))} />
              </div>
              <div className="field">
                <label className="field-label">Payout currency</label>
                <select className="select" value={values.payoutCurrency} onChange={(e) => update("payoutCurrency", e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="IDR">IDR</option>
                  <option value="EUR">EUR</option>
                  <option value="SGD">SGD</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field-label">IBAN / account ref</label>
              <input className="input mono" value={values.ibanRef} onChange={(e) => update("ibanRef", e.target.value)} placeholder="SG••••8842" />
              <div className="field-help">Stored encrypted; only Directors can decrypt.</div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="field">
              <label className="field-label">Villas to assign ({values.villaIds.length})</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                {availableVillas.map((v) => (
                  <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 6px" }}>
                    <input
                      type="checkbox"
                      checked={values.villaIds.includes(v.id)}
                      onChange={() =>
                        update("villaIds",
                          values.villaIds.includes(v.id)
                            ? values.villaIds.filter((x) => x !== v.id)
                            : [...values.villaIds, v.id],
                        )
                      }
                    />
                    <span>{v.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={values.invitePortal} onChange={(e) => update("invitePortal", e.target.checked)} />
              Send owner portal invitation immediately
            </label>
          </>
        )}
      </ModalBody>
      <ModalFooter help={step === STEPS.length - 1 ? "⌘ + Enter to onboard" : undefined}>
        {step > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        {/* "Save & finish later" only renders when a real draft-persistence
            handler is wired. Without it the button was a no-op that silently
            discarded the wizard — so we hide it rather than fake a save. */}
        {onSaveDraft && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={saveDraft}>
            Save & finish later
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && (!values.displayName || !values.email)}
          >
            Next →
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={finish}>
            Onboard owner
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
