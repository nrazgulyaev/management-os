/**
 * Phase 2.4 mgmt-03 — Front-office check-in 4-step state machine.
 *
 * Steps:
 *   1. identity   — ID OCR success OR manual override (audit-logged)
 *   2. stay       — confirm stay details (dates, party size, comp)
 *   3. sign       — guest signs registration form (digital or paper)
 *   4. handover   — physical key + welcome briefing
 *
 * Step 1 cannot advance without either OCR success or an explicit
 * manual override; the override flag becomes part of the audit log
 * and visible on the registry page.
 */

export type CheckinStep = "identity" | "stay" | "sign" | "handover";

export interface CheckinStepState {
  step: CheckinStep;
  completedAt?: string;
  completedBy?: string;
  /** Free-form payload per step (OCR result, signature ref, etc). */
  payload?: Record<string, unknown>;
  manualOverride?: boolean;
}

export interface CheckinFlowState {
  bookingId: string;
  steps: Record<CheckinStep, CheckinStepState>;
  currentStep: CheckinStep;
}

const ORDER: CheckinStep[] = ["identity", "stay", "sign", "handover"];

export function nextStep(current: CheckinStep): CheckinStep | null {
  const i = ORDER.indexOf(current);
  if (i < 0 || i === ORDER.length - 1) return null;
  return ORDER[i + 1];
}

export function canAdvance(state: CheckinFlowState): boolean {
  const s = state.steps[state.currentStep];
  if (state.currentStep === "identity") {
    const ocrOk = (s.payload?.ocrSuccess as boolean | undefined) === true;
    const overridden = s.manualOverride === true;
    return ocrOk || overridden;
  }
  return !!s.completedAt;
}

export function completeStep(
  state: CheckinFlowState,
  step: CheckinStep,
  by: string,
  patch: Partial<CheckinStepState> = {},
): CheckinFlowState {
  const next: CheckinFlowState = {
    ...state,
    steps: {
      ...state.steps,
      [step]: {
        ...state.steps[step],
        ...patch,
        step,
        completedAt: new Date().toISOString(),
        completedBy: by,
      },
    },
  };
  const after = nextStep(step);
  if (after) next.currentStep = after;
  return next;
}

export function isComplete(state: CheckinFlowState): boolean {
  return ORDER.every((s) => !!state.steps[s].completedAt);
}
