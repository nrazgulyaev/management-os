"use client";

/**
 * Phase 2.4 mgmt-03 — CheckinFlow.
 *
 * 4-step wrapper. Built so the screen can be locked on a tablet
 * at the counter — once you start, you can't navigate away until
 * either complete or explicitly cancelled.
 *
 * Step 1 (identity) is gated by canAdvance(): either OCR succeeded
 * or staff toggled manualOverride (which is audit-logged via the
 * onOverride hook the parent passes).
 */

import * as React from "react";
import {
  type CheckinFlowState,
  type CheckinStep,
  canAdvance,
  completeStep,
} from "@/features/front-office/checkin-state";

export interface CheckinFlowProps {
  initialState: CheckinFlowState;
  staffUserId: string;
  /** Render step body — parent controls UI per step. */
  renderStep: (
    step: CheckinStep,
    state: CheckinFlowState,
    patchStep: (patch: Partial<CheckinFlowState["steps"][CheckinStep]>) => void,
  ) => React.ReactNode;
  onComplete?: (state: CheckinFlowState) => Promise<void> | void;
  onCancel?: () => void;
}

const STEP_LABEL: Record<CheckinStep, string> = {
  identity: "Identity",
  stay: "Stay details",
  sign: "Signature",
  handover: "Handover",
};
const ORDER: CheckinStep[] = ["identity", "stay", "sign", "handover"];

export function CheckinFlow({ initialState, staffUserId, renderStep, onComplete, onCancel }: CheckinFlowProps) {
  const [state, setState] = React.useState<CheckinFlowState>(initialState);
  const [busy, setBusy] = React.useState(false);

  function patchStep(patch: Partial<CheckinFlowState["steps"][CheckinStep]>) {
    setState((s) => ({
      ...s,
      steps: { ...s.steps, [s.currentStep]: { ...s.steps[s.currentStep], ...patch, step: s.currentStep } },
    }));
  }

  async function advance() {
    if (!canAdvance(state)) return;
    if (state.currentStep === "handover") {
      const finished = completeStep(state, "handover", staffUserId);
      setState(finished);
      setBusy(true);
      try {
        await onComplete?.(finished);
      } finally {
        setBusy(false);
      }
      return;
    }
    setState((s) => completeStep(s, s.currentStep, staffUserId));
  }

  const idx = ORDER.indexOf(state.currentStep);
  const blocked = !canAdvance(state);

  return (
    <div className="checkin-flow">
      <ol className="cf-steps mono">
        {ORDER.map((s, i) => (
          <li key={s} className={`${i < idx ? "is-done" : ""}${i === idx ? " is-on" : ""}`}>
            {i + 1} · {STEP_LABEL[s]}
          </li>
        ))}
      </ol>
      <div className="cf-body">{renderStep(state.currentStep, state, patchStep)}</div>
      <footer className="cf-foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={blocked || busy} onClick={advance}>
          {state.currentStep === "handover" ? (busy ? "Completing…" : "Complete check-in") : "Next"}
        </button>
      </footer>
    </div>
  );
}
