"use client";

/**
 * Phase 2.2 dev-01 — NewProjectModal.
 *
 * 4-step large modal: Identity → Site → Phasing → Team. Wiring to
 * a real server action lands in the 2.2 data PR; today the submit
 * resolves with the gathered values.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalSteps } from "@/components/ui/modal";

export interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: NewProjectValues) => Promise<void> | void;
}

export interface NewProjectValues {
  code: string;
  name: string;
  type: "new-build" | "retrofit" | "amenity";
  location: string;
  landAreaSqm: number;
  targetCompletion: string;
  phases: string;
  pmEmail: string;
  agents: { scheduleVariance: boolean; rfiRouter: boolean; weeklyComposer: boolean };
}

const INITIAL: NewProjectValues = {
  code: "",
  name: "",
  type: "new-build",
  location: "",
  landAreaSqm: 0,
  targetCompletion: "",
  phases: "Pre-construction → Foundation → Structure → Finishes → Handover",
  pmEmail: "",
  agents: { scheduleVariance: true, rfiRouter: true, weeklyComposer: false },
};

const STEPS: { id: string; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "site", label: "Site" },
  { id: "phasing", label: "Phasing" },
  { id: "team", label: "Team" },
];

export function NewProjectModal({ open, onOpenChange, onSubmit }: NewProjectModalProps) {
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<NewProjectValues>(INITIAL);

  React.useEffect(() => {
    if (!open) {
      setStep(0);
      setValues(INITIAL);
    }
  }, [open]);

  function update<K extends keyof NewProjectValues>(key: K, value: NewProjectValues[K]) {
    setValues((p) => ({ ...p, [key]: value }));
  }

  const dirty =
    values.code.length > 0 || values.name.length > 0 || values.location.length > 0;

  async function finish() {
    await onSubmit?.(values);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" dirty={dirty} ariaLabel="New project">
      <ModalHeader
        glyph={<NewProjectGlyph />}
        glyphTone="accent"
        title="New project"
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
              <label className="field-label">Code</label>
              <input
                className="input mono"
                value={values.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                placeholder="EV-08"
              />
            </div>
            <div className="field">
              <label className="field-label">Name</label>
              <input
                className="input"
                value={values.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Eternal Villa 08"
              />
            </div>
            <div className="field">
              <label className="field-label">Type</label>
              <select
                className="select"
                value={values.type}
                onChange={(e) => update("type", e.target.value as NewProjectValues["type"])}
              >
                <option value="new-build">New build</option>
                <option value="retrofit">Retrofit</option>
                <option value="amenity">Amenity</option>
              </select>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="field">
              <label className="field-label">Location</label>
              <input
                className="input"
                value={values.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Ubud, Bali"
              />
            </div>
            <div className="field">
              <label className="field-label">Land area (m²)</label>
              <input
                className="input mono"
                type="number"
                value={values.landAreaSqm}
                onChange={(e) => update("landAreaSqm", Number(e.target.value))}
                placeholder="1400"
              />
            </div>
            <div className="field">
              <label className="field-label">Target completion</label>
              <input
                className="input"
                type="date"
                value={values.targetCompletion}
                onChange={(e) => update("targetCompletion", e.target.value)}
              />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="field">
              <label className="field-label">Phasing sketch</label>
              <textarea
                className="textarea"
                value={values.phases}
                onChange={(e) => update("phases", e.target.value)}
                rows={4}
              />
              <div className="field-help">Phases become editable milestones after creation.</div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="field">
              <label className="field-label">Assign PM (email)</label>
              <input
                className="input"
                type="email"
                value={values.pmEmail}
                onChange={(e) => update("pmEmail", e.target.value)}
                placeholder="pm@arconique.com"
              />
            </div>
            <fieldset className="field flex flex-col gap-2">
              <legend className="field-label">Enable AI agents</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={values.agents.scheduleVariance}
                  onChange={(e) =>
                    update("agents", { ...values.agents, scheduleVariance: e.target.checked })
                  }
                />
                <span className="box" aria-hidden />
                Schedule variance detector
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={values.agents.rfiRouter}
                  onChange={(e) =>
                    update("agents", { ...values.agents, rfiRouter: e.target.checked })
                  }
                />
                <span className="box" aria-hidden />
                RFI router
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={values.agents.weeklyComposer}
                  onChange={(e) =>
                    update("agents", { ...values.agents, weeklyComposer: e.target.checked })
                  }
                />
                <span className="box" aria-hidden />
                Weekly investor report composer
              </label>
            </fieldset>
          </>
        )}
      </ModalBody>
      <ModalFooter help={step === STEPS.length - 1 ? "⌘ + Enter to create" : undefined}>
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
            disabled={step === 0 && (!values.code || !values.name)}
          >
            Next → {STEPS[step + 1].label}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={finish}>
            Create project
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

function NewProjectGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
