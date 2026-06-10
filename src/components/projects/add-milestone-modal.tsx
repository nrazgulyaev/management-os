"use client";

/**
 * Phase 2.2 dev-01 — AddMilestoneModal.
 *
 * Form-md. Name + target date + owner + dependency picker. The
 * dependency picker is a simple multi-select against the existing
 * milestone list passed in via props.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export interface AddMilestoneValues {
  name: string;
  targetDate: string;
  ownerId: string | null;
  dependsOn: string[];
}

export interface AddMilestoneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing milestones the new entry can depend on. */
  milestones: { id: string; name: string }[];
  /** Owner candidates ([] disables the field). */
  owners?: { id: string; name: string }[];
  onSubmit?: (values: AddMilestoneValues) => Promise<void> | void;
}

const INITIAL: AddMilestoneValues = {
  name: "",
  targetDate: "",
  ownerId: null,
  dependsOn: [],
};

export function AddMilestoneModal({
  open,
  onOpenChange,
  milestones,
  owners = [],
  onSubmit,
}: AddMilestoneModalProps) {
  const [values, setValues] = React.useState<AddMilestoneValues>(INITIAL);

  React.useEffect(() => {
    if (!open) setValues(INITIAL);
  }, [open]);

  function toggleDep(id: string) {
    setValues((p) => ({
      ...p,
      dependsOn: p.dependsOn.includes(id)
        ? p.dependsOn.filter((x) => x !== id)
        : [...p.dependsOn, id],
    }));
  }

  async function submit() {
    if (!values.name || !values.targetDate) return;
    await onSubmit?.(values);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={values.name.length > 0} ariaLabel="Add milestone">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        }
        glyphTone="accent"
        title="Add milestone"
        description="New milestones default to status “planned” and surface in the next variance run."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Name</label>
          <input
            className="input"
            value={values.name}
            onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
            placeholder="Foundation pour complete"
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Target date</label>
            <input
              className="input"
              type="date"
              value={values.targetDate}
              onChange={(e) => setValues((p) => ({ ...p, targetDate: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field-label">Owner</label>
            <select
              className="select"
              value={values.ownerId ?? ""}
              onChange={(e) => setValues((p) => ({ ...p, ownerId: e.target.value || null }))}
            >
              <option value="">Unassigned</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Depends on (finish → start)</label>
          {milestones.length === 0 ? (
            <div className="field-help">No upstream milestones yet — this will be the first.</div>
          ) : (
            <div className="ms-dep-picker">
              {milestones.map((m) => (
                <label key={m.id} className="ms-dep-option">
                  <input
                    type="checkbox"
                    checked={values.dependsOn.includes(m.id)}
                    onChange={() => toggleDep(m.id)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to add">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-accent btn-sm"
          onClick={submit}
          disabled={!values.name || !values.targetDate}
        >
          Add milestone
        </button>
      </ModalFooter>
    </Modal>
  );
}
