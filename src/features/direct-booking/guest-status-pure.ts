/**
 * Prompt 109 — Pure helpers for the guest status center.
 *
 * No DB / no `server-only` import — every function in this module is
 * unit-testable and forms the redaction seam between the canonical
 * direct-booking tables and the public-facing status page.
 *
 * The taxonomy here is intentionally larger than the
 * `publicDirectBookingStageSummary` taxonomy from Prompt 107 — it
 * adds explicit `failed`, `approved`, `in_house`, `completed`,
 * `deposit_required`, and `deposit_pending_confirmation` so the
 * status center can render a clean fourteen-stage timeline.
 */

// -----------------------------------------------------------------------------
// Stage taxonomy
// -----------------------------------------------------------------------------

export type PublicGuestStage =
  | "quote_held"
  | "request_submitted"
  | "under_review"
  | "deposit_required"
  | "deposit_pending_confirmation"
  | "deposit_confirmed"
  | "approved"
  | "confirmed"
  | "in_house"
  | "completed"
  | "expired"
  | "cancelled"
  | "rejected"
  | "failed";

export const PUBLIC_GUEST_STAGES: ReadonlyArray<PublicGuestStage> = [
  "quote_held",
  "request_submitted",
  "under_review",
  "deposit_required",
  "deposit_pending_confirmation",
  "deposit_confirmed",
  "approved",
  "confirmed",
  "in_house",
  "completed",
  "expired",
  "cancelled",
  "rejected",
  "failed",
];

const TERMINAL_STAGES = new Set<PublicGuestStage>([
  "expired",
  "cancelled",
  "rejected",
  "completed",
]);

