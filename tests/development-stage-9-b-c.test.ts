/**
 * Stage 9.B + 9.C — Stripe-ready UI shells acceptance tests.
 *
 * Stripe live activation (9.A) is deferred per operator instruction.
 * 9.B + 9.C ship the UI + endpoint shells that work as soon as
 * STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY land on Vercel — no code
 * change needed at flip-time.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ============================================================================
// 9.B — /api/billing/checkout
// ============================================================================

test("9.B: /api/billing/checkout route file exists + handles POST", () => {
  const path = "src/app/api/billing/checkout/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function POST\b/);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /export const runtime = "nodejs"/);
});

test("9.B checkout: 503 stripe_not_configured when STRIPE_SECRET_KEY missing (Stage 9.A deferral)", () => {
  const src = read("src/app/api/billing/checkout/route.ts");
  // The endpoint reads env at request time and returns 503 if keys absent.
  assert.match(src, /STRIPE_SECRET_KEY/);
  assert.match(src, /STRIPE_PUBLISHABLE_KEY/);
  assert.match(src, /stripe_not_configured/);
  assert.match(src, /status:\s*503/);
});

test("9.B checkout (Sprint 3b rewrite): validates input + resolves plan_packaging + checks Stripe price id", () => {
  const src = read("src/app/api/billing/checkout/route.ts");
  assert.match(src, /import\s*\{\s*z\s*\}\s*from\s*"zod"/);
  // Sprint 3b: looks up plan_packaging keyed by packaging_key instead
  // of the old subscription_plans-keyed-by-plan_code lookup.
  assert.match(src, /\.from\(planPackaging\)/);
  assert.match(src, /packagingKey/);
  assert.match(src, /stripeAnnualPriceId/);
  assert.match(src, /stripeMonthlyPriceId/);
  // Refuses 'packaging_not_purchasable' when the price id is missing
  // (un-provisioned row, or Enterprise tier with no Stripe SKU).
  assert.match(src, /packaging_not_purchasable/);
});

test("9.B checkout: passes org_id + user_id + plan_code as Stripe metadata", () => {
  const src = read("src/app/api/billing/checkout/route.ts");
  assert.match(src, /metadata\[organization_id\]/);
  assert.match(src, /metadata\[plan_code\]/);
  assert.match(src, /metadata\[triggered_by_app_user_id\]/);
  // client_reference_id = org id so the existing webhook bridge can
  // resolve the org without scanning metadata.
  assert.match(src, /client_reference_id:\s*org\.id/);
});

test("9.B checkout: reuses existing stripe_customer_id when present", () => {
  const src = read("src/app/api/billing/checkout/route.ts");
  // Avoids duplicate Stripe customers — looks up activeSub.stripeCustomerId
  // and passes it to Stripe so the subscription attaches to the right record.
  assert.match(src, /stripeCustomerId/);
  assert.match(src, /sessionInput\.customer = activeSub\.stripeCustomerId/);
});

// ============================================================================
// 9.B — /dashboard/billing/upgrade
// ============================================================================

test("9.B: /dashboard/billing/upgrade page + UpgradeButton client component shipped", () => {
  for (const path of [
    "src/app/(dashboard)/dashboard/billing/upgrade/page.tsx",
    "src/app/(dashboard)/dashboard/billing/upgrade/upgrade-button.tsx",
  ]) {
    assert.ok(exists(path), `missing: ${path}`);
  }
});

test("9.B upgrade page: lists plans, highlights current, shows locked banner from cabinet gate", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/billing/upgrade/page.tsx",
  );
  assert.match(src, /export const dynamic = "force-dynamic"/);
  // Reads only public + active plans, ordered by tier rank.
  assert.match(src, /isPublic[\s\S]{0,80}isActive|isActive[\s\S]{0,80}isPublic/);
  assert.match(src, /asc\(subscriptionPlans\.tierRank\)/);
  // Reads the org's current subscription to highlight current plan.
  assert.match(src, /\.from\(orgSubscriptions\)/);
  // Surfaces the `?locked=<flag>` query param sent by pageGate.
  assert.match(src, /sp\.locked/);
});

test("9.B UpgradeButton: posts to /api/billing/checkout + redirects to sessionUrl", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/billing/upgrade/upgrade-button.tsx",
  );
  assert.match(src, /^"use client"/m);
  assert.match(src, /\/api\/billing\/checkout/);
  // Hard navigation off-origin to Stripe Checkout.
  assert.match(src, /window\.location\.href = body\.sessionUrl/);
  // Surfaces the deferred-Stripe path with operator-friendly copy.
  assert.match(src, /stripe_not_configured/);
  assert.match(src, /support@arconique\.com/);
});

// ============================================================================
// 9.C — /api/billing/portal
// ============================================================================

test("9.C: /api/billing/portal route handles GET + redirects browser, returns JSON for API", () => {
  const path = "src/app/api/billing/portal/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function GET\b/);
  assert.match(src, /isJsonClient\(/);
  // 303 redirect to the portal URL for browser clients.
  assert.match(src, /NextResponse\.redirect\(portalSession\.url,\s*303\)/);
  // JSON body for application/json clients.
  assert.match(src, /portalUrl:\s*portalSession\.url/);
});

test("9.C portal: 503 stripe_not_configured + 404 no_stripe_customer paths distinct", () => {
  const src = read("src/app/api/billing/portal/route.ts");
  assert.match(src, /stripe_not_configured/);
  assert.match(src, /no_stripe_customer/);
  // No-customer browser path bounces to /upgrade so the operator can start.
  assert.match(src, /\/dashboard\/billing\/upgrade\?reason=no_customer/);
});

test("9.C: StripeClient.createBillingPortalSession helper added", () => {
  const src = read("src/lib/payment-processors/providers/stripe/client.ts");
  assert.match(src, /createBillingPortalSession\(/);
  assert.match(src, /\/v1\/billing_portal\/sessions/);
});

// ============================================================================
// 9.C — Manage subscription on /dashboard/settings
// ============================================================================

test("9.C: settings page links to Customer Portal + upgrade page", () => {
  const src = read("src/app/(dashboard)/dashboard/settings/page.tsx");
  assert.match(src, /\/api\/billing\/portal/);
  assert.match(src, /\/dashboard\/billing\/upgrade/);
  assert.match(src, /Customer Portal/);
});

// ============================================================================
// Phase 9.B+C closure
// ============================================================================

test("Phase 9.B+C: no new migrations (UI shells reuse Stage 7.B + 7.D infrastructure)", () => {
  const fs = require("fs") as typeof import("fs");
  assert.ok(
    !fs.existsSync(
      resolve(ROOT, "drizzle/0091_development_os_stage_9_b_c.sql"),
    ),
  );
});
