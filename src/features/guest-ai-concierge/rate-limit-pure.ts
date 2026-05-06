/**
 * Pure rate-limit math for the guest AI concierge.
 *
 * Two layers, both keyed on the stay token:
 *   - hourly  20 messages / 1 hour, blocks for 1 hour
 *   - minute   5 messages / 1 minute, blocks for 1 minute
 *
 * These are softer than the v9G token-access limiter (60/10min):
 * conversation needs to be quick.
 */

export type ConciergeRateKind = "hour" | "minute";

export interface ConciergeRatePolicy {
  windowMs: number;
  maxRequests: number;
  blockMs: number;
}

export const CONCIERGE_RATE_POLICIES: Record<
  ConciergeRateKind,
  ConciergeRatePolicy
> = {
  hour: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 20,
    blockMs: 60 * 60 * 1000,
  },
  minute: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    blockMs: 60 * 1000,
  },
};

export interface ConciergeRateState {
  hour: { windowStart: Date; count: number; blockedUntil: Date | null };
  minute: { windowStart: Date; count: number; blockedUntil: Date | null };
}

export type ConciergeRateOutcome =
  | { allowed: true; state: ConciergeRateState }
  | {
      allowed: false;
      state: ConciergeRateState;
      blockedUntil: Date;
      kind: ConciergeRateKind;
    };

/**
 * Pure: compute the next state given the prior state and a `now`. The
 * caller persists the state row after.
 */
export function evaluateConciergeRate(
  prior: ConciergeRateState | null,
  now: Date = new Date(),
): ConciergeRateOutcome {
  const state: ConciergeRateState = prior ?? {
    hour: { windowStart: now, count: 0, blockedUntil: null },
    minute: { windowStart: now, count: 0, blockedUntil: null },
  };

  // Active blocks: if either is blocking, we refuse and keep the
  // existing state intact.
  for (const k of ["minute", "hour"] as const) {
    const s = state[k];
    if (s.blockedUntil && s.blockedUntil.getTime() > now.getTime()) {
      return {
        allowed: false,
        state,
        blockedUntil: s.blockedUntil,
        kind: k,
      };
    }
  }

  const next: ConciergeRateState = {
    hour: { ...state.hour },
    minute: { ...state.minute },
  };

  for (const k of ["minute", "hour"] as const) {
    const policy = CONCIERGE_RATE_POLICIES[k];
    const s = next[k];
    if (
      now.getTime() - s.windowStart.getTime() >= policy.windowMs ||
      !prior
    ) {
      s.windowStart = now;
      s.count = 0;
      s.blockedUntil = null;
    }
    s.count += 1;
    if (s.count > policy.maxRequests) {
      s.blockedUntil = new Date(now.getTime() + policy.blockMs);
      return {
        allowed: false,
        state: next,
        blockedUntil: s.blockedUntil,
        kind: k,
      };
    }
  }

  return { allowed: true, state: next };
}
