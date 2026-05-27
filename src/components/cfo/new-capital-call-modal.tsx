"use client";

/**
 * Phase 2.2 dev-02 — NewCapitalCallModal.
 *
 * Form-lg 3 steps:
 *   1. Amount      — total + currency + project
 *   2. Investors   — allocation table (pro-rata pre-fill via stub)
 *   3. Timing      — issue date + payment-due date
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalSteps } from "@/components/ui/modal";

export interface NewCapitalCallValues {
  projectId: string;
  totalUsd: number;
  currency: string;
  investorAllocations: { investorId: string; pct: number }[];
  issueDate: string;
  dueDate: string;
}

export interface NewCapitalCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; label: string }[];
  investors: { id: string; name: string; commitmentPct: number }[];
  onSubmit?: (values: NewCapitalCallValues) => Promise<void> | void;
}

const STEPS = [
  { id: "amount", label: "Amount" },
  { id: "investors", label: "Investors" },
  { id: "timing", label: "Timing" },
];

export function NewCapitalCallModal({
  open,
  onOpenChange,
  projects,
  investors,
  onSubmit,
}: NewCapitalCallModalProps) {
  const [step, setStep] = React.useState(0);
  const [totalUsd, setTotalUsd] = React.useState(0);
  const [projectId, setProjectId] = React.useState("");
  const [issueDate, setIssueDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setStep(0);
      setTotalUsd(0);
      setProjectId("");
      setIssueDate("");
      setDueDate("");
    }
  }, [open]);

  const dirty = totalUsd > 0 || projectId.length > 0;

  async function finish() {
    await onSubmit?.({
      projectId,
      totalUsd,
      currency: "USD",
      investorAllocations: investors.map((i) => ({
        investorId: i.id,
        pct: i.commitmentPct,
      })),
      issueDate,
      dueDate,
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" dirty={dirty} ariaLabel="New capital call">
      <ModalHeader
        glyph={<DollarGlyph />}
        glyphTone="accent"
        title="New capital call"
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
              <select
                className="select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Pick a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Total amount (USD)</label>
              <input
                className="input mono"
                type="number"
                value={totalUsd}
                onChange={(e) => setTotalUsd(Number(e.target.value))}
                placeholder="500000"
              />
              <div className="field-help">Allocations split pro-rata across active commitments on step 2.</div>
            </div>
          </>
        )}
        {step === 1 && (
          <div className="field">
            <label className="field-label">Pro-rata allocation</label>
            <table className="data">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th className="num">Pct</th>
                  <th className="num">USD</th>
                </tr>
              </thead>
              <tbody>
                {investors.length === 0 ? (
                  <tr><td colSpan={3} style={{ color: "var(--ink-3)", textAlign: "center", padding: "16px 0" }}>No active investors</td></tr>
                ) : (
                  investors.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td className="num mono">{i.commitmentPct.toFixed(2)}%</td>
                      <td className="num mono">${((totalUsd * i.commitmentPct) / 100).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {step === 2 && (
          <div className="field-row">
            <div className="field">
              <label className="field-label">Issue date</label>
              <input
                className="input"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Payment due</label>
              <input
                className="input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter help={step === STEPS.length - 1 ? "⌘ + Enter to issue" : undefined}>
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
            disabled={step === 0 && (!projectId || totalUsd <= 0)}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={finish}
            disabled={!issueDate || !dueDate}
          >
            Issue capital call
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

function DollarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
