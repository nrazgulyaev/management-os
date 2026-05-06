import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { directBookingRequests } from "@/lib/db/schema/direct-booking";
import { villas } from "@/lib/db/schema/projects";
import { quoteDynamicStay } from "@/features/dynamic-pricing/services";
import { createQuoteLog } from "@/features/dynamic-pricing/services";
import {
  buildHoldSnapshotFromQuote,
  canCreateHold,
  publicHoldStatusLabel,
  type HoldStatus,
} from "./hold-pure";
import {
  defaultHoldExpiry,
  generateHoldToken,
  hashHoldToken,
  hashPublicIp,
  hashUserAgent,
  holdTokenPrefix,
} from "./token";
import {
  appendRequestEvent,
  checkAndRecordRateLimit,
  getHoldByTokenHash,
  insertHold,
  insertRequest,
  updateHoldStatus,
  upsertGuestByEmail,
} from "./services";
import {
  assertHoldDatesStillAvailable,
  createInternalHoldBlockForDirectHold,
  releaseInternalHoldBlockForDirectHold,
} from "./availability";
import { notifyRequestSubmitted } from "./notifications";
import {
  createHoldRequestSchema,
  submitHoldFormSchema,
  type CreateHoldRequestInput,
  type SubmitHoldFormInput,
} from "./schema";
import {
  appendDepositEvent,
  ensureDepositForRequest,
  getDepositForHold,
  getDepositForRequest,
} from "./deposits";
import { publicDepositStatusLabel } from "./deposits-pure";
import { queueNotification } from "@/features/notifications/services";
import {
  calculateBalanceDue,
  publicDirectBookingStageSummary,
} from "./finance-pure";
import { directBookingDepositEvents } from "@/lib/db/schema/payments";
import { syncGuestStatusForChain } from "./guest-status-lifecycle";

// =============================================================================
// POST /api/v1/holds
// =============================================================================

export interface CreateHoldOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

const HOLD_TTL_MINUTES = 15;

