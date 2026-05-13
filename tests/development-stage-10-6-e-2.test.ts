/**
 * Stage 10.6 / Phase 10.6.E.2 — SubscriptionOS MVP (5 admin pages).
 *
 * 6 admin pages were planned in CHECKPOINT 5; this sub-phase ships 5
 * read-only ones. Page #6 (impersonation tool) is security-sensitive
 * and gets its own focused sub-phase 10.6.E.2.5 with the cookie-driven
 * read-only context switch + audit-log emission per the architecture
 * doc.
 *
 * Pages shipped:
 *   - /subscriptions/organizations  (10.6.E.2.1) — list + filter pills
 *   - /subscriptions/[orgCode]      (10.6.E.2.2) — per-org detail
 *   - /subscriptions/revenue        (10.6.E.2.3) — MRR/ARR/conversion
 *   - /subscriptions/usage          (10.6.E.2.4) — per-org product split
 *   - /subscriptions/audit          (10.6.E.2.6) — platform-admin audit log
 *
 * Plus shared queries module:
 *   - src/lib/subscription-os/queries.ts — listSubscriptionOsOrgs,
 *     getSubscriptionOsOrgByCode, getOrgLifecycleEvents,
 *     getRevenueSnapshot, listPlatformAuditEntries
 *
 * 0 migrations (per CHECKPOINT 5 default + queries module reads from
 * existing Stage 7.D + 5.J + 5.D tables).
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

const QUERIES = "src/lib/subscription-os/queries.ts";
const PAGE_ORGS = "src/app/(platform-app)/platform/organizations/page.tsx";
const PAGE_DETAIL = "src/app/(platform-app)/platform/[orgCode]/page.tsx";
const PAGE_REVENUE = "src/app/(platform-app)/platform/revenue/page.tsx";
const PAGE_USAGE = "src/app/(platform-app)/platform/usage/page.tsx";
const PAGE_AUDIT = "src/app/(platform-app)/platform/audit/page.tsx";

// ============================================================================
// Shared queries module
// ============================================================================

test("10.6.E.2.0 — subscription-os queries module ships", () => {
  assert.ok(existsSync(resolve(ROOT, QUERIES)));
});

test("10.6.E.2.0 — queries module exports the documented helpers", () => {
  const src = read(QUERIES);
  for (const fn of [
    "listSubscriptionOsOrgs",
    "getSubscriptionOsOrgByCode",
    "getOrgLifecycleEvents",
    "getRevenueSnapshot",
    "listPlatformAuditEntries",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

test("10.6.E.2.0 — queries module is server-only", () => {
  const src = read(QUERIES);
  assert.match(src, /import "server-only";/);
});

test("10.6.E.2.0 — getRevenueSnapshot derives MRR + ARR from active subs only", () => {
  const src = read(QUERIES);
  // Only active subs contribute to MRR
  assert.match(
    src,
    /if \(r\.status === "active"\) \{[\s\S]{0,400}out\.mrrMinor \+= r\.monthlyPriceMinor/,
  );
  // ARR = MRR × 12
  assert.match(src, /out\.arrMinor = out\.mrrMinor \* 12n/);
});

test("10.6.E.2.0 — listPlatformAuditEntries filters to action prefix 'platform.*'", () => {
  const src = read(QUERIES);
  assert.match(src, /LIKE 'platform\.%'/);
});

// ============================================================================
// /subscriptions/organizations
// ============================================================================

test("10.6.E.2.1 — organizations list page ships", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE_ORGS)));
});

test("10.6.E.2.1 — organizations page renders FilterPills + ListTableCard", () => {
  const src = read(PAGE_ORGS);
  assert.match(src, /<FilterPills /);
  assert.match(src, /<ListTableCard\b/);
});

test("10.6.E.2.1 — organizations page surfaces 5 status filter options", () => {
  const src = read(PAGE_ORGS);
  for (const status of ["All", "Active", "Trial", "Grace", "Cancelled"]) {
    assert.match(src, new RegExp(`label: "${status}"`));
  }
});

test("10.6.E.2.1 — organizations page reads from listSubscriptionOsOrgs (not raw drizzle)", () => {
  const src = read(PAGE_ORGS);
  assert.match(
    src,
    /import \{[\s\S]{0,200}listSubscriptionOsOrgs[\s\S]{0,200}\} from "@\/lib\/subscription-os\/queries";/,
  );
});

// ============================================================================
// /subscriptions/[orgCode]
// ============================================================================

test("10.6.E.2.2 — per-org detail page ships", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE_DETAIL)));
});

test("10.6.E.2.2 — per-org detail uses DetailPageHero with 4-col summaryStrip", () => {
  const src = read(PAGE_DETAIL);
  assert.match(src, /<DetailPageHero/);
  assert.match(src, /summaryStrip=\{\[/);
  // Summary strip has Plan / MRR / Trial-or-Period ends / Customer since
  for (const label of ["Plan", "MRR", "Customer since"]) {
    assert.match(src, new RegExp(`label: "${label}"`));
  }
});

test("10.6.E.2.2 — per-org detail renders lifecycle events list", () => {
  const src = read(PAGE_DETAIL);
  assert.match(src, /Lifecycle events/);
  assert.match(
    src,
    /import \{[\s\S]{0,300}getOrgLifecycleEvents[\s\S]{0,300}\} from "@\/lib\/subscription-os\/queries";/,
  );
});

// ============================================================================
// /subscriptions/revenue
// ============================================================================

test("10.6.E.2.3 — revenue page ships", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE_REVENUE)));
});

test("10.6.E.2.3 — revenue page renders MRR + ARR hero KPIs", () => {
  const src = read(PAGE_REVENUE);
  assert.match(src, /label="MRR"/);
  assert.match(src, /label="ARR"/);
  assert.match(src, /variant="hero"/);
  assert.match(src, /tone="emerald-soft"/);
});

test("10.6.E.2.3 — revenue page surfaces conversion + churn + cancellations", () => {
  const src = read(PAGE_REVENUE);
  assert.match(src, /conversion/);
  assert.match(src, /churn/);
  assert.match(src, /Cancellations/);
});

test("10.6.E.2.3 — revenue page renders per-tier breakdown table", () => {
  const src = read(PAGE_REVENUE);
  assert.match(src, /Customers \+ MRR by plan/);
});

// ============================================================================
// /subscriptions/usage
// ============================================================================

test("10.6.E.2.4 — usage page ships + deep-links to existing AI usage", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE_USAGE)));
  const src = read(PAGE_USAGE);
  assert.match(src, /\/development-os\/settings\/ai-usage/);
});

test("10.6.E.2.4 — usage page surfaces per-product split (Mgmt only / Dev only / Both)", () => {
  const src = read(PAGE_USAGE);
  assert.match(src, /Mgmt OS only/);
  assert.match(src, /Dev OS only/);
});

// ============================================================================
// /subscriptions/audit
// ============================================================================

test("10.6.E.2.6 — platform audit page ships", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE_AUDIT)));
});

test("10.6.E.2.6 — audit page reads from listPlatformAuditEntries", () => {
  const src = read(PAGE_AUDIT);
  assert.match(
    src,
    /import \{[\s\S]{0,200}listPlatformAuditEntries[\s\S]{0,200}\} from "@\/lib\/subscription-os\/queries";/,
  );
});

test("10.6.E.2.6 — audit page renders empty-state pointing to 10.6.E.2.5 impersonation", () => {
  const src = read(PAGE_AUDIT);
  assert.match(src, /10\.6\.E\.2\.5/);
});

// ============================================================================
// Cross-cutting — every page is in (platform-app) layout (Sprint 2 rename
// from (subscription-app); super_admin gating unchanged)
// ============================================================================

test("10.6.E.2 — all 5 admin pages live under (platform-app) layout (super_admin gated)", () => {
  for (const p of [PAGE_ORGS, PAGE_DETAIL, PAGE_REVENUE, PAGE_USAGE, PAGE_AUDIT]) {
    assert.ok(p.startsWith("src/app/(platform-app)/"), `${p} not under platform-app layout`);
  }
});
