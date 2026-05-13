/**
 * Sprint 3c — webhook-bridge products_enabled sync acceptance.
 *
 * Behavioural tests for the pure `parseProductsEnabledMetadata`
 * helper + source-inspection invariants for the bridge wiring
 * (apply call sites, audit emission, subscription.deleted preserves
 * access). Plus source-inspection on the products-access redirect
 * carrying the `from` + `reason` query params and the banner
 * component mounting on both product apex pages.
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

const BRIDGE = "src/lib/billing/stripe-subscription-bridge.ts";
const PRODUCTS_ACCESS = "src/features/auth/products-access.ts";
const BANNER = "src/components/layout/product-access-changed-banner.tsx";
const DASHBOARD_APEX = "src/app/(dashboard)/dashboard/page.tsx";
const DEV_OS_APEX = "src/app/(development-app)/development-os/page.tsx";

// ============================================================================
// parseProductsEnabledMetadata — pure helper
// ============================================================================

test("sprint-3c — parseProductsEnabledMetadata returns null for absent metadata", async () => {
  const { parseProductsEnabledMetadata } = await import(
    "../src/lib/billing/stripe-subscription-bridge-pure"
  );
  assert.equal(parseProductsEnabledMetadata(undefined), null);
  assert.equal(parseProductsEnabledMetadata(null), null);
  // Non-string types (e.g. an object) are also treated as missing.
  assert.equal(parseProductsEnabledMetadata({ foo: "bar" }), null);
});

test("sprint-3c — parseProductsEnabledMetadata returns [] for empty string", async () => {
  const { parseProductsEnabledMetadata } = await import(
    "../src/lib/billing/stripe-subscription-bridge-pure"
  );
  assert.deepEqual(parseProductsEnabledMetadata(""), []);
  assert.deepEqual(parseProductsEnabledMetadata("   "), []);
});

test("sprint-3c — parseProductsEnabledMetadata parses comma-separated slugs", async () => {
  const { parseProductsEnabledMetadata } = await import(
    "../src/lib/billing/stripe-subscription-bridge-pure"
  );
  assert.deepEqual(parseProductsEnabledMetadata("mgmt"), ["mgmt"]);
  assert.deepEqual(parseProductsEnabledMetadata("dev"), ["dev"]);
  assert.deepEqual(parseProductsEnabledMetadata("mgmt,dev"), ["mgmt", "dev"]);
  // Whitespace + case are normalized.
  assert.deepEqual(
    parseProductsEnabledMetadata(" MGMT , Dev "),
    ["mgmt", "dev"],
  );
});

test("sprint-3c — parseProductsEnabledMetadata silently drops unknown values", async () => {
  const { parseProductsEnabledMetadata } = await import(
    "../src/lib/billing/stripe-subscription-bridge-pure"
  );
  // Unknown slugs ("bad", "x") are filtered out; valid ones survive.
  assert.deepEqual(
    parseProductsEnabledMetadata("mgmt,bad,dev,x"),
    ["mgmt", "dev"],
  );
  // All-unknown → empty array (NOT null — the metadata WAS present).
  assert.deepEqual(parseProductsEnabledMetadata("bad,other"), []);
});

// ============================================================================
// Bridge wiring — source-inspection
// ============================================================================

test("sprint-3c — bridge imports the audit helpers + pure-module re-export + organizations table", () => {
  const src = read(BRIDGE);
  assert.match(
    src,
    /import \{ recordAuditEvent \} from "@\/features\/audit\/services"/,
  );
  // parseProductsEnabledMetadata moved to the pure sibling module so
  // tests can import it without hitting the `server-only` barrier.
  assert.match(
    src,
    /from "\.\/stripe-subscription-bridge-pure"/,
  );
  assert.match(
    src,
    /import \{ organizations \} from "@\/lib\/db\/schema\/saas"/,
  );
});

test("sprint-3c — applyProductsEnabledFromSubscription helper exists", () => {
  const src = read(BRIDGE);
  assert.match(src, /async function applyProductsEnabledFromSubscription\(/);
});

test("sprint-3c — subscription.created hook calls the helper", () => {
  const src = read(BRIDGE);
  // Find the `subscription.created` case and verify the helper is
  // invoked before the FSM transition.
  assert.match(
    src,
    /customer\.subscription\.created[\s\S]{0,1500}applyProductsEnabledFromSubscription\(/,
  );
});

test("sprint-3c — subscription.updated hook calls the helper", () => {
  const src = read(BRIDGE);
  assert.match(
    src,
    /customer\.subscription\.updated[\s\S]{0,1500}applyProductsEnabledFromSubscription\(/,
  );
});

test("sprint-3c — subscription.deleted does NOT call the helper (preserves access)", () => {
  const src = read(BRIDGE);
  // Extract the `.deleted` case block by matching the case label up to
  // the next `case ` or end-of-switch — then assert the helper is
  // absent within it. Sprint-3c spec section 2.2: keep
  // org.products_enabled as-is on cancel.
  const deletedBlock = src.match(
    /case "customer\.subscription\.deleted":[\s\S]*?(?=case "|\n\s*default:)/,
  );
  assert.ok(deletedBlock, "could not locate .deleted case in bridge");
  assert.doesNotMatch(
    deletedBlock![0],
    /applyProductsEnabledFromSubscription/,
    "subscription.deleted must NOT touch org.products_enabled (Sprint 3c spec 2.2)",
  );
});

test("sprint-3c — helper emits both .changed and .missing audit actions", () => {
  const src = read(BRIDGE);
  assert.match(src, /"billing\.products_enabled\.changed"/);
  assert.match(src, /"billing\.products_enabled\.missing"/);
});

test("sprint-3c — helper compares sets for idempotency before UPDATE", () => {
  const src = read(BRIDGE);
  // Bail early on equal multisets — no DB write, no audit.
  assert.match(src, /currentSet\.size === targetSet\.size/);
  assert.match(src, /if \(same\) return "noop"/);
});

// ============================================================================
// products-access redirect carries from + reason
// ============================================================================

test("sprint-3c — enforceProductAccess redirect stamps from + reason query params", () => {
  const src = read(PRODUCTS_ACCESS);
  // The alternative-product redirect includes `?from=<product>&reason=<…>`.
  assert.match(
    src,
    /PRODUCT_HOME\[alt\]\}\?from=\$\{product\}&reason=\$\{decision\.reason/,
  );
  // The no-product-access redirect at least carries `from`.
  assert.match(src, /\/no-product-access\?from=\$\{product\}/);
});

// ============================================================================
// Banner component + apex mounts
// ============================================================================

test("sprint-3c — ProductAccessChangedBanner component ships", () => {
  assert.ok(existsSync(resolve(ROOT, BANNER)));
  const src = read(BANNER);
  assert.match(src, /export function ProductAccessChangedBanner\(/);
  // Reads `from` + `reason` props.
  assert.match(src, /from\?: string/);
  assert.match(src, /reason\?: string/);
  // Per-reason copy table keys at least the canonical reasons.
  assert.match(src, /product_not_enabled/);
});

test("sprint-3c — Banner returns null when `from` is absent (no-op on direct nav)", () => {
  const src = read(BANNER);
  assert.match(src, /if \(!from\) return null/);
});

test("sprint-3c — Mgmt OS apex page mounts the banner + reads searchParams", () => {
  const src = read(DASHBOARD_APEX);
  assert.match(
    src,
    /import \{ ProductAccessChangedBanner \} from "@\/components\/layout\/product-access-changed-banner"/,
  );
  assert.match(src, /<ProductAccessChangedBanner/);
  assert.match(src, /searchParams\?: Promise<\{[\s\S]{0,200}from\?:/);
});

test("sprint-3c — Dev OS apex page mounts the banner + reads searchParams", () => {
  const src = read(DEV_OS_APEX);
  assert.match(
    src,
    /import \{ ProductAccessChangedBanner \} from "@\/components\/layout\/product-access-changed-banner"/,
  );
  assert.match(src, /<ProductAccessChangedBanner/);
  assert.match(src, /searchParams\?: Promise<\{[\s\S]{0,200}from\?:/);
});

// ============================================================================
// End-to-end packaging → products_enabled mapping correctness
// ============================================================================

test("sprint-3c — Bundle Pro mapping carries products_enabled=['mgmt','dev']", async () => {
  // This is the precise bug that motivated Sprint 3c: a customer
  // who subscribed to Bundle Pro got plan_code=standard but
  // products_enabled stayed at whatever the trial defaulted to.
  // With the marketing-mapping module + the bridge sync, Bundle Pro
  // now resolves to both products correctly end-to-end.
  const { resolveMarketingMapping } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  const m = resolveMarketingMapping("bundle", "pro");
  assert.equal(m.planCode, "standard");
  assert.deepEqual([...m.productsEnabled].sort(), ["dev", "mgmt"]);
});

test("sprint-3c — Mgmt-only Pro mapping carries products_enabled=['mgmt'] only", async () => {
  const { resolveMarketingMapping } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  const m = resolveMarketingMapping("management-only", "pro");
  assert.deepEqual(m.productsEnabled, ["mgmt"]);
});

test("sprint-3c — Dev-only Scale mapping carries products_enabled=['dev'] only", async () => {
  const { resolveMarketingMapping } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  const m = resolveMarketingMapping("development-only", "scale");
  assert.deepEqual(m.productsEnabled, ["dev"]);
  assert.equal(m.planCode, "pro");
});