export async function handleCreateHold(args: {
  input: unknown;
  ip: string | null;
  userAgent: string | null;
}): Promise<CreateHoldOutcome> {
  const parsed = createHoldRequestSchema.safeParse(args.input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        reason: "invalid_input",
        errors: parsed.error.issues.slice(0, 3).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    };
  }
  const ipHash = hashPublicIp(args.ip) ?? "anonymous";
  const rate = await checkAndRecordRateLimit({
    ipHash,
    maxHolds: 5,
    windowMinutes: 10,
    blockMinutes: 30,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
        reason: rate.reason ?? "rate_limited",
        retryAfterSeconds: rate.retryAfterSeconds ?? 60,
      },
    };
  }

  const data = parsed.data as CreateHoldRequestInput;

  // Quote.
  let quoteResult;
  try {
    quoteResult = await quoteDynamicStay({
      villaId: data.villaId,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      channelKey: data.channelKey,
      publicQuote: true,
    });
  } catch {
    return {
      ok: false,
      status: 500,
      body: { ok: false, reason: "quote_failed" },
    };
  }
  if (!quoteResult.ruleSet) {
    return {
      ok: false,
      status: 409,
      body: { ok: false, reason: "no_pricing_engine" },
    };
  }
  const stay = quoteResult.stay;
  const guard = canCreateHold({
    available: stay.available,
    reason: stay.reason,
    totalMinor: stay.totalMinor,
    averageNightlyMinor: stay.averageNightlyMinor,
    nights: stay.nights,
    currency: stay.currency,
    channelKey: data.channelKey,
    nightly: stay.nightly.map((n) => ({
      date: n.date,
      rateMinor: n.finalRateMinor,
      available: n.available,
    })),
  });
  if (!guard.ok) {
    return {
      ok: false,
      status: 409,
      body: {
        ok: false,
        reason: collapsePublicReason(guard.reason),
      },
    };
  }

  // Availability check (defends against race between quote + insert).
  const avail = await assertHoldDatesStillAvailable(
    data.villaId,
    data.checkIn,
    data.checkOut,
  );
  if (!avail.available) {
    return {
      ok: false,
      status: 409,
      body: { ok: false, reason: "unavailable" },
    };
  }

  // Lookup villa to get project id.
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, reason: "no_db" },
    };
  }
  const [villa] = await db
    .select({ projectId: villas.projectId, name: villas.name, code: villas.unitCode })
    .from(villas)
    .where(eq(villas.id, data.villaId))
    .limit(1);
  if (!villa) {
    return {
      ok: false,
      status: 404,
      body: { ok: false, reason: "villa_not_found" },
    };
  }

  const rawToken = generateHoldToken();
  const tokenHash = hashHoldToken(rawToken);
  const tokenPrefix = holdTokenPrefix(rawToken);
  const expiresAt = defaultHoldExpiry(HOLD_TTL_MINUTES);
  const holdCode = `HLD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Persist a quote log keyed to the hold (best-effort).
  const quoteLogId = await createQuoteLog({
    villaId: data.villaId,
    projectId: villa.projectId,
    channelKey: data.channelKey,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: stay.nights,
    available: stay.available,
    reason: stay.reason,
    totalMinor: stay.totalMinor,
    currency: stay.currency,
    requestIpHash: hashPublicIp(args.ip),
    userAgentHash: hashUserAgent(args.userAgent),
    publicQuote: true,
    ruleSetId: quoteResult.ruleSet.id,
  }).catch(() => null);

  const snapshot = buildHoldSnapshotFromQuote({
    available: stay.available,
    reason: stay.reason,
    totalMinor: stay.totalMinor,
    averageNightlyMinor: stay.averageNightlyMinor,
    nights: stay.nights,
    currency: stay.currency,
    channelKey: data.channelKey,
    ruleSetId: quoteResult.ruleSet.id,
    nightly: stay.nightly.map((n) => ({
      date: n.date,
      rateMinor: n.finalRateMinor,
      available: n.available,
    })),
  });

  const hold = await insertHold({
    holdCode,
    holdTokenHash: tokenHash,
    tokenPrefix,
    villaId: data.villaId,
    projectId: villa.projectId,
    quoteLogId: quoteLogId ?? null,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: stay.nights,
    guestCount: data.guestCount,
    channelKey: data.channelKey,
    currency: stay.currency,
    totalMinor: stay.totalMinor,
    averageNightlyMinor: stay.averageNightlyMinor,
    quoteSnapshotJson: snapshot,
    status: "active",
    expiresAt,
    sourceIpHash: hashPublicIp(args.ip),
    userAgentHash: hashUserAgent(args.userAgent),
  });
  if (!hold) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, reason: "hold_insert_failed" },
    };
  }
  await createInternalHoldBlockForDirectHold(hold.id);
  await syncGuestStatusForChain({ holdId: hold.id, token: rawToken });

  return {
    ok: true,
    status: 201,
    body: {
      ok: true,
      holdToken: rawToken,
      holdCode,
      expiresAt: expiresAt.toISOString(),
      currency: stay.currency,
      nights: stay.nights,
      totalMinor: stay.totalMinor.toString(),
      averageNightlyMinor: stay.averageNightlyMinor.toString(),
      villa: { name: villa.name, code: villa.code },
      nextUrl: `/book/hold/${rawToken}`,
    },
  };
}

// =============================================================================
// GET /api/v1/holds/{token}
// =============================================================================

export interface PublicHoldView {
  holdCode: string;
  villa: { label: string };
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  totalMinor: string;
  averageNightlyMinor: string;
  /** Prompt 107 — guest-safe balance due (total - deposit, ≥ 0). */
  balanceDueMinor: string;
  balanceDueFormatted: string;
  currency: string;
  expiresAt: string;
  status: HoldStatus;
  statusLabel: string;
  /** Prompt 107 — collapsed public stage. */
  publicStage: string;
  nextAction: string | null;
}

export async function handleGetHold(token: string): Promise<{
  status: number;
  body: PublicHoldView | { ok: false; reason: string };
}> {
  const tokenHash = hashHoldToken(token);
  const hold = await getHoldByTokenHash(tokenHash);
  if (!hold) return { status: 404, body: { ok: false, reason: "not_found" } };
  const db = getDb();
  let villaLabel = "Villa";
  let request:
    | { status: string }
    | null = null;
  let deposit:
    | { status: string; guestClaimedPaid: boolean; amountMinor: bigint }
    | null = null;
  if (db) {
    const [villa] = await db
      .select({ name: villas.name, code: villas.unitCode })
      .from(villas)
      .where(eq(villas.id, hold.villaId))
      .limit(1);
    villaLabel = villa?.name ?? villa?.code ?? "Villa";
    const [req] = await db
      .select({ status: directBookingRequests.status })
      .from(directBookingRequests)
      .where(eq(directBookingRequests.holdId, hold.id))
      .limit(1);
    request = req ?? null;
    const dep = await loadLatestDepositSummary(hold.id);
    deposit = dep;
  }
  const labelInfo = publicHoldStatusLabel(hold.status as HoldStatus);
  const balanceDue = calculateBalanceDue(
    hold.totalMinor,
    deposit?.amountMinor ?? 0n,
  );
  const stage = publicDirectBookingStageSummary({
    hold: { status: hold.status },
    request: request
      ? { status: request.status as Parameters<typeof publicDirectBookingStageSummary>[0]["request"] extends infer X ? X extends { status: infer S } ? S : never : never }
      : null,
    deposit: deposit
      ? {
          status: deposit.status as Parameters<typeof publicDirectBookingStageSummary>[0]["deposit"] extends infer X ? X extends { status: infer S } ? S : never : never,
          guestClaimedPaid: deposit.guestClaimedPaid,
        }
      : null,
    booking: null,
  });
  return {
    status: 200,
    body: {
      holdCode: hold.holdCode,
      villa: { label: villaLabel },
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
      nights: hold.nights,
      guestCount: hold.guestCount,
      totalMinor: hold.totalMinor.toString(),
      averageNightlyMinor: hold.averageNightlyMinor.toString(),
      balanceDueMinor: balanceDue.toString(),
      balanceDueFormatted: formatPublicMoney(balanceDue, hold.currency),
      currency: hold.currency,
      expiresAt: hold.expiresAt.toISOString(),
      status: hold.status as HoldStatus,
      statusLabel: labelInfo.label,
      publicStage: stage.current,
      nextAction: stage.nextAction,
    },
  };
}

// =============================================================================
// POST /api/v1/holds/{token}/submit
// =============================================================================

export async function handleSubmitHold(args: {
  token: string;
  input: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const parsed = submitHoldFormSchema.safeParse(args.input);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        ok: false,
        reason: "invalid_input",
        errors: parsed.error.issues.slice(0, 3).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    };
  }
  const data = parsed.data as SubmitHoldFormInput;
  if (!data.termsAccepted) {
    return {
      status: 400,
      body: { ok: false, reason: "terms_not_accepted" },
    };
  }

  const tokenHash = hashHoldToken(args.token);
  const hold = await getHoldByTokenHash(tokenHash);
  if (!hold)
    return { status: 404, body: { ok: false, reason: "not_found" } };
  if (hold.status !== "active") {
    return {
      status: 409,
      body: { ok: false, reason: `hold_${hold.status}` },
    };
  }
  if (hold.expiresAt.getTime() <= Date.now()) {
    await updateHoldStatus(hold.id, "expired");
    await releaseInternalHoldBlockForDirectHold(hold.id);
    return {
      status: 409,
      body: { ok: false, reason: "hold_expired" },
    };
  }

  // Upsert the guest record (we already validated email).
  const guestId = await upsertGuestByEmail({
    email: data.guestEmail,
    fullName: [data.guestFirstName, data.guestLastName ?? ""]
      .filter(Boolean)
      .join(" ")
      .trim(),
    phone: data.guestPhone ?? null,
    nationality: data.guestCountry ?? null,
  });

  // Insert the request.
  const requestCode = `DBR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const request = await insertRequest({
    requestCode,
    holdId: hold.id,
    villaId: hold.villaId,
    projectId: hold.projectId,
    guestId,
    guestFirstName: data.guestFirstName,
    guestLastName: data.guestLastName ?? null,
    guestEmail: data.guestEmail.trim().toLowerCase(),
    guestPhone: data.guestPhone ?? null,
    guestCountry: data.guestCountry ?? null,
    guestCount: data.guestCount,
    specialRequests: data.specialRequests ?? null,
    arrivalTime: data.arrivalTime ?? null,
    purposeOfStay: data.purposeOfStay ?? null,
    marketingConsent: data.marketingConsent ?? false,
    termsAccepted: data.termsAccepted,
    status: "submitted",
  });
  if (!request) {
    return {
      status: 500,
      body: { ok: false, reason: "request_insert_failed" },
    };
  }

  await appendRequestEvent({
    requestId: request.id,
    eventType: "request_submitted",
    actorType: "guest",
    message: "Submitted via /api/v1/holds/<token>/submit",
  });

  // Look up villa code for the notification.
  const db = getDb();
  let villaCode: string | null = null;
  if (db) {
    const [villa] = await db
      .select({ code: villas.unitCode })
      .from(villas)
      .where(eq(villas.id, hold.villaId))
      .limit(1);
    villaCode = villa?.code ?? null;
  }
  await notifyRequestSubmitted({
    requestId: request.id,
    requestCode,
    villaCode,
  });

  // Prompt 106 — create the deposit + provider session.
  const depositOutcome = await ensureDepositForRequest({
    holdId: hold.id,
    requestId: request.id,
    totalMinor: hold.totalMinor,
    currency: hold.currency,
    holdToken: args.token,
  });
  if (depositOutcome?.deposit) {
    await appendDepositEvent({
      depositId: depositOutcome.deposit.id,
      eventType: "created",
      actorType: "system",
      message: "Deposit created on submit",
    });
    await queueNotification({
      recipientType: "role",
      channel: "in_app",
      templateKey: "direct_booking.deposit_created",
      title: "Deposit created",
      body: `Deposit ${depositOutcome.deposit.depositCode} for request ${requestCode}.`,
      dedupeKey: `deposit-created:${depositOutcome.deposit.id}`,
      payload: {
        depositId: depositOutcome.deposit.id,
        role: "finance_manager",
      },
      priority: "normal",
    });
  }
  await syncGuestStatusForChain({ holdId: hold.id, requestId: request.id, token: args.token });

  return {
    status: 200,
    body: {
      ok: true,
      requestCode,
      status: "submitted",
      message: "Request received — concierge will confirm availability.",
      deposit: depositOutcome?.deposit
        ? {
            depositCode: depositOutcome.deposit.depositCode,
            amountMinor: depositOutcome.deposit.amountMinor.toString(),
            currency: depositOutcome.deposit.currency,
            paymentUrl: depositOutcome.deposit.paymentUrl,
            status: depositOutcome.deposit.status,
            statusLabel: publicDepositStatusLabel(
              depositOutcome.deposit.status as Parameters<
                typeof publicDepositStatusLabel
              >[0],
            ).label,
          }
        : null,
    },
  };
}

