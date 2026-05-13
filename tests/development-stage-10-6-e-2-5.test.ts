/**
 * Stage 10.6 / Phase 10.6.E.2.5 — SubscriptionOS impersonation +
 * action-button wiring.
 *
 * Two scopes ship here:
 *
 * 1. Action server actions (extendTrial / markAsComp / cancelSubscription)
 *    — fully wired with audit_events + subscription_lifecycle_events
 *    emission. Each mutation is FSM-aware (uses transitionSubscription
 *    for status changes; direct UPDATE + lifecycle event for non-
 *    transition mutations like extending trialEndsAt).
 *
 * 2. Impersonation scaffold — cookie + banner + audit-log emission.
 *    HONEST SCOPING: the org_id resolution swap in middleware/RLS is
 *    NOT yet wired. The cookie is set, the banner renders the warning
 *    overlay, the audit trail records who looked at what — but
 *    /dashboard/* still loads the operator's own org. That swap is a
 *    focused follow-up that pairs with RLS policy review.
 *
 * Per the architecture doc, every server action enforces super_admin
 * via requireSuperAdmin() (defense in depth — the layout already
 * gates, but server actions can be invoked from anywhere).
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

const ACTIONS = "src/lib/subscription-os/actions.ts";
const ACTION_BUTTONS = "src/components/subscription-os/per-org-action-buttons.tsx";
const BANNER = "src/components/subscription-os/impersonation-banner.tsx";
const START_BTN = "src/components/subscription-os/impersonation-start-button.tsx";
const END_BTN = "src/components/subscription-os/impersonation-end-button.tsx";
const ORG_DETAIL = "src/app/(platform-app)/platform/[orgCode]/page.tsx";
const LAYOUT = "src/app/(platform-app)/layout.tsx";

// ============================================================================
// Server actions module
// ============================================================================

test("10.6.E.2.5.1 — actions module ships", () => {
  assert.ok(existsSync(resolve(ROOT, ACTIONS)));
});

test("10.6.E.2.5.1 — actions module is server-only + 'use server' directive", () => {
  const src = read(ACTIONS);
  assert.match(src, /import "server-only";/);
  assert.match(src, /"use server";/);
});

test("10.6.E.2.5.1 — actions module exports the documented mutations", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "extendTrialAction",
    "markAsCompAction",
    "cancelSubscriptionAction",
    "startImpersonationAction",
    "endImpersonationAction",
    "readImpersonationCookie",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

test("10.6.E.2.5.1 — every mutation enforces super_admin (defense in depth)", () => {
  const src = read(ACTIONS);
  // requireSuperAdmin helper exists + every action calls it
  assert.match(src, /async function requireSuperAdmin\(\)/);
  // Each action calls requireSuperAdmin
  for (const fn of [
    "extendTrialAction",
    "markAsCompAction",
    "cancelSubscriptionAction",
    "startImpersonationAction",
  ]) {
    const fnBody = src.match(
      new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}`),
    );
    assert.ok(fnBody, `could not locate ${fn} body`);
    assert.match(fnBody[0], /requireSuperAdmin\(\)/);
  }
});

test("10.6.E.2.5.1 — extendTrial validates additionalDays (1..90)", () => {
  const src = read(ACTIONS);
  assert.match(
    src,
    /additionalDays <= 0 \|\| additionalDays > 90/,
  );
});

test("10.6.E.2.5.1 — markAsComp + cancelSubscription require a reason for audit trail", () => {
  const src = read(ACTIONS);
  // Both functions check for reason.trim() being non-empty
  const compBody = src.match(/export async function markAsCompAction[\s\S]{0,1500}/);
  assert.ok(compBody);
  assert.match(compBody[0], /!reason\.trim\(\)/);
  const cancelBody = src.match(/export async function cancelSubscriptionAction[\s\S]{0,1500}/);
  assert.ok(cancelBody);
  assert.match(cancelBody[0], /!reason\.trim\(\)/);
});

test("10.6.E.2.5.1 — every mutation emits audit_events with action prefix 'platform.'", () => {
  const src = read(ACTIONS);
  // 5 audit events expected (3 mutations + 2 impersonation actions)
  for (const action of [
    "platform.subscription.trial_extended",
    "platform.subscription.comp_granted",
    "platform.subscription.cancelled",
    "platform.impersonate.start",
    "platform.impersonate.end",
  ]) {
    assert.match(src, new RegExp(`action: "${action}"`));
  }
});

test("10.6.E.2.5.1 — cancelSubscription uses transitionSubscription (FSM-safe)", () => {
  const src = read(ACTIONS);
  const body = src.match(/export async function cancelSubscriptionAction[\s\S]{0,2000}/);
  assert.ok(body);
  assert.match(body[0], /transitionSubscription\(/);
  assert.match(body[0], /toStatus: "cancelling"/);
  assert.match(body[0], /eventType: "cancellation_requested"/);
});

test("10.6.E.2.5.1 — markAsComp emits the comp_granted lifecycle event", () => {
  const src = read(ACTIONS);
  const body = src.match(/export async function markAsCompAction[\s\S]{0,2000}/);
  assert.ok(body);
  assert.match(body[0], /eventType: "comp_granted"/);
});

test("10.6.E.2.5.1 — extendTrial pushes trialEndsAt forward without changing status", () => {
  const src = read(ACTIONS);
  const body = src.match(/export async function extendTrialAction[\s\S]{0,2500}/);
  assert.ok(body);
  // Direct UPDATE on trialEndsAt (not a transitionSubscription call)
  assert.match(body[0], /\.update\(orgSubscriptions\)\s*\.set\(\{ trialEndsAt: newEnd/);
  assert.doesNotMatch(body[0], /transitionSubscription\(/);
});

// ============================================================================
// Impersonation cookie + scaffold
// ============================================================================

test("10.6.E.2.5.3 — impersonation cookie name + TTL constants", () => {
  const src = read(ACTIONS);
  assert.match(src, /__platform_impersonation/);
  assert.match(src, /IMPERSONATION_TTL_SECONDS = 60 \* 60/);
});

test("10.6.E.2.5.3 — startImpersonation sets httpOnly + sameSite=lax cookie", () => {
  const src = read(ACTIONS);
  const body = src.match(/export async function startImpersonationAction[\s\S]{0,2500}/);
  assert.ok(body);
  assert.match(body[0], /httpOnly: true/);
  assert.match(body[0], /sameSite: "lax"/);
  assert.match(body[0], /secure: process\.env\.NODE_ENV === "production"/);
});

test("10.6.E.2.5.3 — startImpersonation emits scopeCaveat in audit metadata (honest scoping)", () => {
  const src = read(ACTIONS);
  assert.match(src, /scopeCaveat:/);
  assert.match(src, /org_id resolution swap deferred/);
});

test("10.6.E.2.5.3 — endImpersonation logs session duration to audit", () => {
  const src = read(ACTIONS);
  assert.match(src, /sessionDurationMs/);
});

// ============================================================================
// Client components
// ============================================================================

test("10.6.E.2.5.2 — PerOrgActionButtons client component ships", () => {
  assert.ok(existsSync(resolve(ROOT, ACTION_BUTTONS)));
  const src = read(ACTION_BUTTONS);
  // "use client" can appear before or after the file's leading comment;
  // we just need it present.
  assert.match(src, /"use client";/);
  assert.match(src, /export function PerOrgActionButtons/);
});

test("10.6.E.2.5.2 — PerOrgActionButtons disables Extend Trial when status !== 'trial'", () => {
  const src = read(ACTION_BUTTONS);
  assert.match(src, /canExtend = status === "trial"/);
});

test("10.6.E.2.5.2 — PerOrgActionButtons opens 3 modal forms via EntityModal", () => {
  const src = read(ACTION_BUTTONS);
  // 3 EntityModal usages, one per action
  const matches = src.match(/<EntityModal/g);
  assert.ok(matches && matches.length === 3, `expected 3 EntityModal, got ${matches?.length ?? 0}`);
});

test("10.6.E.2.5.3 — ImpersonationBanner reads cookie + renders only when set", () => {
  assert.ok(existsSync(resolve(ROOT, BANNER)));
  const src = read(BANNER);
  assert.match(src, /readImpersonationCookie/);
  assert.match(src, /if \(!cookie\) return null/);
  // Sticky overlay so it survives scroll
  assert.match(src, /sticky top-0 z-50/);
});

test("10.6.E.2.5.3 — Start + End impersonation buttons ship as client components", () => {
  for (const path of [START_BTN, END_BTN]) {
    assert.ok(existsSync(resolve(ROOT, path)));
    const src = read(path);
    assert.match(src, /"use client";/);
  }
});

// ============================================================================
// Wired into per-org detail page + layout
// ============================================================================

test("10.6.E.2.5.2 — per-org detail page swaps stubbed Buttons for PerOrgActionButtons", () => {
  const src = read(ORG_DETAIL);
  assert.match(src, /<PerOrgActionButtons/);
  // Old stubbed disabled buttons removed
  assert.doesNotMatch(
    src,
    /disabled title="Ships in 10\.6\.E\.2 follow-up"/,
  );
});

test("10.6.E.2.5.3 — per-org detail page surfaces ImpersonationStartButton in quick-actions", () => {
  const src = read(ORG_DETAIL);
  assert.match(src, /<ImpersonationStartButton organizationCode/);
});

test("10.6.E.2.5.3 — Platform Admin OS layout mounts ImpersonationBanner above children", () => {
  const src = read(LAYOUT);
  assert.match(
    src,
    /import \{ ImpersonationBanner \} from "@\/components\/subscription-os\/impersonation-banner";/,
  );
  assert.match(src, /<ImpersonationBanner \/>/);
});
