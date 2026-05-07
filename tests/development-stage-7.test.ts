/**
 * Stage 7 — Multi-tenancy + Commerce acceptance tests.
 *
 * Validates the load-bearing surface across all 5 sub-stages:
 *   7.A — cabinet_definitions migration + schema + seed
 *   7.B — subscription schema + gating helpers
 *   7.C — lifecycle FSM + 5 cron jobs + dispatcher wiring
 *   7.D — Stripe subscription bridge + webhook route
 *   7.E — middleware tenant resolver + /pricing + /sign-up
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { extractTenantSlug } from "../src/middleware";
import {
  canTransition,
  type SubscriptionStatus,
} from "../src/lib/billing/lifecycle-pure";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 7.A — cabinet_definitions
// ===========================================================================

test("Stage 7.A: migration 0084 declares cabinet_definitions", () => {
  const sql = readFile(
    "drizzle/0084_development_os_stage_7_a_cabinet_definitions.sql",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "cabinet_definitions"/);
  assert.match(sql, /"slug" TEXT NOT NULL UNIQUE/);
  assert.match(sql, /"allowed_role_keys" TEXT\[\]/);
  assert.match(sql, /"min_plan_code" TEXT/);
});

test("Stage 7.A: 9 cabinets seeded in migration 0084", () => {
  const sql = readFile(
    "drizzle/0084_development_os_stage_7_a_cabinet_definitions.sql",
  );
  for (const slug of [
    "cfo-accountant",
    "project-manager",
    "site-supervisor",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
    "my-cabinet",
  ]) {
    assert.match(sql, new RegExp(`'${slug}'`));
  }
});

test("Stage 7.A: Drizzle schema exports cabinetDefinitions", async () => {
  const mod = await import("../src/lib/db/schema/cabinet-definitions");
  assert.ok(mod.cabinetDefinitions);
});

// ===========================================================================
// 7.B — Subscription plans + feature flags
// ===========================================================================

test("Stage 7.B: migration 0085 declares 5 commerce tables", () => {
  const sql = readFile(
    "drizzle/0085_development_os_stage_7_b_subscription_plans.sql",
  );
  for (const t of [
    "subscription_plans",
    "feature_flags",
    "plan_features",
    "org_subscriptions",
    "subscription_lifecycle_events",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
});

test("Stage 7.B: migration 0085 preserves FOREACH IN ARRAY pattern", () => {
  const sql = readFile(
    "drizzle/0085_development_os_stage_7_b_subscription_plans.sql",
  );
  assert.match(sql, /FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[/);
});

test("Stage 7.B: 6 plans seeded (internal + trial + 4 paid tiers)", () => {
  const sql = readFile(
    "drizzle/0085_development_os_stage_7_b_subscription_plans.sql",
  );
  for (const code of [
    "'internal'",
    "'trial'",
    "'basic'",
    "'standard'",
    "'pro'",
    "'enterprise'",
  ]) {
    assert.match(sql, new RegExp(code));
  }
});

test("Stage 7.B: Drizzle schema exports 5 commerce tables", async () => {
  const mod = await import("../src/lib/db/schema/subscriptions");
  assert.ok(mod.subscriptionPlans);
  assert.ok(mod.featureFlags);
  assert.ok(mod.planFeatures);
  assert.ok(mod.orgSubscriptions);
  assert.ok(mod.subscriptionLifecycleEvents);
});

test("Stage 7.B: gating helpers exported from src/lib/billing/gating.ts", () => {
  const src = readFile("src/lib/billing/gating.ts");
  for (const fn of [
    "FeatureNotAvailableError",
    "FeatureLimitExceededError",
    "getFeatureForOrg",
    "requireFeature",
    "requireWithinLimit",
    "pageGate",
    "uiFeatureGate",
  ]) {
    assert.match(src, new RegExp(`export\\s+(async\\s+function|class|function|const)\\s+${fn}\\b`));
  }
});

test("Stage 7.B: internal-comp orgs bypass plan gating", () => {
  const src = readFile("src/lib/billing/gating.ts");
  assert.match(src, /isInternalComp/);
  assert.match(src, /Internal-comp orgs bypass/);
});

// ===========================================================================
// 7.C — Lifecycle FSM + 5 cron jobs
// ===========================================================================

test("Stage 7.C: legal lifecycle transitions", () => {
  const legal: Array<[SubscriptionStatus, SubscriptionStatus]> = [
    ["trial", "active"],
    ["trial", "grace"],
    ["trial", "cancelling"],
    ["active", "grace"],
    ["active", "cancelling"],
    ["active", "active"], // self-loop for renewal
    ["grace", "active"],
    ["grace", "suspended"],
    ["grace", "cancelling"],
    ["suspended", "active"],
    ["suspended", "archived"],
    ["cancelling", "active"],
    ["cancelling", "cancelled"],
    ["cancelled", "archived"],
    ["archived", "active"],
    ["archived", "purged"],
  ];
  for (const [from, to] of legal) {
    assert.equal(canTransition(from, to), true, `${from} -> ${to} should be legal`);
  }
});

test("Stage 7.C: illegal lifecycle transitions are blocked", () => {
  const illegal: Array<[SubscriptionStatus, SubscriptionStatus]> = [
    ["purged", "active"],
    ["purged", "archived"],
    ["trial", "purged"],
    ["active", "purged"],
    ["cancelled", "active"],
    ["suspended", "trial"],
  ];
  for (const [from, to] of illegal) {
    assert.equal(canTransition(from, to), false, `${from} -> ${to} should be illegal`);
  }
});

test("Stage 7.C: 5 lifecycle cron jobs exist", () => {
  for (const f of [
    "subscription-warn-expiry-job.ts",
    "subscription-attempt-renewal-job.ts",
    "subscription-advance-lifecycle-job.ts",
    "subscription-archive-expired-job.ts",
    "subscription-purge-archived-job.ts",
  ]) {
    assert.ok(
      fileExists(`src/lib/development/server/cron/${f}`),
      `${f} missing`,
    );
  }
});

test("Stage 7.C: cron index exports all 5 lifecycle runners", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  for (const fn of [
    "runSubscriptionWarnExpiry",
    "runSubscriptionAttemptRenewal",
    "runSubscriptionAdvanceLifecycle",
    "runSubscriptionArchiveExpired",
    "runSubscriptionPurgeArchived",
  ]) {
    assert.match(src, new RegExp(`export\\s*\\{\\s*${fn}\\s*\\}\\s*from`));
  }
});

test("Stage 7.C: dispatcher wires all 5 lifecycle keys", () => {
  const src = readFile("src/features/jobs/actions.ts");
  for (const key of [
    "subscription_warn_expiry",
    "subscription_attempt_renewal",
    "subscription_advance_lifecycle",
    "subscription_archive_expired",
    "subscription_purge_archived",
  ]) {
    assert.match(src, new RegExp(`"${key}"`));
    assert.match(src, new RegExp(`case\\s+"${key}":`));
  }
});

test("Stage 7.C: 5 cron route files exist", () => {
  for (const r of [
    "subscription-warn-expiry",
    "subscription-attempt-renewal",
    "subscription-advance-lifecycle",
    "subscription-archive-expired",
    "subscription-purge-archived",
  ]) {
    const path = `src/app/api/cron/${r}/route.ts`;
    assert.ok(fileExists(path), `${path} missing`);
    assert.match(readFile(path), /handleCronJobRequest/);
  }
});

test("Stage 7.C: VERCEL-CRON-CHECKLIST documents all 5 lifecycle entries", () => {
  const src = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const r of [
    "/api/cron/subscription-warn-expiry",
    "/api/cron/subscription-attempt-renewal",
    "/api/cron/subscription-advance-lifecycle",
    "/api/cron/subscription-archive-expired",
    "/api/cron/subscription-purge-archived",
  ]) {
    assert.ok(src.includes(r), `${r} must appear in checklist`);
  }
});

test("Stage 7.C: purge cron has 5% safety lock", () => {
  const src = readFile(
    "src/lib/development/server/cron/subscription-purge-archived-job.ts",
  );
  assert.match(src, /PURGE_BATCH_SAFETY_PCT\s*=\s*5/);
  assert.match(src, /Refused to purge/);
});

// ===========================================================================
// 7.D — Stripe subscription bridge + webhook route
// ===========================================================================

test("Stage 7.D: stripe bridge module exports applyStripeWebhook", () => {
  const src = readFile("src/lib/billing/stripe-subscription-bridge.ts");
  assert.match(src, /export\s+async\s+function\s+applyStripeWebhook\b/);
});

test("Stage 7.D: bridge maps 7 Stripe event types", () => {
  const src = readFile("src/lib/billing/stripe-subscription-bridge.ts");
  for (const evt of [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_action_required",
  ]) {
    assert.match(src, new RegExp(`"${evt.replace(/[.]/g, "\\.")}"`));
  }
});

test("Stage 7.D: webhook route exists + verifies signature", () => {
  const path = "src/app/api/webhooks/billing/stripe/route.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /verifyStripeSignature/);
  assert.match(src, /STRIPE_BILLING_WEBHOOK_SECRET/);
  assert.match(src, /applyStripeWebhook/);
});

// ===========================================================================
// 7.E — Tenant subdomain middleware + public pages
// ===========================================================================

test("Stage 7.E: extractTenantSlug parses production subdomains", () => {
  assert.equal(extractTenantSlug("acme.arconique.com"), "acme");
  assert.equal(extractTenantSlug("ACME.arconique.com"), "acme");
});

test("Stage 7.E: extractTenantSlug returns null for apex + reserved", () => {
  assert.equal(extractTenantSlug("arconique.com"), null);
  assert.equal(extractTenantSlug("www.arconique.com"), null);
  assert.equal(extractTenantSlug("api.arconique.com"), null);
  assert.equal(extractTenantSlug("app.arconique.com"), null);
  assert.equal(extractTenantSlug("admin.arconique.com"), null);
  assert.equal(extractTenantSlug("investors.arconique.com"), null);
  assert.equal(extractTenantSlug("docs.arconique.com"), null);
});

test("Stage 7.E: extractTenantSlug strips port + handles localhost", () => {
  assert.equal(extractTenantSlug("acme.localhost:3000"), "acme");
  assert.equal(extractTenantSlug("localhost"), null);
  assert.equal(extractTenantSlug("127.0.0.1"), null);
});

test("Stage 7.E: extractTenantSlug returns null for vercel preview", () => {
  assert.equal(extractTenantSlug("branch--proj.vercel.app"), null);
  assert.equal(extractTenantSlug("vercel.app"), null);
});

test("Stage 7.E: middleware exists at src/middleware.ts", () => {
  assert.ok(fileExists("src/middleware.ts"));
  const src = readFile("src/middleware.ts");
  assert.match(src, /export\s+function\s+middleware\b/);
  assert.match(src, /x-tenant-slug/);
  assert.match(src, /x-tenant-host/);
});

test("Stage 7.E: /pricing public page reads from subscriptionPlans", () => {
  const path = "src/app/(public)/pricing/page.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /subscriptionPlans/);
  assert.match(src, /isPublic/);
});

test("Stage 7.E: /sign-up auth page exists + reads plans + posts to onboarding", () => {
  const path = "src/app/(auth)/sign-up/page.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /subscriptionPlans/);
  assert.match(src, /\/api\/onboarding\/start/);
  assert.match(src, /\.arconique\.com/);
});