// =============================================================================
// POST /api/v1/holds/{token}/cancel
// =============================================================================

export async function handleCancelHold(token: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const tokenHash = hashHoldToken(token);
  const hold = await getHoldByTokenHash(tokenHash);
  if (!hold)
    return { status: 404, body: { ok: false, reason: "not_found" } };
  if (hold.status !== "active") {
    return {
      status: 409,
      body: { ok: false, reason: `hold_${hold.status}` },
    };
  }
  await updateHoldStatus(hold.id, "cancelled");
  await releaseInternalHoldBlockForDirectHold(hold.id);
  // Append cancellation events for any submitted-state requests.
  if (db()) {
    const db1 = getDb()!;
    const linked = await db1
      .select({ id: directBookingRequests.id })
      .from(directBookingRequests)
      .where(eq(directBookingRequests.holdId, hold.id));
    for (const r of linked) {
      await appendRequestEvent({
        requestId: r.id,
        eventType: "guest_cancelled",
        actorType: "guest",
        message: "Hold cancelled by guest",
      });
    }
  }
  await syncGuestStatusForChain({ holdId: hold.id, token });
  return { status: 200, body: { ok: true, status: "cancelled" } };
}

// =============================================================================
// Public deposit endpoints
// =============================================================================

export interface PublicDepositView {
  depositCode: string;
  amountMinor: string;
  currency: string;
  status: string;
  statusLabel: string;
  paymentUrl: string | null;
  expiresAt: string | null;
  /** Public-safe message — collapses internal categories. */
  message: string;
  /** Prompt 107 — guest-safe extras. */
  balanceDueMinor: string;
  balanceDueFormatted: string;
  publicStage: string;
  nextAction: string | null;
  /** True iff the guest can still POST notify-paid. */
  canNotifyPaid: boolean;
}

