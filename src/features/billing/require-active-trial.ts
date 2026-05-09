import "server-only";

import { getCurrentOrgTrial } from "./trial-services";

/**
 * Stage 10.I.6 — Server-action mutation guard.
 *
 * Call from any write-side server action that should be blocked when
 * the org's trial has expired (or the subscription was cancelled).
 * Reads remain unblocked everywhere — the guard short-circuits only
 * when the operator tries to MUTATE state from an org without an
 * active trial / paid subscription.
 *
 * Usage:
 *   "use server";
 *   import { requireActiveTrialOrPaid } from "@/features/billing/require-active-trial";
 *   export async function createXAction(...) {
 *     await requireActiveTrialOrPaid(); // throws TrialExpiredError on miss
 *     // ... mutation ...
 *   }
 *
 * The throw bubbles up to the caller; client-side handlers should
 * catch + display the trial-expiry CTA. The persistent <TrialBanner>
 * already surfaces the state visually; this guard prevents bypass via
 * direct server-action invocation.
 */

export class TrialExpiredError extends Error {
  readonly code = "TRIAL_EXPIRED";
  readonly trialUi: string;
  constructor(trialUi: string, message?: string) {
    super(
      message ??
        "Your trial has ended — workspace is read-only until you choose a plan.",
    );
    this.trialUi = trialUi;
  }
}

/**
 * Throws TrialExpiredError when the current user's org cannot mutate.
 * Returns silently in every other case (no signed-in user, no DB,
 * paid org, active / expiring-soon trial). The caller decides whether
 * to surface the error inline or redirect.
 */
export async function requireActiveTrialOrPaid(): Promise<void> {
  const trial = await getCurrentOrgTrial();
  // No trial info (anonymous, DB outage, or pre-10.I.5 org with
  // trial_status='none') — pass through. The 'none' case represents
  // orgs provisioned before the trial machine existed; they keep full
  // access by design.
  if (!trial) return;
  if (trial.state.canWrite) return;
  throw new TrialExpiredError(trial.state.ui);
}