export function isTerminalStage(stage: PublicGuestStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

// -----------------------------------------------------------------------------
// Stage derivation
// -----------------------------------------------------------------------------

export interface StageInput {
  hold: { status: string | null } | null;
  request: { status: string | null } | null;
  deposit: {
    status: string | null;
    guestClaimedPaid?: boolean;
  } | null;
  booking: {
    status: string | null;
    checkIn: string | null;
    checkOut: string | null;
  } | null;
  /** ISO date — used to soft-promote confirmed → in_house → completed. */
  today?: string | null;
}

/**
 * Pure: collapse the (hold, request, deposit, booking) state into a
 * single guest-facing stage.  Terminal states win over pending; a
 * confirmed booking wins over a "deposit_required" request; manual /
 * paid deposits collapse to `deposit_confirmed`.
 */
export function buildPublicDirectBookingStage(input: StageInput): PublicGuestStage {
  const today = input.today ?? null;

  // 1) Booking-side terminal/active wins.
  if (input.booking) {
    const b = (input.booking.status ?? "").toLowerCase();
    if (b === "cancelled" || b === "no_show") return "cancelled";
    if (b === "checked_out") return "completed";
    if (b === "checked_in") return "in_house";
    if (b === "confirmed" || b === "tentative") {
      if (today && input.booking.checkIn && input.booking.checkOut) {
        if (today >= input.booking.checkOut) return "completed";
        if (today >= input.booking.checkIn) return "in_house";
      }
      return "confirmed";
    }
  }

  // 2) Hold / request / deposit terminal categories.
  const holdStatus = (input.hold?.status ?? "").toLowerCase();
  const requestStatus = (input.request?.status ?? "").toLowerCase();
  const depositStatus = (input.deposit?.status ?? "").toLowerCase();
  if (
    requestStatus === "cancelled" ||
    holdStatus === "cancelled" ||
    depositStatus === "cancelled"
  ) {
    return "cancelled";
  }
  if (requestStatus === "rejected") return "rejected";
  if (depositStatus === "failed") return "failed";
  if (
    requestStatus === "expired" ||
    holdStatus === "expired" ||
    depositStatus === "expired"
  ) {
    return "expired";
  }

  // 3) Deposit-side promotion.
  if (
    depositStatus === "paid" ||
    depositStatus === "manually_marked_paid"
  ) {
    return "deposit_confirmed";
  }
  if (
    input.deposit?.guestClaimedPaid &&
    (depositStatus === "pending" ||
      depositStatus === "awaiting_provider" ||
      depositStatus === "requires_action")
  ) {
    return "deposit_pending_confirmation";
  }

  // 4) Approved request, deposit pending or absent → deposit_required.
  if (requestStatus === "approved" || requestStatus === "deposit_required") {
    if (
      depositStatus === "pending" ||
      depositStatus === "awaiting_provider" ||
      depositStatus === "requires_action" ||
      depositStatus === "draft" ||
      depositStatus === "" ||
      input.deposit === null
    ) {
      return "deposit_required";
    }
    return "approved";
  }

  // 5) Request flow.
  if (requestStatus === "under_review") return "under_review";
  if (requestStatus === "submitted") return "request_submitted";
  if (requestStatus === "converted") return "confirmed";

  // 6) Hold-only fallback.
  if (holdStatus === "active") return "quote_held";
  if (holdStatus === "expired") return "expired";

  return "quote_held";
}

// -----------------------------------------------------------------------------
// Copy
// -----------------------------------------------------------------------------

export interface GuestStatusCopy {
  headline: string;
  body: string;
  nextActionLabel: string | null;
  nextActionHref: string | null;
  severity: "info" | "success" | "warning" | "critical";
  guestCanAct: boolean;
}

export interface GuestStatusContext {
  /** Raw token (URL segment). Used to build the next-action href. */
  token: string;
  /** Whether a deposit row exists at all. */
  hasDeposit: boolean;
  /** Whether the deposit currently allows the guest to "I have paid". */
  canNotifyPaid: boolean;
  /** Whether a thread is allowed for messaging. */
  canMessage: boolean;
}

const DEPOSIT_PATH = (token: string) => `/book/hold/${token}/payment`;
const STATUS_PATH = (token: string) => `/book/hold/${token}/status`;
const MESSAGES_PATH = (token: string) => `/book/hold/${token}/messages`;

/**
 * Pure: produce the headline + body + nextAction copy for a stage.
 *
 * Copy is deliberately premium and non-technical — guests never see
 * "manual_stub", "providerSession", "depositId", "financeLink", or
 * any other internal vocabulary.
 */
export function buildGuestStatusCopy(
  stage: PublicGuestStage,
  ctx: GuestStatusContext,
): GuestStatusCopy {
  switch (stage) {
    case "quote_held":
      return {
        headline: "Your villa is temporarily held",
        body: "We are holding these dates for a short time while you complete your request. No card details are collected — our concierge team will guide you through every step.",
        nextActionLabel: "Continue your request",
        nextActionHref: `/book/hold/${ctx.token}`,
        severity: "info",
        guestCanAct: true,
      };
    case "request_submitted":
      return {
        headline: "Your request has been received",
        body: "Our concierge team is reviewing availability and the details you shared. We typically respond within a few hours.",
        nextActionLabel: ctx.canMessage ? "Message concierge" : null,
        nextActionHref: ctx.canMessage ? MESSAGES_PATH(ctx.token) : null,
        severity: "info",
        guestCanAct: ctx.canMessage,
      };
    case "under_review":
      return {
        headline: "Under review by our concierge team",
        body: "A concierge has picked up your request. We are confirming availability and any extras you asked for.",
        nextActionLabel: ctx.canMessage ? "Message concierge" : null,
        nextActionHref: ctx.canMessage ? MESSAGES_PATH(ctx.token) : null,
        severity: "info",
        guestCanAct: ctx.canMessage,
      };
    case "deposit_required":
      return {
        headline: "Deposit requested",
        body: "Your request is approved. To continue, please complete the deposit step. No card details are collected in this demo — our team will guide you offline.",
        nextActionLabel: ctx.hasDeposit ? "Open deposit page" : null,
        nextActionHref: ctx.hasDeposit ? DEPOSIT_PATH(ctx.token) : null,
        severity: "warning",
        guestCanAct: ctx.hasDeposit,
      };
    case "deposit_pending_confirmation":
      return {
        headline: "Payment confirmation received",
        body: "Thank you. Our team is verifying the deposit and will update your booking shortly. You will see a confirmation here as soon as it is processed.",
        nextActionLabel: "View booking status",
        nextActionHref: STATUS_PATH(ctx.token),
        severity: "info",
        guestCanAct: false,
      };
    case "deposit_confirmed":
      return {
        headline: "Deposit confirmed",
        body: "Your deposit is recorded. We are issuing your booking confirmation now.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "success",
        guestCanAct: false,
      };
    case "approved":
      return {
        headline: "Approved by concierge",
        body: "Your request is approved. We are preparing the next step.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "info",
        guestCanAct: false,
      };
    case "confirmed":
      return {
        headline: "Your stay is confirmed",
        body: "Your booking is confirmed. We will send your stay access details closer to arrival.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "success",
        guestCanAct: false,
      };
    case "in_house":
      return {
        headline: "Welcome — you are in-house",
        body: "We hope your stay is wonderful. Reach out to your concierge any time.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "success",
        guestCanAct: false,
      };
    case "completed":
      return {
        headline: "Stay completed",
        body: "Thank you for staying with us. We would love to see you again.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "info",
        guestCanAct: false,
      };
    case "expired":
      return {
        headline: "This hold has expired",
        body: "The temporary hold is no longer active. You may request the dates again if they are still available.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "warning",
        guestCanAct: false,
      };
    case "cancelled":
      return {
        headline: "This request was cancelled",
        body: "If this was unexpected, please reach out to our concierge team.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "warning",
        guestCanAct: false,
      };
    case "rejected":
      return {
        headline: "We could not confirm this request",
        body: "Unfortunately we are not able to confirm this booking. Our concierge team will follow up with alternatives if applicable.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "warning",
        guestCanAct: false,
      };
    case "failed":
      return {
        headline: "Payment did not go through",
        body: "We were not able to confirm the deposit. Please contact our concierge team to retry.",
        nextActionLabel: null,
        nextActionHref: null,
        severity: "critical",
        guestCanAct: false,
      };
  }
}

// -----------------------------------------------------------------------------
// Sanitisation — drop any internal field a caller might pass through
// -----------------------------------------------------------------------------

const BANNED_NOTIFICATION_KEYS = new Set([
  "providerSessionId",
  "provider_session_id",
  "providerAccountId",
  "provider_account_id",
  "providerPaymentId",
  "provider_payment_id",
  "holdTokenHash",
  "hold_token_hash",
  "tokenHash",
  "tokenPrefix",
  "token_prefix",
  "depositId",
  "deposit_id",
  "financeLinkId",
  "finance_link_id",
  "revenueLineId",
  "revenue_line_id",
  "statementPeriodId",
  "statement_period_id",
  "webhookPayload",
  "webhook_payload",
  "webhookEventId",
  "webhook_event_id",
  "configPrivateEncrypted",
  "config_private_encrypted",
  "internalNotes",
  "internal_notes",
  "rejectionInternalReason",
  "rejection_internal_reason",
  "decisionNote",
  "decision_note",
]);

/**
 * Pure: drop banned fields from a notification payload before it is
 * persisted on `direct_booking_guest_notifications`.  Belt-and-braces
 * protection in case a caller passes an object literal with extra
 * fields by accident.
 */
export function sanitizeGuestNotificationPayload<
  T extends Record<string, unknown>,
>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (BANNED_NOTIFICATION_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

// -----------------------------------------------------------------------------
// Stage transition → notification
// -----------------------------------------------------------------------------

export interface StageTransitionContext {
  token: string;
  holdId: string;
  requestId: string | null;
  depositId: string | null;
  bookingId: string | null;
}

export interface QueuedNotification {
  notificationKey: string;
  publicTitle: string;
  publicBody: string;
  publicActionLabel: string | null;
  publicActionHref: string | null;
  severity: "info" | "success" | "warning" | "critical";
  dedupeKey: string;
}

/**
 * Pure: compute the guest-facing notification (if any) for a stage
 * transition.  Returns null when the transition is a no-op or has no
 * meaningful guest-facing message.
 */
export function buildNotificationForStageTransition(
  prevStage: PublicGuestStage | null,
  nextStage: PublicGuestStage,
  ctx: StageTransitionContext,
): QueuedNotification | null {
  if (prevStage === nextStage) return null;
  const anchor =
    ctx.bookingId ?? ctx.depositId ?? ctx.requestId ?? ctx.holdId;
  switch (nextStage) {
    case "request_submitted":
      return {
        notificationKey: "request_received",
        publicTitle: "Request received",
        publicBody:
          "Thank you. Your direct booking request has been received and is now in our concierge queue.",
        publicActionLabel: "View status",
        publicActionHref: STATUS_PATH(ctx.token),
        severity: "info",
        dedupeKey: `dbg:request_received:${anchor}`,
      };
    case "under_review":
      return {
        notificationKey: "request_under_review",
        publicTitle: "Under review",
        publicBody:
          "A concierge has picked up your request and is reviewing availability and the details you shared.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "info",
        dedupeKey: `dbg:under_review:${anchor}`,
      };
    case "deposit_required":
      return {
        notificationKey: "deposit_requested",
        publicTitle: "Deposit requested",
        publicBody:
          "Your request was approved. Please continue to the deposit step to confirm your booking.",
        publicActionLabel: "Open deposit page",
        publicActionHref: DEPOSIT_PATH(ctx.token),
        severity: "warning",
        dedupeKey: `dbg:deposit_requested:${anchor}`,
      };
    case "deposit_pending_confirmation":
      return {
        notificationKey: "guest_claimed_paid",
        publicTitle: "Payment confirmation received",
        publicBody:
          "Thank you. We are verifying the deposit and will update your booking shortly.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "info",
        dedupeKey: `dbg:guest_claimed_paid:${anchor}`,
      };
    case "deposit_confirmed":
      return {
        notificationKey: "deposit_marked_paid",
        publicTitle: "Deposit confirmed",
        publicBody:
          "Your deposit is recorded. We are issuing your booking confirmation now.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "success",
        dedupeKey: `dbg:deposit_marked_paid:${anchor}`,
      };
    case "confirmed":
      return {
        notificationKey: "booking_confirmed",
        publicTitle: "Your booking is confirmed",
        publicBody:
          "Your booking is confirmed. We will send your stay access details closer to arrival.",
        publicActionLabel: "View status",
        publicActionHref: STATUS_PATH(ctx.token),
        severity: "success",
        dedupeKey: `dbg:booking_confirmed:${anchor}`,
      };
    case "expired":
      return {
        notificationKey: "hold_expired",
        publicTitle: "This hold has expired",
        publicBody:
          "The temporary hold is no longer active. You may request the dates again if they are still available.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "warning",
        dedupeKey: `dbg:expired:${anchor}`,
      };
    case "cancelled":
      return {
        notificationKey: "request_cancelled",
        publicTitle: "Request cancelled",
        publicBody: "Your direct booking request has been cancelled.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "warning",
        dedupeKey: `dbg:cancelled:${anchor}`,
      };
    case "rejected":
      return {
        notificationKey: "request_rejected",
        publicTitle: "We could not confirm your request",
        publicBody:
          "Unfortunately we are not able to confirm this booking. Our concierge team will follow up if alternatives are available.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "warning",
        dedupeKey: `dbg:rejected:${anchor}`,
      };
    case "failed":
      return {
        notificationKey: "deposit_failed",
        publicTitle: "Payment did not go through",
        publicBody:
          "We were not able to confirm the deposit. Please contact our concierge team to retry.",
        publicActionLabel: null,
        publicActionHref: null,
        severity: "critical",
        dedupeKey: `dbg:deposit_failed:${anchor}`,
      };
    case "approved":
    case "in_house":
    case "completed":
    case "quote_held":
      return null;
  }
}

// -----------------------------------------------------------------------------
// Timeline
// -----------------------------------------------------------------------------

export interface TimelineStep {
  key: string;
  label: string;
  state: "complete" | "active" | "pending" | "warning";
  occurredAt: string | null;
}

const TIMELINE_KEYS = [
  "quote_held",
  "request_submitted",
  "under_review",
  "deposit_required",
  "deposit_pending_confirmation",
  "deposit_confirmed",
  "confirmed",
] as const;

const TIMELINE_LABELS: Record<(typeof TIMELINE_KEYS)[number], string> = {
  quote_held: "Hold ready",
  request_submitted: "Request received",
  under_review: "Under review",
  deposit_required: "Deposit requested",
  deposit_pending_confirmation: "Payment claimed",
  deposit_confirmed: "Deposit confirmed",
  confirmed: "Booking confirmed",
};

/**
 * Pure: build a guest-facing timeline.  Notifications are joined into
 * the same sequence so each milestone shows when it occurred.
 */
export function buildGuestTimeline(
  stage: PublicGuestStage,
  notifications: ReadonlyArray<{
    notificationKey: string;
    createdAt: string;
  }>,
): TimelineStep[] {
  const stageOrder: PublicGuestStage[] = [
    "quote_held",
    "request_submitted",
    "under_review",
    "deposit_required",
    "deposit_pending_confirmation",
    "deposit_confirmed",
    "confirmed",
  ];
  const idxOfStage = stageOrder.indexOf(stage);
  const out: TimelineStep[] = TIMELINE_KEYS.map((k, i) => {
    const ts = notifications.find((n) =>
      mapNotificationKeyToTimelineKey(n.notificationKey) === k,
    )?.createdAt ?? null;
    let state: TimelineStep["state"];
    if (
      stage === "expired" ||
      stage === "cancelled" ||
      stage === "rejected" ||
      stage === "failed"
    ) {
      state = i === 0 ? "complete" : "warning";
    } else if (idxOfStage === -1) {
      state = i === 0 ? "active" : "pending";
    } else if (i < idxOfStage) {
      state = "complete";
    } else if (i === idxOfStage) {
      state = "active";
    } else {
      state = "pending";
    }
    return { key: k, label: TIMELINE_LABELS[k], state, occurredAt: ts };
  });
  return out;
}

function mapNotificationKeyToTimelineKey(
  k: string,
): (typeof TIMELINE_KEYS)[number] | null {
  switch (k) {
    case "request_received":
      return "request_submitted";
    case "request_under_review":
      return "under_review";
    case "deposit_requested":
      return "deposit_required";
    case "guest_claimed_paid":
      return "deposit_pending_confirmation";
    case "deposit_marked_paid":
      return "deposit_confirmed";
    case "booking_confirmed":
      return "confirmed";
    default:
      return null;
  }
}
