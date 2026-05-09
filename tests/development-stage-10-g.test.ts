/**
 * Stage 10.G — Engineering wiring acceptance tests.
 *
 * Pre-flight finding: CRON_SECRET auth was already wired by Stage 8.E.1
 * (every /api/cron/* route shares handleCronJobRequest →
 * verifyCronAuthFromRequest). This test file:
 *   - locks the contract via regression tests
 *   - verifies the every-10-min schedule is restored in vercel.json
 *   - covers the no-op transactional email infrastructure
 *
 * Stripe + Resend remain deferred to Stage 10.L per operator decision.
 * sendEmail() returns { ok:true, skipped:true } today; the live wiring
 * is a 1-file swap once 10.L runs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCronAuth } from "../src/features/jobs/auth";
import {
  sendEmail,
  welcomeEmailTemplate,
  trialExpiryEmailTemplate,
} from "../src/features/email";
import { maskEmailForTesting } from "../src/features/email/send";

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

const VERCEL_JSON = "vercel.json";
const WARM_ROUTE = "src/app/api/cron/warm-routes/route.ts";
const DECISIONS_DOC = "tmp/stage-10-g-decisions.md";

// ============================================================================
// Part 1.1 — CRON_SECRET auth (already wired by 8.E.1; lock it down).
// ============================================================================

test("10.G — warm-routes endpoint delegates to handleCronJobRequest (shared CRON_SECRET envelope)", () => {
  assert.ok(exists(WARM_ROUTE));
  const src = read(WARM_ROUTE);
  assert.match(
    src,
    /handleCronJobRequest\(request,\s*"warm_routes"\)/,
    "must call the shared cron handler with the warm_routes job key",
  );
});

// Note: bearer-match assertions aren't directly testable from node:test
// because @/lib/env captures CRON_SECRET + NODE_ENV at module-load (frozen
// by Zod parse). Runtime mutation of process.env doesn't propagate. The
// existing tests/jobs.test.ts documents the same constraint. We test the
// two surfaces that ARE reachable: localhost bypass when no secret is set
// (test boot state), and remote-host rejection.

test("10.G — verifyCronAuth ACCEPTS localhost bypass when no CRON_SECRET set (test boot)", () => {
  // Test process boots without CRON_SECRET in env — this is the localhost
  // dev path. Asserting it's wired correctly so a misconfigured staging
  // (no secret) never silently lets remote requests through.
  const res = verifyCronAuth({
    authorizationHeader: null,
    hostHeader: "localhost:3000",
  });
  assert.equal(res.ok, true);
  assert.equal(res.warnedLocalhostBypass, true);
});

test("10.G — verifyCronAuth REJECTS remote host without secret (no silent allow)", () => {
  const res = verifyCronAuth({
    authorizationHeader: null,
    hostHeader: "arconique.com",
  });
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /not from localhost|missing|invalid/i);
});

test("10.G — verifyCronAuth REJECTS bad bearer on remote host (regression for 8.E.1)", () => {
  const res = verifyCronAuth({
    authorizationHeader: "Bearer wrong-token",
    hostHeader: "evil.example.com",
  });
  assert.equal(res.ok, false);
});

// ============================================================================
// Part 1.2 — */10 schedule restored.
// ============================================================================

test("10.G — vercel.json declares the warm-routes cron entry", () => {
  // Operator owns the cadence. Stage 10.G originally restored */10 (Pro plan
  // restoration) but the operator subsequently re-reverted to a daily 0 6 * * *
  // schedule post-CHECKPOINT 1. Test pins down the entry's existence + a
  // valid 5-field cron expression; the operator's choice of cadence is
  // intentionally NOT regression-locked.
  const src = read(VERCEL_JSON);
  const parsed = JSON.parse(src);
  assert.ok(Array.isArray(parsed.crons), "vercel.json must declare crons[]");
  const warm = parsed.crons.find(
    (c: { path: string }) => c.path === "/api/cron/warm-routes",
  );
  assert.ok(warm, "warm-routes cron entry must exist");
  assert.match(
    warm.schedule,
    /^[\d*\/,\- ]+$/,
    "schedule must be a valid 5-field cron expression",
  );
  assert.equal(
    warm.schedule.split(/\s+/).length,
    5,
    "cron expression must have 5 fields (min hour day month day-of-week)",
  );
});

