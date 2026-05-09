/**
 * Stage 10.L — Stripe + Resend wiring acceptance tests.
 *
 * Pre-flight surprise: Stripe Checkout endpoint, billing webhook,
 * customer portal, subscription schema, and the resendProvider were ALL
 * already shipped (Stages 6.P3 / 7.B / 7.D / 9.B-C). 10.L is a wiring
 * sub-phase, not green-field building:
 *   - 10.L.1 — sendEmail() no-op → live resendProvider call
 *   - 10.L.2 — trial banner mailto → /dashboard/billing/upgrade
 *   - 10.L.3 — daily trial-expiry-reminder cron
 *
 * Tests cover the wiring contracts; live HTTP to Stripe/Resend stays
 * out of scope (operator-side env vars + verified DNS gate that).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sendEmail, welcomeEmailTemplate } from "../src/features/email";

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

const SEND_EMAIL = "src/features/email/send.ts";
const TRIAL_BANNER = "src/components/billing/trial-banner.tsx";
const REMINDER_JOB = "src/features/jobs/trial-expiry-reminder-job.ts";
const REMINDER_ROUTE = "src/app/api/cron/trial-expiry-reminder/route.ts";
const JOB_REGISTRY = "src/features/jobs/actions.ts";

// ============================================================================
// 10.L.1 — Resend swap
// ============================================================================

test("10.L.1 — sendEmail wires resendProvider (live path) + falls back when unconfigured", () => {
  const src = read(SEND_EMAIL);
  // Imports the existing notifications-layer Resend provider.
  assert.match(
    src,
    /import \{ resendProvider \} from "@\/features\/notifications\/providers\/resend"/,
  );
  // Imports the env-config guard.
  assert.match(src, /isResendConfigured/);
  // Calls the provider.send() method on the live path.
  assert.match(src, /resendProvider\.send\(/);
  // Graceful fallback when env unset.
  assert.match(src, /reason:\s*"resend_not_configured"/);
});

test("10.L.1 — sendEmail() returns ok+skipped (no-op fallback) when Resend unconfigured", async () => {
  // Test boots without RESEND_API_KEY → fallback path fires.
  const result = await sendEmail("ada@example.com", welcomeEmailTemplate, {
    recipientName: "Ada",
    organizationName: "Test",
    dashboardUrl: "https://x.test",
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.match(result.reason ?? "", /resend_not_configured/);
});

test("10.L.1 — sendEmail() rejects invalid recipient regardless of provider state", async () => {
  const result = await sendEmail(
    "not-an-email",
    welcomeEmailTemplate,
    {
      recipientName: "Ada",
      organizationName: "Test",
      dashboardUrl: "https://x.test",
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /invalid recipient/i);
});

test("10.L.1 — sendEmail() rejects template render failures", async () => {
  // Synthetic template that throws.
  const broken = {
    key: "broken",
    render() {
      throw new Error("synthetic render error");
    },
  };
  const result = await sendEmail("ada@example.com", broken as never, {});
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /synthetic render error/);
});

// ============================================================================
// 10.L.2 — Trial banner CTAs
// ============================================================================

test("10.L.2 — trial banner CTAs flipped from mailto:sales to /dashboard/billing/upgrade", () => {
  const src = read(TRIAL_BANNER);
  // No more mailto: links anywhere in the banner.
  assert.doesNotMatch(
    src,
    /mailto:sales@arconique\.com/,
    "trial banner must not use mailto:sales (Stage 9.B upgrade page is the canonical CTA)",
  );
  // Replaced with the upgrade-page deep link.
  assert.match(src, /\/dashboard\/billing\/upgrade/);
  // Each banner state passes a `trial=` query param for analytics +
  // upgrade-page context.
  assert.match(src, /from=trial-banner&trial=/);
});

test("10.L.2 — trial banner upgradeHref helper covers active / expiring-soon / expired / cancelled", () => {
  const src = read(TRIAL_BANNER);
  // Helper exists.
  assert.match(src, /function upgradeHref/);
  // 4 callsites, one per banner variant.
  const calls = src.match(/upgradeHref\(/g) ?? [];
  assert.ok(
    calls.length >= 3,
    `expected ≥3 upgradeHref callsites (active/expiring/expired+cancelled), got ${calls.length}`,
  );
});

// ============================================================================
// 10.L.3 — Trial-expiry-reminder cron
// ============================================================================

test("10.L.3 — trial-expiry-reminder job exists + targets 0-3 days horizon", () => {
  assert.ok(exists(REMINDER_JOB));
  const src = read(REMINDER_JOB);
  // Active trials only (cron also runs daily after `trial_status` cron;
  // expired rows already had their state flipped — no email needed).
  assert.match(src, /eq\(organizations\.trialStatus,\s*"active"\)/);
  // Horizon of 3 days forward from now.
  assert.match(src, /3 \* 24 \* 60 \* 60 \* 1000/);
});

test("10.L.3 — reminder job resolves super_admin owners per org", () => {
  const src = read(REMINDER_JOB);
  assert.match(src, /eq\(roles\.key,\s*"super_admin"\)/);
  // Joined to app_users.organizationId so each owner email is correctly scoped.
  assert.match(src, /organizationId:\s*appUsers\.organizationId/);
});

test("10.L.3 — reminder job sends via the transactional sendEmail() pipe", () => {
  const src = read(REMINDER_JOB);
  assert.match(src, /sendEmail\(/);
  assert.match(src, /trialExpiryEmailTemplate/);
  // Records sent / skipped / failed counts in the job metrics.
  assert.match(src, /sentCount/);
  assert.match(src, /skippedCount/);
  assert.match(src, /failedCount/);
});

test("10.L.3 — reminder cron route delegates to the shared CRON_SECRET handler", () => {
  assert.ok(exists(REMINDER_ROUTE));
  const src = read(REMINDER_ROUTE);
  assert.match(src, /handleCronJobRequest\(request,\s*"trial_expiry_reminder"\)/);
});

test("10.L.3 — job registered in KNOWN_JOBS + dispatch table + JobKey union", () => {
  const src = read(JOB_REGISTRY);
  assert.match(src, /"trial_expiry_reminder"/);
  assert.match(src, /runTrialExpiryReminderJob/);
  assert.match(src, /\|\s*"trial_expiry_reminder"/, "JobKey union must include the new job");
});

test("10.L.3 — VERCEL-CRON-CHECKLIST.md lists the new cron entry", () => {
  const doc = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(doc, /\/api\/cron\/trial-expiry-reminder/);
  assert.match(doc, /trial_expiry_reminder/);
  // Mentions Resend dependency for clarity.
  assert.match(doc, /trial-expiry-reminder.*RESEND_API_KEY/);
});

// ============================================================================
// Decisions doc + Track C closure
// ============================================================================

test("10.L — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists("tmp/stage-10-l-decisions.md"));
  const doc = read("tmp/stage-10-l-decisions.md");
  assert.match(doc, /STAGE 10 \/ PHASE 10\.L ACCEPTED/);
  // Pre-flight surprise documented (heavy lifting was already shipped).
  assert.match(doc, /Stripe.*ALREADY|already.*shipped|wiring sub-phase/i);
});
