/**
 * Pure hold-lifecycle helpers. No DB / no `server-only` import.
 *
 * The hold flows through `active → (converted | expired | cancelled |
 * rejected)`. `converted` is set by the convert action; the others by
 * the cancel / expiry / reject actions. `releaseHold` is the seam
 * where the calendar block is released.
 */
import { defaultHoldExpiry } from "./token";

export type HoldStatus =
  | "active"
  | "converted"
  | "expired"
  | "cancelled"
  | "rejected";

/** Pure: a quote can become a hold iff it's available. */
export interface QuoteSnapshotInput {
  available: boolean;
  reason?: string;
  totalMinor: bigint | number | string;
  averageNightlyMinor: bigint | number | string;
  nights: number;
  currency: string;
  channelKey?: string;
  ruleSetId?: string | null;
  nightly?: ReadonlyArray<{
    date: string;
    rateMinor: bigint | number | string;
    available: boolean;
  }>;
}

export function canCreateHold(quote: QuoteSnapshotInput): {
  ok: boolean;
  reason: string;
} {
  if (!quote.available) return { ok: false, reason: quote.reason ?? "unavailable" };
  if (quote.nights <= 0) return { ok: false, reason: "no_nights" };
  if (asBigint(quote.totalMinor) <= 0n)
    return { ok: false, reason: "no_amount" };
  return { ok: true, reason: "ok" };
}

export interface HoldShape {
  status: HoldStatus;
  expiresAt: Date;
}

export function holdIsActive(hold: HoldShape, now: Date = new Date()): boolean {
  if (hold.status !== "active") return false;
  return hold.expiresAt.getTime() > now.getTime();
}

export function holdIsExpired(hold: HoldShape, now: Date = new Date()): boolean {
  if (hold.status === "expired") return true;
  return hold.status === "active" && hold.expiresAt.getTime() <= now.getTime();
}

/** Pure: collapse internal status to a guest-friendly label. */
export function publicHoldStatusLabel(status: HoldStatus): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
} {
  switch (status) {
    case "active":
      return { label: "Awaiting your details", tone: "info" };
    case "converted":
      return { label: "Booking confirmed", tone: "success" };
    case "expired":
      return { label: "Hold expired", tone: "warning" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "rejected":
      return { label: "Could not be confirmed", tone: "warning" };
  }
}

export function adminHoldStatusLabel(status: HoldStatus): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
} {
  switch (status) {
    case "active":
      return { label: "Active", tone: "info" };
    case "converted":
      return { label: "Converted", tone: "success" };
    case "expired":
      return { label: "Expired", tone: "warning" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "rejected":
      return { label: "Rejected", tone: "warning" };
  }
}

/**
 * Pure: build the snapshot blob persisted on the hold row. The snapshot
 * NEVER carries rule-set IDs or any internal modifier breakdown — the
 * dynamic engine's public summary is the source.
 */
export interface HoldSnapshot {
  available: boolean;
  reason: string;
  nights: number;
  currency: string;
  channelKey: string;
  totalMinor: string;
  averageNightlyMinor: string;
  nightly: { date: string; rateMinor: string; available: boolean }[];
  capturedAt: string;
}

export function buildHoldSnapshotFromQuote(
  quote: QuoteSnapshotInput & { capturedAt?: Date },
): HoldSnapshot {
  return {
    available: quote.available,
    reason: quote.reason ?? "ok",
    nights: quote.nights,
    currency: quote.currency,
    channelKey: quote.channelKey ?? "direct",
    totalMinor: asBigint(quote.totalMinor).toString(),
    averageNightlyMinor: asBigint(quote.averageNightlyMinor).toString(),
    nightly:
      quote.nightly?.map((n) => ({
        date: n.date,
        rateMinor: asBigint(n.rateMinor).toString(),
        available: n.available,
      })) ?? [],
    capturedAt: (quote.capturedAt ?? new Date()).toISOString(),
  };
}

export function calculateHoldExpiry(
  now: Date,
  minutes: number,
): Date {
  return defaultHoldExpiry(minutes, now);
}

/** Pure: should the calendar block be released when this status hits? */
export function shouldReleaseHold(status: HoldStatus): boolean {
  return status === "expired" || status === "cancelled" || status === "rejected";
}

function asBigint(v: bigint | number | string | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0n;
    return BigInt(Math.trunc(v));
  }
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

// -----------------------------------------------------------------------------
// Pure rate-limit helper (DB-backed by services.ts; tested in isolation here).
// -----------------------------------------------------------------------------

export interface RateLimitWindow {
  windowStart: Date;
  holdCount: number;
  blockedUntil: Date | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  reason?: "blocked" | "too_many";
  retryAfterSeconds?: number;
}

/**
 * Pure: decide whether a request from a given IP should be allowed.
 *   - max `maxHolds` per `windowMinutes`
 *   - if exceeded: block for `blockMinutes`
 *
 * Returns the decision + the next state the caller should persist. The
 * caller is responsible for the DB upsert.
 */
export function decideRateLimit(args: {
  now: Date;
  current: RateLimitWindow | null;
  maxHolds?: number;
  windowMinutes?: number;
  blockMinutes?: number;
}): { decision: RateLimitDecision; next: RateLimitWindow } {
  const maxHolds = args.maxHolds ?? 5;
  const windowMs = (args.windowMinutes ?? 10) * 60_000;
  const blockMs = (args.blockMinutes ?? 30) * 60_000;
  const now = args.now;
  const current = args.current;

  // Already blocked?
  if (
    current?.blockedUntil &&
    current.blockedUntil.getTime() > now.getTime()
  ) {
    const seconds = Math.ceil(
      (current.blockedUntil.getTime() - now.getTime()) / 1000,
    );
    return {
      decision: {
        allowed: false,
        reason: "blocked",
        retryAfterSeconds: seconds,
      },
      next: current,
    };
  }

  // Window stale → reset.
  if (
    !current ||
    now.getTime() - current.windowStart.getTime() > windowMs
  ) {
    return {
      decision: { allowed: true },
      next: {
        windowStart: now,
        holdCount: 1,
        blockedUntil: null,
      },
    };
  }

  // Within window — increment.
  const nextCount = current.holdCount + 1;
  if (nextCount > maxHolds) {
    const blockedUntil = new Date(now.getTime() + blockMs);
    return {
      decision: {
        allowed: false,
        reason: "too_many",
        retryAfterSeconds: Math.ceil(blockMs / 1000),
      },
      next: {
        windowStart: current.windowStart,
        holdCount: nextCount,
        blockedUntil,
      },
    };
  }
  return {
    decision: { allowed: true },
    next: {
      windowStart: current.windowStart,
      holdCount: nextCount,
      blockedUntil: null,
    },
  };
}

/**
 * Pure: build a public-safe hold view. NEVER carries internal fields
 * (token hash, rule-set id, internal cost). Source-grep + projection
 * tests pin this contract.
 */
export interface PublicHoldView {
  holdCode: string;
  villa: { label: string };
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  totalMinor: string;
  averageNightlyMinor: string;
  currency: string;
  expiresAt: string;
  status: HoldStatus;
  statusLabel: string;
}
