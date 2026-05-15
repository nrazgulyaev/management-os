/**
 * Sprint 3b — Stripe Checkout Session creator (post packaging rewrite).
 *
 * POST /api/billing/checkout
 *   body: { packaging_key: PackagingKey, billing_cycle?: 'monthly' | 'annual' }
 *
 * Sprint 3b replaced the Stage-9.B `plan_code` input with the Sprint-3a
 * `packaging_key` (one of "mgmt-only-pro", "bundle-scale", etc.). The
 * mapping module + plan_packaging table resolve the packaging_key to
 * its DB plan_code, products_enabled[], and Stripe price IDs. Both
 * the price reference and the session metadata are stamped with the
 * packaging context so the Stage-7.D webhook bridge can later apply
 * the right org.products_enabled update when subscription events
 * land.
 *
 * On success:
 *   { ok: true, sessionUrl: 'https://checkout.stripe.com/...' }
 *
 * On Stripe-not-configured (live keys not on Vercel):
 *   { ok: false, reason: 'stripe_not_configured' }  (HTTP 503)
 *
 * On unknown packaging / missing Stripe price:
 *   { ok: false, reason: 'packaging_not_purchasable' }  (HTTP 400)
 *
 * Auth: requires the operator to be signed in. The org is resolved
 * from the authenticated session via `requireOrgId()` (TENANT-1).
 *
 * The completed session fires `checkout.session.completed` → bridge
 * (`stripe-subscription-bridge.ts`), which sets
 * `org_subscriptions.stripe_customer_id` + `stripe_subscription_id`
 * and flips status appropriately. The packaging metadata flows
 * through `session.metadata` → `subscription.metadata` so the bridge
 * can read it when applying transitions.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  orgSubscriptions,
  planPackaging,
} from "@/lib/db/schema/subscriptions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { StripeClient } from "@/lib/payment-processors/providers/stripe/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PACKAGING_KEYS = [
  "mgmt-only-starter",
  "mgmt-only-pro",
  "mgmt-only-scale",
  "mgmt-only-enterprise",
  "dev-only-starter",
  "dev-only-pro",
  "dev-only-scale",
  "dev-only-enterprise",
  "bundle-starter",
  "bundle-pro",
  "bundle-scale",
  "bundle-enterprise",
] as const;

const inputSchema = z.object({
  packaging_key: z.enum(PACKAGING_KEYS),
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

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CheckoutResult>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_body" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { ok: false, reason: "not_signed_in" },
      { status: 401 },
    );
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "no_org_context" },
      { status: 500 },
    );
  }

  const stripeKeys = readStripeKeys();
  if (!stripeKeys) {
    // Stage 9.A defers live Stripe activation. UI is ready; the moment
    // STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY land in env, this
    // endpoint flips from 503 to live without a code change.
    return NextResponse.json(
      { ok: false, reason: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const db = requireDb();
  const packaging = await db
    .select()
    .from(planPackaging)
    .where(eq(planPackaging.packagingKey, parsed.data.packaging_key))
    .limit(1)
    .then((rows) => rows[0]);
  if (!packaging) {
    return NextResponse.json(
      { ok: false, reason: "packaging_not_found" },
      { status: 400 },
    );
  }
  const priceId =
    parsed.data.billing_cycle === "annual"
      ? packaging.stripeAnnualPriceId
      : packaging.stripeMonthlyPriceId;
  if (!priceId) {
    // Either the row hasn't been provisioned via
    // scripts/stripe-provision.ts yet, or it's an Enterprise tier
    // (custom pricing, no Stripe SKU — should funnel to /contact
    // instead of /api/billing/checkout).
    return NextResponse.json(
      { ok: false, reason: "packaging_not_purchasable" },
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
    .where(eq(orgSubscriptions.organizationId, orgId))
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

  // Stripe form-encoded body. Stripe doesn't copy session metadata
  // to the subscription automatically — we mirror packaging context
  // onto subscription_data.metadata so the Stage-7.D webhook bridge
  // can read it on `customer.subscription.*` events.
  const sessionInput: Record<string, unknown> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "metadata[organization_id]": orgId,
    "metadata[packaging_key]": packaging.packagingKey,
    "metadata[plan_kind]": packaging.planKind,
    "metadata[tier_key]": packaging.tierKey,
    "metadata[plan_code]": packaging.planCode,
    "metadata[products_enabled]": packaging.productsEnabled.join(","),
    "metadata[billing_cycle]": parsed.data.billing_cycle,
    "metadata[triggered_by_app_user_id]": me.id,
    "subscription_data[metadata][packaging_key]": packaging.packagingKey,
    "subscription_data[metadata][plan_code]": packaging.planCode,
    "subscription_data[metadata][products_enabled]":
      packaging.productsEnabled.join(","),
    client_reference_id: orgId,
    allow_promotion_codes: "true",
  };
  if (activeSub?.stripeCustomerId) {
    sessionInput.customer = activeSub.stripeCustomerId;
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

  return NextResponse.json(
    { ok: true, sessionUrl: session.url },
    { status: 200 },
  );
}