export async function handleGetDepositForHold(token: string): Promise<{
  status: number;
  body: PublicDepositView | { ok: false; reason: string };
}> {
  const tokenHash = hashHoldToken(token);
  const hold = await getHoldByTokenHash(tokenHash);
  if (!hold) return { status: 404, body: { ok: false, reason: "not_found" } };
  const dbi = getDb();
  if (!dbi) return { status: 500, body: { ok: false, reason: "no_db" } };
  // The deposit attaches to a request — find the request first.
  const [request] = await dbi
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.holdId, hold.id))
    .limit(1);
  if (!request) {
    return {
      status: 200,
      body: {
        depositCode: "—",
        amountMinor: "0",
        currency: hold.currency,
        status: "pending",
        statusLabel: "Awaiting payment",
        paymentUrl: null,
        expiresAt: null,
        message: "Submit your details first — we'll create the deposit then.",
        balanceDueMinor: hold.totalMinor.toString(),
        balanceDueFormatted: formatPublicMoney(hold.totalMinor, hold.currency),
        publicStage: "quote_held",
        nextAction: "Submit your details",
        canNotifyPaid: false,
      },
    };
  }
  const deposit = await getDepositForRequest(request.id);
  if (!deposit) {
    return {
      status: 404,
      body: { ok: false, reason: "deposit_not_found" },
    };
  }
  const lab = publicDepositStatusLabel(
    deposit.status as Parameters<typeof publicDepositStatusLabel>[0],
  );
  const balance = calculateBalanceDue(
    hold.totalMinor,
    deposit.amountMinor,
  );
  // Reuse the same stage logic as the hold view.
  const events = await dbi
    .select({ eventType: directBookingDepositEvents.eventType })
    .from(directBookingDepositEvents)
    .where(eq(directBookingDepositEvents.depositId, deposit.id));
  const guestClaimedPaid = events.some(
    (e) => e.eventType === "guest_claimed_paid",
  );
  const stage = publicDirectBookingStageSummary({
    hold: { status: hold.status },
    request: {
      status: request.status as Parameters<
        typeof publicDirectBookingStageSummary
      >[0]["request"] extends infer X ? (X extends { status: infer S } ? S : never) : never,
    },
    deposit: {
      status: deposit.status as Parameters<
        typeof publicDirectBookingStageSummary
      >[0]["deposit"] extends infer X ? (X extends { status: infer S } ? S : never) : never,
      guestClaimedPaid,
    },
    booking: null,
  });
  const canNotifyPaid =
    (deposit.status === "pending" ||
      deposit.status === "draft" ||
      deposit.status === "requires_action") &&
    !guestClaimedPaid;
  return {
    status: 200,
    body: {
      depositCode: deposit.depositCode,
      amountMinor: deposit.amountMinor.toString(),
      currency: deposit.currency,
      status: deposit.status,
      statusLabel: lab.label,
      paymentUrl: deposit.paymentUrl,
      expiresAt: deposit.expiresAt?.toISOString() ?? null,
      message:
        deposit.status === "paid" ||
        deposit.status === "manually_marked_paid"
          ? "Payment confirmed — your booking will be issued shortly."
          : deposit.status === "failed" ||
              deposit.status === "expired" ||
              deposit.status === "cancelled"
            ? "Please contact concierge to arrange the deposit."
            : "Please complete the deposit. Our team will verify and confirm your booking.",
      balanceDueMinor: balance.toString(),
      balanceDueFormatted: formatPublicMoney(balance, deposit.currency),
      publicStage: stage.current,
      nextAction: stage.nextAction,
      canNotifyPaid,
    },
  };
}