// ============================================================================
// Part 1.3 — Email template + no-op send.
// ============================================================================

test("10.G — welcome template renders subject + text + html with substitutions", () => {
  const out = welcomeEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "Eternal Villas",
    dashboardUrl: "https://arconique.com/dashboard",
  });
  assert.match(out.subject, /Welcome.*Ada/);
  assert.match(out.text, /Eternal Villas/);
  assert.match(out.text, /https:\/\/arconique\.com\/dashboard/);
  assert.match(out.html, /<h1[\s\S]*Welcome[\s\S]*Ada/);
  assert.match(out.html, /Eternal Villas/);
});

test("10.G — welcome template HTML escapes hostile substitutions", () => {
  const out = welcomeEmailTemplate.render({
    recipientName: '<script>alert("xss")</script>',
    organizationName: "Ada & Co",
    dashboardUrl: "https://arconique.com/dashboard?u=1&v=2",
  });
  assert.doesNotMatch(out.html, /<script>/);
  assert.match(out.html, /&lt;script&gt;/);
  assert.match(out.html, /Ada &amp; Co/);
  assert.match(out.html, /u=1&amp;v=2/);
});

test("10.G — welcome template surfaces the trial-end line when trialEndsOn provided", () => {
  const without = welcomeEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "X",
    dashboardUrl: "https://x.test",
  });
  const withTrial = welcomeEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "X",
    dashboardUrl: "https://x.test",
    trialEndsOn: "2026-06-01",
  });
  assert.doesNotMatch(without.text, /trial/i);
  assert.match(withTrial.text, /trial runs until 2026-06-01/);
});

test("10.G — trial-expiry template chooses headline + tone by daysRemaining", () => {
  const future = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "X",
    daysRemaining: 5,
    trialEndsOn: "2026-06-01",
    upgradeUrl: "https://x.test/upgrade",
  });
  const today = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "X",
    daysRemaining: 0,
    trialEndsOn: "2026-06-01",
    upgradeUrl: "https://x.test/upgrade",
  });
  const expired = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "X",
    daysRemaining: -3,
    trialEndsOn: "2026-06-01",
    upgradeUrl: "https://x.test/upgrade",
  });
  assert.match(future.subject, /ends in 5 days/);
  assert.match(today.subject, /ends today/);
  assert.match(expired.subject, /has ended/);
});

test("10.G — sendEmail() rejects invalid recipient", async () => {
  const res = await sendEmail("not-an-email", welcomeEmailTemplate, {
    recipientName: "Ada",
    organizationName: "X",
    dashboardUrl: "https://x.test",
  });
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /invalid recipient/i);
});

test("10.G — sendEmail() returns ok+skipped (no-op) for valid recipient", async () => {
  const res = await sendEmail(
    "ada@example.com",
    welcomeEmailTemplate,
    {
      recipientName: "Ada",
      organizationName: "X",
      dashboardUrl: "https://x.test",
    },
  );
  assert.equal(res.ok, true);
  assert.equal(res.skipped, true);
  assert.match(
    res.reason ?? "",
    /stage_10_g_noop_pending_resend_wiring/,
    "must surface the deferral marker so 10.L knows what to swap",
  );
});

test("10.G — maskEmail() obscures all but the first character of the local part", () => {
  assert.equal(maskEmailForTesting("ada@example.com"), "a**@example.com");
  assert.equal(maskEmailForTesting("a@x.com"), "a*@x.com");
  assert.equal(maskEmailForTesting("not-an-email"), "***");
});

test("10.G — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.G ACCEPTED/);
  assert.match(doc, /CHECKPOINT 1/);
});
