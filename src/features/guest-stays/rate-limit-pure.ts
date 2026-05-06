/**
 * Pure rate-limit math — no DB. Two policies:
 *
 *   token-access      max 60 / 10 min, block 10 min
 *   verification      max 5  / 10 min, block 30 min
 *
 * `evaluateRateLimit` takes the persisted row (or null) and returns the
 * next state. The caller writes back the row + a security event.
 */

export type RateLimitKind = "token_access" | "verification";

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
  blockMs: number;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitKind, RateLimitPolicy> = {
  token_access: {
    windowMs: 10 * 60 * 1000,
    maxRequests: 60,
    blockMs: 10 * 60 * 1000,
  },
  verification: {
    windowMs: 10 * 60 * 1000,
    maxRequests: 5,
    blockMs: 30 * 60 * 1000,
  },
};

export interface RateLimitState {
  windowStart: Date;
  requestCount: number;
  blockedUntil: Date | null;
}

export type RateLimitOutcome =
  | { allowed: true; state: RateLimitState }
  | { allowed: false; state: RateLimitState; blockedUntil: Date };

/**
 * Compute the next state given the current row. Pure — same input always
 * returns same output.
 */
export function evaluateRateLimit(
  prior: RateLimitState | null,
  kind: RateLimitKind,
  now: Date = new Date(),
): RateLimitOutcome {
  const policy = RATE_LIMIT_POLICIES[kind];

  if (prior?.blockedUntil && prior.blockedUntil.getTime() > now.getTime()) {
    return {
      allowed: false,
      state: prior,
      blockedUntil: prior.blockedUntil,
    };
  }

  // Roll the window if we're outside it (or there's no prior row).
  let windowStart = prior?.windowStart ?? now;
  let requestCount = prior?.requestCount ?? 0;
  if (
    !prior ||
    now.getTime() - windowStart.getTime() >= policy.windowMs
  ) {
    windowStart = now;
    requestCount = 0;
  }

  // This call counts as a request.
  requestCount += 1;

  if (requestCount > policy.maxRequests) {
    const blockedUntil = new Date(now.getTime() + policy.blockMs);
    return {
      allowed: false,
      state: {
        windowStart,
        requestCount,
        blockedUntil,
      },
      blockedUntil,
    };
  }

  return {
    allowed: true,
    state: {
      windowStart,
      requestCount,
      blockedUntil: null,
    },
  };
}
