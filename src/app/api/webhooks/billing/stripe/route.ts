/**
 * Stage 7.D — Stripe billing webhook endpoint.
 *
 * Separate from the existing payment-intents webhook (Stage 6.P3) so the
 * subscription / invoice events have their own audit trail + retry
 * surface. Verifies the Stripe-Signature header against
 * `STRIPE_BILLING_WEBHOOK_SECRET` (distinct from the payment webhook
 * secret).
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/payment-processors/providers/stripe/provider";
import { applyStripeWebhook } from "@/lib/billing/stripe-subscription-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json(
      { ok: false, reason: "STRIPE_BILLING_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature") ?? "";
  const rawBody = await request.text();

  const verified = verifyStripeSignature({
    rawBody,
    signatureHeader: signature,
    secret,
    toleranceMs: 5 * 60 * 1000,
  });
  if (!verified) {
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 },
    );
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  if (
    typeof event !== "object" ||
    event === null ||
    typeof event.type !== "string" ||
    typeof event.id !== "string"
  ) {
    return NextResponse.json(
      { ok: false, reason: "malformed_event" },
      { status: 400 },
    );
  }

  const result = await applyStripeWebhook(event);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 200 }, // don't trigger Stripe retries for unrecognized events
    );
  }

  return NextResponse.json({
    ok: true,
    appliedTransitions: result.appliedTransitions,
    events: result.events,
  });
}
