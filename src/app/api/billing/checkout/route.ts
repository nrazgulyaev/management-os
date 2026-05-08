/**
 * Stage 9.B — Stripe Checkout Session creator.
 *
 * POST /api/billing/checkout
 *   body: { plan_code: string, billing_cycle?: 'monthly' | 'annual' }
 *
 * Resolves the requested plan, looks up the matching Stripe `price_id`
 * on `subscription_plans`, and creates a Checkout Session for the
 * caller's org. Returns the session URL — the client redirects there.
 *
 * On success:
 *   { ok: true, sessionUrl: 'https://checkout.stripe.com/...' }
 *
 * On Stripe-not-configured (live keys deferred per Stage 9.A):
 *   { ok: false, reason: 'stripe_not_configured' }  (HTTP 503)
 *
 * On unknown plan / missing price:
 *   { ok: false, reason: 'plan_not_purchasable' }  (HTTP 400)
 *
 * Auth: requires the operator to be signed in. The org is resolved via
 * the same ARCONIQUE_DEFAULT fallback the rest of dev-os uses (Stage
 * 7.E tenant subdomain wiring TBD).
 *
 * The completed session fires `checkout.session.completed` to
 * `/api/webhooks/billing/stripe` (Stage 7.D bridge), which sets
 * `org_subscriptions.stripe_customer_id` + `stripe_subscription_id`
 * + flips status appropriately.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { subscriptionPlans, orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { StripeClient } from "@/lib/payment-processors/providers/stripe/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  plan_code: z.string().min(1).max(40),
  billing_cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

interface CheckoutResult {
  ok: boolean;
  reason?: string;
  sessionUrl?: string;
}

function readStripeKeys(): {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
} | null {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? "";
  if (!secretKey || !publishableKey) return null;
  return { secretKey, publishableKey, webhookSecret };
}

export async function POST(request: NextRequest): Promise<NextResponse<CheckoutResult>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: parsed.error.issues[0]?.message ?? "invalid_input",
      },
      { status: 400 },
    );
  }

  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return NextResponse.json({ ok: false, reason: "no_org_context" }, { status: 500 });
  }

  const stripeKeys = readStripeKeys();
  if (!stripeKeys) {
    // Stage 9.A defers live Stripe activation. UI surface 9.B is
    // ready; the moment STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY
    // land on Vercel, this endpoint flips from 503 to live without a
    // code change.
    return NextResponse.json(
      { ok: false, reason: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const db = requireDb();
  const plan = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.planCode, parsed.data.plan_code))
    .limit(1)
    .then((rows) => rows[0]);
  if (!plan) {
    return NextResponse.json(
      { ok: false, reason: "plan_not_found" },
      { status: 400 },
    );
  }
  const priceId =
    parsed.data.billing_cycle === "annual"
      ? plan.stripeAnnualPriceId
      : plan.stripeMonthlyPriceId;
  if (!priceId) {
    // The plan exists but no Stripe price is mapped — common for
    // 'internal' / 'trial' tiers. Surface the reason precisely.
    return NextResponse.json(
      { ok: false, reason: "plan_not_purchasable" },
      { status: 400 },
    );
  }

  // Reuse the active subscription's stripe_customer_id when present so
  // the checkout flow attaches to the existing customer record (no
  // duplicate Stripe customers per org).
  const activeSub = await db
    .select({
      stripeCustomerId: orgSubscriptions.stripeCustomerId,
    })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, org.id))
    .limit(1)
    .then((rows) => rows[0]);

  const baseUrl =
    env.server.APP_BASE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;
  const successUrl = `${baseUrl}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/dashboard/billing/upgrade?checkout=cancelled`;

  const client = new StripeClient({
    provider: "stripe",
    secretKey: stripeKeys.secretKey,
    publishableKey: stripeKeys.publishableKey,
    webhookSecret: stripeKeys.webhookSecret,
    mode: stripeKeys.secretKey.startsWith("sk_live_") ? "live" : "test",
  });

  // Stripe form-encoded body. The Stripe API accepts
  // line_items[0][price] / line_items[0][quantity], etc.
  const sessionInput: Record<string, unknown> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "metadata[organization_id]": org.id,
    "metadata[plan_code]": plan.planCode,
    "metadata[billing_cycle]": parsed.data.billing_cycle,
    "metadata[triggered_by_app_user_id]": me.id,
    client_reference_id: org.id,
    allow_promotion_codes: "true",
  };
  if (activeSub?.stripeCustomerId) {
    sessionInput.customer = activeSub.stripeCustomerId;
  }
  if (plan.trialPeriodDays > 0) {
    sessionInput["subscription_data[trial_period_days]"] = plan.trialPeriodDays;
  }

  let session: { id?: string; url?: string };
  try {
    session = (await client.createCheckoutSession(sessionInput)) as {
      id?: string;
      url?: string;
    };
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: `stripe_error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`,
      },
      { status: 502 },
    );
  }
  if (!session?.url) {
    return NextResponse.json(
      { ok: false, reason: "stripe_returned_no_url" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sessionUrl: session.url }, { status: 200 });
}
