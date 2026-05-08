/**
 * Stage 9.C — Stripe Customer Portal redirect.
 *
 * GET /api/billing/portal
 *   Looks up the caller's org, resolves its `stripe_customer_id`,
 *   creates a Customer Portal session, and 303-redirects to it.
 *
 * The Customer Portal hosts payment-method update, invoice view, plan
 * upgrade / downgrade, and cancellation — all with Stripe's UI, no
 * custom UI required on our side.
 *
 * Failure modes:
 *   - Stripe not configured (Stage 9.A deferred) → JSON 503.
 *   - No active subscription on the org → JSON 404 with a CTA back to
 *     /dashboard/billing/upgrade.
 *   - Stripe returns no portal URL → JSON 502.
 *
 * Reused infrastructure: `createPortalSession` is added to the
 * existing StripeClient (Stage 6.P3.F). Same auth + retry pattern as
 * createCheckoutSession.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { StripeClient } from "@/lib/payment-processors/providers/stripe/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function isJsonClient(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  return /application\/json/.test(accept) && !/text\/html/.test(accept);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json(
      { ok: false, reason: "not_signed_in" },
      { status: 401 },
    );
  }

  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return NextResponse.json(
      { ok: false, reason: "no_org_context" },
      { status: 500 },
    );
  }

  const stripeKeys = readStripeKeys();
  if (!stripeKeys) {
    return NextResponse.json(
      { ok: false, reason: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const db = requireDb();
  const sub = await db
    .select({
      stripeCustomerId: orgSubscriptions.stripeCustomerId,
    })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, org.id))
    .limit(1)
    .then((rows) => rows[0]);
  if (!sub?.stripeCustomerId) {
    // No Stripe customer yet — operator hasn't completed a Checkout
    // Session. Send them to the upgrade page.
    if (isJsonClient(request)) {
      return NextResponse.json(
        { ok: false, reason: "no_stripe_customer" },
        { status: 404 },
      );
    }
    return NextResponse.redirect(
      new URL("/dashboard/billing/upgrade?reason=no_customer", request.url),
      303,
    );
  }

  const baseUrl =
    env.server.APP_BASE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;
  const returnUrl = `${baseUrl}/dashboard`;

  const client = new StripeClient({
    provider: "stripe",
    secretKey: stripeKeys.secretKey,
    publishableKey: stripeKeys.publishableKey,
    webhookSecret: stripeKeys.webhookSecret,
    mode: stripeKeys.secretKey.startsWith("sk_live_") ? "live" : "test",
  });

  let portalSession: { url?: string };
  try {
    portalSession = (await client.createBillingPortalSession({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    })) as { url?: string };
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: `stripe_error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`,
      },
      { status: 502 },
    );
  }
  if (!portalSession?.url) {
    return NextResponse.json(
      { ok: false, reason: "stripe_returned_no_url" },
      { status: 502 },
    );
  }

  if (isJsonClient(request)) {
    return NextResponse.json(
      { ok: true, portalUrl: portalSession.url },
      { status: 200 },
    );
  }
  return NextResponse.redirect(portalSession.url, 303);
}
