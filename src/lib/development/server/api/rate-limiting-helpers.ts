/**
 * Stage 5.J.3 — Pure rate limiting helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Sliding-window decision: given the current request counts in the
 * (minute, hour, day) buckets and the per-key caps, decide whether to
 * allow this request, and if not, how long to wait.
 */

export interface RateLimitConfig {
  perMinute: number;
  perHour: number;
  perDay: number;
}

export interface RateLimitState {
  minuteCount: number;
  hourCount: number;
  dayCount: number;
}

export type RateLimitReason =
  | "minute_exceeded"
  | "hour_exceeded"
  | "day_exceeded";

export interface RateLimitVerdict {
  allowed: boolean;
  reason?: RateLimitReason;
  retryAfterSeconds: number;
  remaining: { minute: number; hour: number; day: number };
}

/**
 * Returns whether the request should be allowed against the per-key
 * caps + current bucket counts. The lowest unmet cap dictates the
 * retry-after window.
 */
export function checkRateLimit(
  config: RateLimitConfig,
  state: RateLimitState,
): RateLimitVerdict {
  const remainingMinute = Math.max(0, config.perMinute - state.minuteCount);
  const remainingHour = Math.max(0, config.perHour - state.hourCount);
  const remainingDay = Math.max(0, config.perDay - state.dayCount);

  if (state.minuteCount >= config.perMinute && config.perMinute > 0) {
    return {
      allowed: false,
      reason: "minute_exceeded",
      retryAfterSeconds: 60,
      remaining: {
        minute: remainingMinute,
        hour: remainingHour,
        day: remainingDay,
      },
    };
  }
  if (state.hourCount >= config.perHour && config.perHour > 0) {
    return {
      allowed: false,
      reason: "hour_exceeded",
      retryAfterSeconds: 3600,
      remaining: {
        minute: remainingMinute,
        hour: remainingHour,
        day: remainingDay,
      },
    };
  }
  if (state.dayCount >= config.perDay && config.perDay > 0) {
    return {
      allowed: false,
      reason: "day_exceeded",
      retryAfterSeconds: 86400,
      remaining: {
        minute: remainingMinute,
        hour: remainingHour,
        day: remainingDay,
      },
    };
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: {
      minute: remainingMinute,
      hour: remainingHour,
      day: remainingDay,
    },
  };
}

/**
 * Compute the canonical window-start timestamp for a given clock + window
 * type. Matches the SQL `date_trunc('minute' | 'hour' | 'day', now())`.
 */
export function windowStartFor(
  windowType: "minute" | "hour" | "day",
  clock: Date,
): Date {
  const d = new Date(clock.getTime());
  d.setUTCSeconds(0, 0);
  if (windowType === "hour" || windowType === "day") {
    d.setUTCMinutes(0);
  }
  if (windowType === "day") {
    d.setUTCHours(0);
  }
  return d;
}
