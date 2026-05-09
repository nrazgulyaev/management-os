/**
 * Stage 10.I.5 + 10.I.6 — Trial state machine + signup + banner + cron.
 *
 * Pure-helper tests + file-shape contract for the I/O layer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveTrialState,
  computeTrialEndsAt,
  TRIAL_DURATION_DAYS_DEFAULT,
  TRIAL_EXPIRING_SOON_DAYS,
  type TrialOrgInput,
} from "../src/features/billing/trial-state";

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

const MIGRATION = "drizzle/0092_organizations_trial_state.sql";
const SAAS_SCHEMA = "src/lib/db/schema/saas.ts";
const SIGNUP_PAGE = "src/app/(public)/signup/page.tsx";
const SIGNUP_FORM = "src/components/signup/signup-form.tsx";
const SIGNUP_ACTIONS = "src/features/signup/actions.ts";
const TRIAL_BANNER = "src/components/billing/trial-banner.tsx";
const TRIAL_GUARD = "src/features/billing/require-active-trial.ts";
const TRIAL_SERVICES = "src/features/billing/trial-services.ts";
const TRIAL_JOB = "src/features/jobs/trial-status-job.ts";
const CRON_ROUTE = "src/app/api/cron/trial-status/route.ts";
const JOB_REGISTRY = "src/features/jobs/actions.ts";
const VERCEL_JSON = "vercel.json";
const DASH_SHELL = "src/components/layout/dashboard-shell.tsx";
const DEV_SHELL = "src/components/development/development-app-shell.tsx";

// ============================================================================
// 10.I.5 — Migration + Drizzle schema + signup files
// ============================================================================

test("10.I.5 — migration 0092 file shipped with the right ALTER + CHECK + INDEX", () => {
  assert.ok(exists(MIGRATION));
  const src = read(MIGRATION);
  assert.match(src, /ADD COLUMN trial_started_at timestamptz/);
  assert.match(src, /ADD COLUMN trial_ends_at\s+timestamptz/);
  assert.match(src, /ADD COLUMN trial_status\s+text NOT NULL DEFAULT 'none'/);
  assert.match(
    src,
    /CHECK \(trial_status IN \('none','active','expired','converted','cancelled'\)\)/,
  );
  assert.match(src, /CREATE INDEX IF NOT EXISTS organizations_trial_status_idx/);
});

test("10.I.5 — Drizzle schema gains trial fields on organizations", () => {
  const src = read(SAAS_SCHEMA);
  assert.match(src, /trialStartedAt:\s*timestamp\("trial_started_at"/);
  assert.match(src, /trialEndsAt:\s*timestamp\("trial_ends_at"/);
  assert.match(src, /trialStatus:\s*text\("trial_status"\)/);
  assert.match(src, /\.default\("none"\)/);
});

test("10.I.5 — signup page + form + action all shipped", () => {
  assert.ok(exists(SIGNUP_PAGE));
  assert.ok(exists(SIGNUP_FORM));
  assert.ok(exists(SIGNUP_ACTIONS));
});

test("10.I.5 — signupAction uses Zod validation + 12-char password min + honeypot reject", () => {
  const src = read(SIGNUP_ACTIONS);
  assert.match(src, /\.min\(12,/);
  assert.match(src, /Honeypot|honeypot|company.*\.optional/i);
  assert.match(src, /signupSchema\.safeParse/);
});

test("10.I.5 — signupAction provisions Supabase admin user + org with trial state", () => {
  const src = read(SIGNUP_ACTIONS);
  assert.match(src, /admin\.auth\.admin\.createUser/);
  assert.match(src, /trialStatus:\s*"active"/);
  assert.match(src, /computeTrialEndsAt/);
  assert.match(src, /assign_user_role.*super_admin/);
  // Welcome email via the no-op stub.
  assert.match(src, /sendEmail.*welcomeEmailTemplate/);
});

test("10.I.5 — signupAction respects products_enabled + uses landingPathFor", () => {
  const src = read(SIGNUP_ACTIONS);
  assert.match(src, /productsEnabled/);
  assert.match(src, /landingPathFor/);
});

test("10.I.5 — signup form has anti-bot honeypot + product radio + terms checkbox", () => {
  const src = read(SIGNUP_FORM);
  assert.match(src, /name="company"/);
  assert.match(src, /aria-hidden/);
  assert.match(src, /name="terms"/);
  assert.match(src, /name="product"/);
});

// ============================================================================
// 10.I.5 — deriveTrialState (pure)
// ============================================================================

test("10.I.5 — deriveTrialState: 'none' status returns full access, no banner", () => {
  const r = deriveTrialState({
    trialStatus: "none",
    trialStartedAt: null,
    trialEndsAt: null,
  });
  assert.equal(r.ui, "none");
  assert.equal(r.canRead, true);
  assert.equal(r.canWrite, true);
  assert.equal(r.shouldShowBanner, false);
});

test("10.I.5 — deriveTrialState: 'converted' returns full access, no banner", () => {
  const r = deriveTrialState({
    trialStatus: "converted",
    trialStartedAt: null,
    trialEndsAt: null,
  });
  assert.equal(r.ui, "converted");
  assert.equal(r.canWrite, true);
  assert.equal(r.shouldShowBanner, false);
});

test("10.I.5 — deriveTrialState: 'active' with > 2 days returns 'active' banner", () => {
  const now = new Date("2026-05-09T12:00:00Z");
  const future = new Date("2026-05-20T12:00:00Z");
  const r = deriveTrialState(
    {
      trialStatus: "active",
      trialStartedAt: new Date("2026-05-06T12:00:00Z"),
      trialEndsAt: future,
    },
    now,
  );
  assert.equal(r.ui, "active");
  assert.equal(r.canWrite, true);
  assert.equal(r.shouldShowBanner, true);
  assert.equal(r.daysRemaining, 11);
});

test("10.I.5 — deriveTrialState: 'active' with ≤ 2 days remaining → 'expiring-soon'", () => {
  const now = new Date("2026-05-09T12:00:00Z");
  const tomorrow = new Date("2026-05-10T12:00:00Z");
  const r = deriveTrialState(
    {
      trialStatus: "active",
      trialStartedAt: new Date("2026-04-25T12:00:00Z"),
      trialEndsAt: tomorrow,
    },
    now,
  );
  assert.equal(r.ui, "expiring-soon");
  assert.equal(r.canWrite, true, "writes still allowed when expiring-soon");
  assert.equal(r.shouldShowBanner, true);
});

test("10.I.5 — deriveTrialState: 'active' but trial_ends_at < now → treated as expired", () => {
  const now = new Date("2026-05-09T12:00:00Z");
  const past = new Date("2026-05-01T12:00:00Z");
  const r = deriveTrialState(
    {
      trialStatus: "active",
      trialStartedAt: new Date("2026-04-17T12:00:00Z"),
      trialEndsAt: past,
    },
    now,
  );
  assert.equal(r.ui, "expired");
  assert.equal(r.canWrite, false, "writes blocked even before cron flips status");
});

test("10.I.5 — deriveTrialState: 'expired' status blocks writes + shows banner", () => {
  const r = deriveTrialState({
    trialStatus: "expired",
    trialStartedAt: new Date("2026-04-17T12:00:00Z"),
    trialEndsAt: new Date("2026-05-01T12:00:00Z"),
  });
  assert.equal(r.ui, "expired");
  assert.equal(r.canRead, true);
  assert.equal(r.canWrite, false);
  assert.equal(r.shouldShowBanner, true);
});

test("10.I.5 — deriveTrialState: 'cancelled' blocks writes", () => {
  const r = deriveTrialState({
    trialStatus: "cancelled",
    trialStartedAt: null,
    trialEndsAt: null,
  });
  assert.equal(r.ui, "cancelled");
  assert.equal(r.canRead, true);
  assert.equal(r.canWrite, false);
  assert.equal(r.shouldShowBanner, true);
});

test("10.I.5 — computeTrialEndsAt(start, 14) returns start + 14 days", () => {
  const start = new Date("2026-05-09T00:00:00Z");
  const end = computeTrialEndsAt(start, 14);
  assert.equal(end.toISOString(), "2026-05-23T00:00:00.000Z");
});

test("10.I.5 — TRIAL_DURATION_DAYS_DEFAULT = 14, TRIAL_EXPIRING_SOON_DAYS = 2", () => {
  assert.equal(TRIAL_DURATION_DAYS_DEFAULT, 14);
  assert.equal(TRIAL_EXPIRING_SOON_DAYS, 2);
});

// ============================================================================
// 10.I.6 — Banner + read-only guard + cron
// ============================================================================

test("10.I.6 — TrialBanner renders 4 variants (active / expiring-soon / expired / cancelled)", () => {
  assert.ok(exists(TRIAL_BANNER));
  const src = read(TRIAL_BANNER);
  // Each branch surfaces in code.
  for (const ui of ['"active"', '"expiring-soon"', '"expired"', '"cancelled"']) {
    assert.ok(src.includes(`state.ui === ${ui}`), `missing branch ${ui}`);
  }
  // Stage 10.L flipped CTAs from mailto:sales to /dashboard/billing/upgrade
  // (Stage 9.B page that lists plans + launches Stripe Checkout via
  // /api/billing/checkout). Verifies the banner has an upgrade CTA — the
  // exact destination is locked in tests/development-stage-10-l.test.ts.
  assert.match(
    src,
    /\/dashboard\/billing\/upgrade|upgradeHref/,
    "trial banner must surface an upgrade CTA in every shown variant",
  );
});

test("10.I.6 — TrialBanner short-circuits when shouldShowBanner is false", () => {
  const src = read(TRIAL_BANNER);
  assert.match(src, /if \(!state\.shouldShowBanner\) return null/);
});

test("10.I.6 — both shells fetch + render TrialBanner", () => {
  for (const f of [DASH_SHELL, DEV_SHELL]) {
    const src = read(f);
    assert.match(src, /getCurrentOrgTrial/, `${f} must call the trial helper`);
    assert.match(src, /<TrialBanner state=\{trial\.state\} \/>/, `${f} must render the banner`);
  }
});

test("10.I.6 — requireActiveTrialOrPaid throws TrialExpiredError on miss", () => {
  assert.ok(exists(TRIAL_GUARD));
  const src = read(TRIAL_GUARD);
  assert.match(src, /class TrialExpiredError/);
  assert.match(src, /code = "TRIAL_EXPIRED"/);
  // Pass-through cases documented.
  assert.match(src, /if \(!trial\) return/);
  assert.match(src, /if \(trial\.state\.canWrite\) return/);
});

test("10.I.6 — getCurrentOrgTrial joins app_users + organizations", () => {
  assert.ok(exists(TRIAL_SERVICES));
  const src = read(TRIAL_SERVICES);
  assert.match(src, /innerJoin\(organizations,/);
  assert.match(src, /eq\(appUsers\.id, me\.id\)/);
  assert.match(src, /deriveTrialState/);
});

test("10.I.6 — trial-status job exists + flips active+expired-time to expired", () => {
  assert.ok(exists(TRIAL_JOB));
  const src = read(TRIAL_JOB);
  assert.match(src, /eq\(organizations\.trialStatus,\s*"active"\)/);
  assert.match(src, /lt\(organizations\.trialEndsAt,\s*cutoff\)/);
  assert.match(src, /trialStatus:\s*"expired"/);
});

test("10.I.6 — /api/cron/trial-status route delegates to handleCronJobRequest", () => {
  assert.ok(exists(CRON_ROUTE));
  const src = read(CRON_ROUTE);
  assert.match(src, /handleCronJobRequest\(request,\s*"trial_status"\)/);
});

test("10.I.6 — job registry knows trial_status + dispatches to runTrialStatusJob", () => {
  const src = read(JOB_REGISTRY);
  assert.match(src, /"trial_status"/);
  assert.match(src, /runTrialStatusJob/);
});

test("10.I.6 — trial-status cron route + handler intact (vercel.json schedule = operator-owned)", () => {
  // Operator owns the vercel.json schedule (same pattern as the 10.G
  // warm-routes test: cadence + presence is the operator's call, not
  // regression-locked here). What 10.I.6 owns + locks down:
  //   - the cron route file exists
  //   - the handler delegates to the shared cron envelope with the
  //     correct job key
  //   - the job is registered in the dispatch table (covered separately)
  // The cron is invokable via /api/cron/run-all (the dispatcher) or by
  // explicit re-add to vercel.json when the operator wants it scheduled.
  assert.ok(
    exists("src/app/api/cron/trial-status/route.ts"),
    "trial-status cron route must exist",
  );
  const handler = read("src/app/api/cron/trial-status/route.ts");
  assert.match(handler, /handleCronJobRequest\(request,\s*"trial_status"\)/);
});
