/**
 * Stage 10.I.5 — Pure trial-state derivation.
 *
 * Pure module — no I/O, no env, no DB. Importable from server
 * components, edge runtime, and node:test. The cron job + the trial
 * banner + the read-only guard all consume this single source of truth.
 *
 * State transitions documented in drizzle/0092_organizations_trial_state.sql.
 */

export type TrialStatus =
  | "none"
  | "active"
  | "expired"
  | "converted"
  | "cancelled";

export type TrialUiState =
  | "none"        // No trial machinery — paid org or pre-10.I.5 org
  | "active"      // Trial running, > 2 days remaining
  | "expiring-soon" // Trial running, ≤ 2 days remaining
  | "expired"     // Trial ended, org in read-only mode
  | "converted"   // Org has a paid subscription (Stage 10.L)
  | "cancelled";  // Operator cancelled the trial without converting

export interface TrialOrgInput {
  trialStatus: TrialStatus;
  trialStartedAt: Date | string | null;
  trialEndsAt: Date | string | null;
}

export interface TrialState {
  ui: TrialUiState;
  /** Days remaining until expiry. Negative when already expired. */
  daysRemaining: number | null;
  /** Reads + non-mutation surfaces still allowed when true. Always
   *  true unless the operator forces the org to a hard stop. */
  canRead: boolean;
  /** Mutations (server actions, writes) blocked when false. */
  canWrite: boolean;
  /** True when the banner should render. */
  shouldShowBanner: boolean;
}

const TRIAL_DURATION_DAYS = 14;
const EXPIRING_SOON_DAYS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Derive UI + access flags from the org's trial fields. `now` defaults
 * to `new Date()` but is injectable for tests + cron simulations.
 */
export function deriveTrialState(
  org: TrialOrgInput,
  now: Date = new Date(),
): TrialState {
  const endsAt = toDate(org.trialEndsAt);

  // 'none' / 'converted' / 'cancelled' — no banner, full access for
  // 'none' + 'converted', read-only for 'cancelled'.
  if (org.trialStatus === "none") {
    return {
      ui: "none",
      daysRemaining: null,
      canRead: true,
      canWrite: true,
      shouldShowBanner: false,
    };
  }
  if (org.trialStatus === "converted") {
    return {
      ui: "converted",
      daysRemaining: null,
      canRead: true,
      canWrite: true,
      shouldShowBanner: false,
    };
  }
  if (org.trialStatus === "cancelled") {
    return {
      ui: "cancelled",
      daysRemaining: null,
      canRead: true,
      canWrite: false,
      shouldShowBanner: true,
    };
  }
  if (org.trialStatus === "expired") {
    return {
      ui: "expired",
      daysRemaining: endsAt ? Math.floor((endsAt.getTime() - now.getTime()) / MS_PER_DAY) : null,
      canRead: true,
      canWrite: false,
      shouldShowBanner: true,
    };
  }

  // active — bucket by days remaining.
  const daysRemaining = endsAt
    ? Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_DAY)
    : null;

  // Edge case: trialStatus='active' but trial_ends_at < now (cron hasn't
  // run yet). Treat as expired for read-only purposes.
  if (daysRemaining !== null && daysRemaining < 0) {
    return {
      ui: "expired",
      daysRemaining,
      canRead: true,
      canWrite: false,
      shouldShowBanner: true,
    };
  }

  if (daysRemaining !== null && daysRemaining <= EXPIRING_SOON_DAYS) {
    return {
      ui: "expiring-soon",
      daysRemaining,
      canRead: true,
      canWrite: true,
      shouldShowBanner: true,
    };
  }

  return {
    ui: "active",
    daysRemaining,
    canRead: true,
    canWrite: true,
    shouldShowBanner: true,
  };
}

/** Trial expiry timestamp from a starting Date. */
export function computeTrialEndsAt(
  startedAt: Date,
  durationDays: number = TRIAL_DURATION_DAYS,
): Date {
  const end = new Date(startedAt);
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end;
}

export const TRIAL_DURATION_DAYS_DEFAULT = TRIAL_DURATION_DAYS;
export const TRIAL_EXPIRING_SOON_DAYS = EXPIRING_SOON_DAYS;