/**
 * Guest reports they've paid (manual stub flow). Does NOT mark the
 * deposit paid automatically — internal staff verify and run
 * `markDepositManuallyPaidAction` to flip the row.
 */
export async function handleNotifyDepositPaid(token: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const tokenHash = hashHoldToken(token);
  const hold = await getHoldByTokenHash(tokenHash);
  if (!hold) return { status: 404, body: { ok: false, reason: "not_found" } };
  const dbi = getDb();
  if (!dbi) return { status: 500, body: { ok: false, reason: "no_db" } };
  const [request] = await dbi
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.holdId, hold.id))
    .limit(1);
  if (!request) {
    return {
      status: 409,
      body: { ok: false, reason: "no_request" },
    };
  }
  const deposit = await getDepositForRequest(request.id);
  if (!deposit) {
    return {
      status: 404,
      body: { ok: false, reason: "deposit_not_found" },
    };
  }
  // Append a guest claim event — never flips the row.
  await appendDepositEvent({
    depositId: deposit.id,
    eventType: "guest_claimed_paid",
    actorType: "guest",
    message: "Guest reports payment via stay portal",
  });
  await queueNotification({
    recipientType: "role",
    channel: "in_app",
    templateKey: "direct_booking.deposit_guest_claimed_paid",
    title: "Guest claims deposit paid",
    body: `Deposit ${deposit.depositCode} — guest reports payment. Verify before marking paid.`,
    dedupeKey: `deposit-guest-claimed:${deposit.id}`,
    payload: { depositId: deposit.id, role: "finance_manager" }, priority: "normal",
  });
  await queueNotification({
    recipientType: "role",
    channel: "in_app",
    templateKey: "direct_booking.deposit_guest_claimed_paid",
    title: "Guest claims deposit paid",
    body: `Deposit ${deposit.depositCode} — guest reports payment.`,
    dedupeKey: `deposit-guest-claimed-bm:${deposit.id}`,
    payload: { depositId: deposit.id, role: "booking_manager" }, priority: "normal",
  });
  await syncGuestStatusForChain({ depositId: deposit.id, token });
  return {
    status: 200,
    body: {
      ok: true,
      message:
        "Thanks — our team will verify and confirm your booking shortly.",
    },
  };
}

