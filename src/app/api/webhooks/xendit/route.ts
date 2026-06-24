import { type NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyers } from "@/lib/db/schema/buyers";
import {
  paymentAttempts,
  paymentIntents,
  paymentProcessorConnections,
} from "@/lib/db/schema/payment-processors";
import { recordAuditEvent } from "@/features/audit/services";
import { openCredentials } from "@/lib/secure-connection-credentials";
import { selectPaymentProvider } from "@/lib/payment-processors/select-provider";
import { majorToMinor } from "@/lib/payment-processors/providers/xendit/provider";
import type { PaymentCredentials } from "@/lib/payment-processors/types";
import { settleContractMilestonePaid } from "@/features/payments/installment-settlement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Xendit webhook — invoice callbacks (PAID / EXPIRED).
 *
 * Verification model: Xendit does not sign payloads; every callback
 * carries the account's static callback verification token in
 * `x-callback-token`. Tokens are PER-ORG (stored encrypted on the org's
 * connection row), so the org is resolved FIRST by looking up the
 * payment intent the callback references, THEN the header is
 * constant-time compared against that org's stored token. Anything
 * unverifiable → 401 + audit event. Never a silent 200.
 *
 * Idempotent: an intent already in the callback's target state (or
 * already succeeded) is acknowledged without re-writing; milestone
 * settlement itself tolerates replays (already-paid → no-op).
 *
 * Settlement goes through the SAME core as manual mark-paid
 * (src/features/payments/installment-settlement.ts) — no parallel
 * money logic.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const callbackToken = request.headers.get("x-callback-token") ?? "";

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const invoiceId = typeof payload["id"] === "string" ? payload["id"] : null;
  if (!invoiceId) {
    return NextResponse.json(
      { ok: false, error: "missing_invoice_id" },
      { status: 400 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  }

  // Resolve the intent + its org's Xendit connection. Without a matching
  // intent there is no org token to verify against — reject and audit.
  const [match] = await db
    .select({
      intent: paymentIntents,
      connection: paymentProcessorConnections,
    })
    .from(paymentIntents)
    .innerJoin(
      paymentProcessorConnections,
      eq(paymentIntents.processorConnectionId, paymentProcessorConnections.id),
    )
    .where(
      and(
        eq(paymentIntents.externalIntentId, invoiceId),
        eq(paymentProcessorConnections.provider, "xendit"),
      ),
    )
    .limit(1);

  if (!match) {
    await recordAuditEvent({
      actorUserId: null,
      action: "payments.webhook.unmatched",
      entityType: "payment_webhook",
      entityId: invoiceId,
      after: { provider: "xendit", reason: "no_matching_payment_intent" },
    });
    return NextResponse.json(
      { ok: false, error: "unverified" },
      { status: 401 },
    );
  }

  const { intent, connection } = match;

  const credentials = openCredentials<PaymentCredentials>(
    connection.credentials,
  );
  const provider = selectPaymentProvider("xendit", credentials);
  const storedToken =
    credentials?.provider === "xendit" ? credentials.callbackToken : "";

  // Constant-time token check. DryRun (missing creds) fail-closes.
  const verified = provider.verifyWebhook(rawBody, callbackToken, storedToken);
  if (!verified) {
    await recordAuditEvent({
      actorUserId: null,
      action: "payments.webhook.rejected",
      entityType: "payment_intent",
      entityId: intent.id,
      after: {
        provider: "xendit",
        externalIntentId: invoiceId,
        reason: "callback_token_mismatch",
      },
    });
    return NextResponse.json(
      { ok: false, error: "unverified" },
      { status: 401 },
    );
  }

  const event = provider.parseWebhook(payload);
  if (!event || !event.lifecycleState) {
    // Verified but not a status we act on — acknowledge with an audit
    // trace so nothing disappears silently.
    await recordAuditEvent({
      actorUserId: null,
      action: "payments.webhook.ignored",
      entityType: "payment_intent",
      entityId: intent.id,
      after: {
        provider: "xendit",
        eventType: event?.eventType ?? "unknown",
        externalIntentId: invoiceId,
      },
    });
    return NextResponse.json({ ok: true, handled: false });
  }

  const nextState = event.lifecycleState;

  // Idempotency: already in the target state, or already terminal-paid —
  // acknowledge without re-writing money rows.
  if (intent.lifecycleState === nextState || intent.lifecycleState === "succeeded") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // SETTLEMENT GUARD (only for the money-settling transition): the callback
  // must actually pay the amount + currency we invoiced. Xendit's invoice
  // PAID callback carries `paid_amount` (major units) + `currency`. We
  // compare against the intent we created (its `amountMinor` is the
  // contract-fixed IDR amount we asked Xendit to collect). A wrong/short
  // payment, or a payment in the wrong currency, MUST NOT mark the
  // milestone paid — flag it and reject so a human reconciles it.
  if (nextState === "succeeded") {
    const rawPaid = payload["paid_amount"];
    const paidAmountMinor =
      typeof rawPaid === "number" ? majorToMinor(rawPaid) : null;
    const paidCurrency =
      typeof payload["currency"] === "string"
        ? (payload["currency"] as string).toUpperCase()
        : null;
    const expectedMinor = intent.amountMinor;
    const expectedCurrency = intent.currency.toUpperCase();

    // Tolerance: the IDR invoice amount is derived by bigint division
    // (sen-level truncation) and Xendit settles whole IDR, so allow a tiny
    // rounding slack but never a real short payment. 1 storage minor unit.
    const TOLERANCE_MINOR = 1n;
    const amountOk =
      paidAmountMinor !== null &&
      paidAmountMinor >= expectedMinor - TOLERANCE_MINOR;
    const currencyOk =
      paidCurrency !== null && paidCurrency === expectedCurrency;

    if (!amountOk || !currencyOk) {
      await recordAuditEvent({
        actorUserId: null,
        action: "payments.webhook.amount_mismatch",
        entityType: "payment_intent",
        entityId: intent.id,
        before: { lifecycleState: intent.lifecycleState },
        after: {
          provider: "xendit",
          externalIntentId: invoiceId,
          reason: !currencyOk ? "currency_mismatch" : "amount_short_or_missing",
          expectedAmountMinor: expectedMinor.toString(),
          expectedCurrency,
          paidAmountMinor: paidAmountMinor?.toString() ?? null,
          paidCurrency,
        },
        metadata: {
          organizationId: intent.organizationId,
          connectionId: connection.id,
          milestoneId: intent.linkedContractMilestoneId,
        },
      });
      // Do NOT settle. 422 so Xendit retries are surfaced (and a human can
      // reconcile) rather than silently swallowing an underpayment as paid.
      return NextResponse.json(
        { ok: false, error: "amount_or_currency_mismatch" },
        { status: 422 },
      );
    }
  }

  const now = new Date();
  await db
    .update(paymentIntents)
    .set({
      lifecycleState: nextState,
      externalStatus:
        typeof payload["status"] === "string"
          ? (payload["status"] as string)
          : intent.externalStatus,
      completedAt: nextState === "succeeded" ? now : intent.completedAt,
      cancelledAt: nextState === "cancelled" ? now : intent.cancelledAt,
      rawPayload: payload as never,
      updatedAt: now,
    })
    .where(eq(paymentIntents.id, intent.id));

  // Append-only attempt trace.
  const paidAmount =
    typeof payload["paid_amount"] === "number"
      ? majorToMinor(payload["paid_amount"] as number)
      : intent.amountMinor;
  const methodType =
    typeof payload["payment_method"] === "string"
      ? (payload["payment_method"] as string)
      : null;
  const paymentChannel =
    typeof payload["payment_channel"] === "string"
      ? (payload["payment_channel"] as string)
      : null;
  await db.insert(paymentAttempts).values({
    organizationId: intent.organizationId,
    paymentIntentId: intent.id,
    externalAttemptId:
      typeof payload["payment_id"] === "string"
        ? (payload["payment_id"] as string)
        : `${invoiceId}:${event.eventType}`,
    methodType,
    methodDetails: paymentChannel ? { channel: paymentChannel } : null,
    status: nextState,
    amountMinor: paidAmount,
    currency: intent.currency,
    rawPayload: payload as never,
  });

  // Connection stats.
  await db
    .update(paymentProcessorConnections)
    .set({
      lastEventAt: now,
      ...(nextState === "succeeded"
        ? {
            totalPaymentsProcessed: sql`${paymentProcessorConnections.totalPaymentsProcessed} + 1`,
            totalVolumeMinor: sql`${paymentProcessorConnections.totalVolumeMinor} + ${paidAmount}`,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(paymentProcessorConnections.id, connection.id));

  // Settle the linked buyer installment through the SHARED core (same
  // path manual mark-paid uses). Replay-safe: already-paid is a no-op.
  let settlement: { settled: boolean; alreadyPaid?: boolean; error?: string } = {
    settled: false,
  };
  if (nextState === "succeeded" && intent.linkedContractMilestoneId) {
    let buyerName = intent.customerName ?? "Buyer";
    let buyerCode = "";
    if (intent.linkedBuyerId) {
      const [buyerRow] = await db
        .select({
          displayName: buyers.displayName,
          buyerCode: buyers.buyerCode,
        })
        .from(buyers)
        .where(eq(buyers.id, intent.linkedBuyerId))
        .limit(1);
      if (buyerRow) {
        buyerName = buyerRow.displayName;
        buyerCode = buyerRow.buyerCode;
      }
    }
    const channelLabel = paymentChannel ?? methodType ?? "online";
    const result = await settleContractMilestonePaid({
      milestoneId: intent.linkedContractMilestoneId,
      methodLabel: `Xendit online payment (${channelLabel})`,
      noteLine: `Paid online via Xendit invoice ${invoiceId} (${channelLabel}).`,
      buyerName,
      buyerCode,
      auditAction: "contract_milestone.online_paid",
      auditMetadata: {
        buyerId: intent.linkedBuyerId,
        paymentIntentId: intent.id,
        externalIntentId: invoiceId,
        provider: "xendit",
        channel: "xendit_webhook",
      },
    });
    settlement = result.ok
      ? { settled: !result.alreadyPaid, alreadyPaid: result.alreadyPaid }
      : { settled: false, error: result.error };
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "payments.webhook.xendit",
    entityType: "payment_intent",
    entityId: intent.id,
    before: { lifecycleState: intent.lifecycleState },
    after: {
      lifecycleState: nextState,
      eventType: event.eventType,
      externalIntentId: invoiceId,
      paidAmountMinor: paidAmount.toString(),
      currency: intent.currency,
      settlement,
    },
    metadata: {
      organizationId: intent.organizationId,
      connectionId: connection.id,
      milestoneId: intent.linkedContractMilestoneId,
    },
  });

  return NextResponse.json({ ok: true, lifecycleState: nextState });
}
