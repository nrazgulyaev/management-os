/**
 * Stage 11.A — Trial flow polish acceptance tests.
 *
 * Stage 10.L.3 shipped the daily trial-expiry-reminder sweep + the live
 * Resend pipe. 11.A is the polish pass that closes the operational gaps
 * discovered while integrating it:
 *
 *   11.A.1 — Migration 0094 + Drizzle: organizations.last_trial_reminder_at
 *            (timestamptz, nullable) so the cron can dedupe per-day.
 *   11.A.2 — Trial → converted state transition. The Stripe webhook
 *            bridge (Stage 7.D) updates org_subscriptions on
 *            subscription.created + invoice.paid, but never touches
 *            organizations.trial_status. Without 11.A.2 the trial banner
 *            stays visible forever after a customer subscribes.
 *   11.A.3 — Reminder cron hardened: per-day dedupe (idempotent across
 *            multiple firings), super_admin fallback (legacy orgs that
 *            lost their owner role still get notified), stamping logic
 *            that DON'T stamp on full failure (so tomorrow retries).
 *   11.A.4 — Per-day reminder template variation. T-3 / T-1 / T-0 /
 *            already-expired now use four distinct copy registers
 *            (calm "heads up" → urgent "today" → recovery "ended").
 *            Identical copy across 4 firings felt robotic.
 *
 * Tests cover wiring contracts; live HTTP to Stripe/Resend stays out of
 * scope (operator-side env vars + verified DNS gate that).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  trialExpiryEmailTemplate,
  bucketForDaysRemaining,
} from "../src/features/email/templates/trial-expiry";

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

const MIGRATION = "drizzle/0094_organizations_last_trial_reminder_at.sql";
const SAAS_SCHEMA = "src/lib/db/schema/saas.ts";
const TRIAL_CONVERSION = "src/features/billing/trial-conversion.ts";
const STRIPE_BRIDGE = "src/lib/billing/stripe-subscription-bridge.ts";
const REMINDER_JOB = "src/features/jobs/trial-expiry-reminder-job.ts";
const TEMPLATE = "src/features/email/templates/trial-expiry.ts";
const EMAIL_BARREL = "src/features/email/index.ts";
const DECISIONS_DOC = "tmp/stage-11-a-decisions.md";

// ============================================================================
// 11.A.1 — Migration + Drizzle schema
// ============================================================================

test("11.A.1 — migration 0094 file shipped with the right ALTER", () => {
  assert.ok(exists(MIGRATION));
  const src = read(MIGRATION);
  assert.match(src, /ADD COLUMN last_trial_reminder_at timestamptz/);
  // No NOT NULL — first reminder fires when the column is still NULL.
  assert.doesNotMatch(
    src,
    /last_trial_reminder_at timestamptz NOT NULL/,
    "must remain nullable so the first cron firing is treated as the first reminder",
  );
  // COMMENT documents purpose + lineage.
  assert.match(src, /COMMENT ON COLUMN organizations\.last_trial_reminder_at/);
  assert.match(src, /Stage 11\.A\.1/);
});

test("11.A.1 — migration includes a documented rollback", () => {
  const src = read(MIGRATION);
  assert.match(src, /Rollback:/i);
  assert.match(src, /DROP COLUMN last_trial_reminder_at/);
});

test("11.A.1 — Drizzle schema gains lastTrialReminderAt timestamptz", () => {
  const src = read(SAAS_SCHEMA);
  assert.match(
    src,
    /lastTrialReminderAt:\s*timestamp\("last_trial_reminder_at",\s*\{\s*withTimezone:\s*true/,
  );
  assert.match(src, /Stage 11\.A\.1/);
});

// ============================================================================
// 11.A.2 — Trial → converted state transition + Stripe bridge hooks
// ============================================================================

test("11.A.2 — markOrgTrialConverted helper exists and is server-only", () => {
  assert.ok(exists(TRIAL_CONVERSION));
  const src = read(TRIAL_CONVERSION);
  assert.match(src, /^import "server-only"/m);
  assert.match(src, /export async function markOrgTrialConverted/);
  // Returns a result envelope (not throw) so callers can be best-effort.
  assert.match(src, /MarkOrgTrialConvertedResult/);
});

test("11.A.2 — trial-conversion helper is idempotent for already-converted orgs", () => {
  const src = read(TRIAL_CONVERSION);
  // Returns no-op when already converted.
  assert.match(src, /already_converted/);
  // 'none' (no trial machinery) is a silent pass-through.
  assert.match(src, /no_trial_to_convert/);
  // 'cancelled' requires manual review — webhook can't auto-resurrect.
  assert.match(src, /cancelled_requires_manual_review/);
});

test("11.A.2 — trial-conversion eligible source states are 'active' and 'expired' only", () => {
  const src = read(TRIAL_CONVERSION);
  // ELIGIBLE_FROM_STATES enumerates the eligible trial_status values.
  assert.match(src, /ELIGIBLE_FROM_STATES.*=\s*\[\s*"active",\s*"expired"\s*\]/s);
  // The actual UPDATE filters on these states (belt-and-braces).
  assert.match(src, /inArray\(organizations\.trialStatus/);
});

test("11.A.2 — trial-conversion records an audit event (best-effort)", () => {
  const src = read(TRIAL_CONVERSION);
  assert.match(src, /recordSecurityEvent/);
  // Audit event includes the previous + new trial_status for traceability.
  assert.match(src, /previousTrialStatus/);
  assert.match(src, /newTrialStatus/);
});

test("11.A.2 — Stripe bridge invokes markOrgTrialConverted on subscription.created (active)", () => {
  const src = read(STRIPE_BRIDGE);
  // Import wired.
  assert.match(
    src,
    /import \{ markOrgTrialConverted \} from "@\/features\/billing\/trial-conversion"/,
  );
  // Invocations are guarded by try/catch — audit should never fail the main mutation.
  const callMatches = src.match(/markOrgTrialConverted\(sub\.organizationId\)/g) ?? [];
  assert.ok(
    callMatches.length >= 3,
    `expected ≥3 markOrgTrialConverted callsites (subscription.created/active + invoice.paid/grace + invoice.paid/normal), got ${callMatches.length}`,
  );
});

test("11.A.2 — Stripe bridge guards trial-conversion calls with try/catch", () => {
  const src = read(STRIPE_BRIDGE);
  // Each invocation must be wrapped — never throw from the audit path.
  const tryMatches = src.match(/try\s*\{\s*await markOrgTrialConverted/g) ?? [];
  assert.ok(
    tryMatches.length >= 3,
    `expected ≥3 try-wrapped trial-conversion calls, got ${tryMatches.length}`,
  );
});

test("11.A.2 — Stripe bridge only marks converted when subscription is active (not trial)", () => {
  const src = read(STRIPE_BRIDGE);
  // The subscription.created branch only converts when targetStatus === "active".
  // (Trial-period creates do NOT flip org.trial_status.)
  assert.match(
    src,
    /if \(targetStatus === "active"\)\s*\{[^}]*markOrgTrialConverted/s,
  );
});

// ============================================================================
// 11.A.3 — Reminder cron: per-day dedupe + super_admin fallback
// ============================================================================

test("11.A.3 — reminder job filters out orgs already reminded today", () => {
  const src = read(REMINDER_JOB);
  // The candidate query includes the dedupe predicate.
  assert.match(src, /isNull\(organizations\.lastTrialReminderAt\)/);
  assert.match(src, /lt\(organizations\.lastTrialReminderAt,\s*startOfToday\)/);
  // Computed at the top of the job (UTC start-of-today).
  assert.match(src, /startOfToday\.setUTCHours\(0,\s*0,\s*0,\s*0\)/);
});

test("11.A.3 — reminder job stamps lastTrialReminderAt = now() on successful attempts", () => {
  const src = read(REMINDER_JOB);
  // Stamping uses sql`now()` so the DB clock is authoritative.
  assert.match(src, /lastTrialReminderAt:\s*sql`now\(\)`/);
  // Stamping happens only when at least one send didn't fail (sent OR
  // skipped). Failed-only attempts don't stamp — tomorrow retries.
  assert.match(src, /attemptedAtLeastOne\s*&&\s*!allFailed/);
});

test("11.A.3 — reminder job falls back to first active app_user when no super_admin exists", () => {
  const src = read(REMINDER_JOB);
  // Identifies orgs missing a super_admin owner.
  assert.match(src, /orgsNeedingFallback/);
  // Fallback query targets app_users in those orgs, ordered by createdAt.
  assert.match(src, /orderBy\(asc\(appUsers\.createdAt\)\)/);
  // Tracks how many orgs ended up using the fallback (operator visibility).
  assert.match(src, /fallbackUsedCount/);
});

test("11.A.3 — reminder job picks only the first fallback owner per org", () => {
  const src = read(REMINDER_JOB);
  // Comment + first-only logic.
  assert.match(src, /first one only/i);
  // Inside the fallback loop, skip orgs that already have an owner attached.
  assert.match(src, /if \(ownersByOrg\.has\(r\.organizationId\)\) continue/);
});

test("11.A.3 — reminder job records noOwnerCount when an org has no super_admin AND no fallback", () => {
  const src = read(REMINDER_JOB);
  assert.match(src, /noOwnerCount/);
  // No-owner orgs are counted but don't cause job failure.
  assert.match(src, /noOwnerCount\s*\+=\s*1/);
});

test("11.A.3 — reminder job metrics envelope includes all dedupe + fallback counters", () => {
  const src = read(REMINDER_JOB);
  // Metrics object extended with the new operational counters.
  assert.match(src, /candidatesCount/);
  assert.match(src, /fallbackUsedCount/);
  assert.match(src, /stampedCount/);
  assert.match(src, /noOwnerCount/);
  assert.match(src, /horizonIso/);
});

test("11.A.3 — stamping uses a try/catch so a stamping blip never fails the whole job", () => {
  const src = read(REMINDER_JOB);
  // The DB stamp is best-effort: a stamping failure means we may
  // re-send tomorrow, which is preferable to failing the cron run.
  assert.match(
    src,
    /try\s*\{[^}]*\.update\(organizations\)[^}]*lastTrialReminderAt/s,
  );
});

// ============================================================================
// 11.A.4 — Per-day reminder template variation
// ============================================================================

test("11.A.4 — bucketForDaysRemaining maps days into 4 distinct buckets", () => {
  // Future days far out: heads_up (calm).
  assert.equal(bucketForDaysRemaining(3), "heads_up");
  assert.equal(bucketForDaysRemaining(2), "heads_up");
  // T-1: tomorrow.
  assert.equal(bucketForDaysRemaining(1), "tomorrow");
  // T-0: today.
  assert.equal(bucketForDaysRemaining(0), "today");
  // Past: ended.
  assert.equal(bucketForDaysRemaining(-1), "ended");
  assert.equal(bucketForDaysRemaining(-7), "ended");
});

test("11.A.4 — heads_up bucket uses calm 'Heads up' subject and headline", () => {
  const r = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "Acme Villas",
    daysRemaining: 3,
    trialEndsOn: "2026-05-12",
    upgradeUrl: "https://x.test/upgrade",
  });
  assert.match(r.subject, /Heads up/);
  assert.match(r.subject, /Acme Villas/);
  assert.match(r.html, /Heads up.*your trial ends soon/i);
  // No urgent / today / tomorrow language in the calm bucket.
  assert.doesNotMatch(r.subject, /tomorrow/i);
  assert.doesNotMatch(r.subject, /ends today/i);
  assert.doesNotMatch(r.subject, /has ended/i);
});

test("11.A.4 — tomorrow bucket uses explicit 'tomorrow' subject + amber tone", () => {
  const r = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "Acme Villas",
    daysRemaining: 1,
    trialEndsOn: "2026-05-10",
    upgradeUrl: "https://x.test/upgrade",
  });
  assert.match(r.subject, /trial ends tomorrow/i);
  assert.match(r.html, /trial ends tomorrow/i);
  // Amber accent (tone: #b45309) on the headline.
  assert.match(r.html, /color:#b45309/);
});

test("11.A.4 — today bucket uses urgent 'ends today' subject + last-chance CTA", () => {
  const r = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "Acme Villas",
    daysRemaining: 0,
    trialEndsOn: "2026-05-09",
    upgradeUrl: "https://x.test/upgrade",
  });
  assert.match(r.subject, /trial ends today/i);
  assert.match(r.html, /trial ends today/i);
  // Stronger CTA copy.
  assert.match(r.html, /Choose a plan now/);
});

test("11.A.4 — ended bucket uses recovery framing + red accent", () => {
  const r = trialExpiryEmailTemplate.render({
    recipientName: "Ada",
    organizationName: "Acme Villas",
    daysRemaining: -2,
    trialEndsOn: "2026-05-07",
    upgradeUrl: "https://x.test/upgrade",
  });
  assert.match(r.subject, /trial has ended/i);
  // Recovery framing — calls out that no work is lost.
  assert.match(r.html, /no work is lost/i);
  // CTA pivots to "Reactivate workspace".
  assert.match(r.html, /Reactivate workspace/);
  // Red accent (tone: #b91c1c) for the ended state.
  assert.match(r.html, /color:#b91c1c/);
});

test("11.A.4 — every bucket renders an upgrade URL exactly as supplied", () => {
  const url = "https://x.test/dashboard/billing/upgrade?from=trial-reminder";
  for (const days of [3, 1, 0, -1]) {
    const r = trialExpiryEmailTemplate.render({
      recipientName: "Ada",
      organizationName: "Acme",
      daysRemaining: days,
      trialEndsOn: "2026-05-10",
      upgradeUrl: url,
    });
    assert.ok(
      r.text.includes(url),
      `text body must include the upgrade URL for daysRemaining=${days}`,
    );
    assert.ok(
      r.html.includes(url),
      `html body must include the upgrade URL for daysRemaining=${days}`,
    );
  }
});

test("11.A.4 — bucket subjects are pairwise distinct (no robotic duplicates)", () => {
  const subjects = new Set<string>();
  for (const days of [3, 1, 0, -1]) {
    const r = trialExpiryEmailTemplate.render({
      recipientName: "Ada",
      organizationName: "Acme",
      daysRemaining: days,
      trialEndsOn: "2026-05-10",
      upgradeUrl: "https://x.test/upgrade",
    });
    subjects.add(r.subject);
  }
  assert.equal(
    subjects.size,
    4,
    "all 4 bucket subjects must be distinct strings",
  );
});

test("11.A.4 — template escapes recipient + org name to prevent HTML injection", () => {
  const r = trialExpiryEmailTemplate.render({
    recipientName: "<script>alert(1)</script>",
    organizationName: "Acme & Co \"VIP\"",
    daysRemaining: 1,
    trialEndsOn: "2026-05-10",
    upgradeUrl: "https://x.test/upgrade",
  });
  assert.doesNotMatch(r.html, /<script>alert/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /&amp;/);
  assert.match(r.html, /&quot;/);
});

test("11.A.4 — bucketForDaysRemaining is exported from the email feature barrel", () => {
  const src = read(EMAIL_BARREL);
  assert.match(src, /bucketForDaysRemaining/);
});

test("11.A.4 — template file documents the per-day variation rationale", () => {
  const src = read(TEMPLATE);
  assert.match(src, /Stage 11\.A\.4/);
  assert.match(src, /T-3.*T-1.*T-0/s);
  // Documents why uniform copy was rejected.
  assert.match(src, /robotic/i);
});

// ============================================================================
// Decisions doc
// ============================================================================

test("11.A — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC));
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 11 \/ PHASE 11\.A ACCEPTED/);
  // Migration 0094 production apply is flagged for operator action.
  assert.match(doc, /0094.*PRODUCTION|PRODUCTION.*0094/i);
  // Each of the four sub-phases is mentioned.
  assert.match(doc, /11\.A\.1/);
  assert.match(doc, /11\.A\.2/);
  assert.match(doc, /11\.A\.3/);
  assert.match(doc, /11\.A\.4/);
});