function db() {
  return getDb();
}

function formatPublicMoney(minor: bigint, currency: string): string {
  const major = minor / 100n;
  const rest = minor % 100n;
  return `${major.toString()}.${String(rest).padStart(2, "0")} ${currency}`;
}

/**
 * Look up the most recent deposit attached to a hold (via its
 * request) and check whether the guest has already submitted a
 * `guest_claimed_paid` event.
 */
async function loadLatestDepositSummary(holdId: string): Promise<{
  status: string;
  guestClaimedPaid: boolean;
  amountMinor: bigint;
} | null> {
  const dbi = getDb();
  if (!dbi) return null;
  const dep = await getDepositForHold(holdId);
  if (!dep) return null;
  const events = await dbi
    .select({ eventType: directBookingDepositEvents.eventType })
    .from(directBookingDepositEvents)
    .where(eq(directBookingDepositEvents.depositId, dep.id));
  const guestClaimedPaid = events.some(
    (e) => e.eventType === "guest_claimed_paid",
  );
  return {
    status: dep.status,
    guestClaimedPaid,
    amountMinor: dep.amountMinor,
  };
}

function collapsePublicReason(r: string): string {
  switch (r) {
    case "no_amount":
      return "no_amount";
    case "no_nights":
      return "no_nights";
    case "stop_sell":
      return "stop_sell";
    case "min_los":
      return "min_los";
    default:
      return "unavailable";
  }
}
