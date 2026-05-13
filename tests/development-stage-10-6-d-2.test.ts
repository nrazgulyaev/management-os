/**
 * Stage 10.6 / Phase 10.6.D.2 — Integrations command center.
 *
 * 15 external integrations need a unified surface so the operator can:
 *   - See at a glance which are configured, env-only, or need attention
 *   - Click through to the right per-integration settings page
 *   - Triage what to fix before customer launch
 *
 * 10.6.D.2.0 ships:
 *   - <IntegrationStatusCard> primitive with 5 status tones
 *   - /dashboard/settings/integrations hub page rendering all 15
 *
 * Per-integration deep-dives (Stripe Connect / Resend per-org / Maps /
 * WhatsApp per-org / channel managers full OAuth) ship in 10.6.D.2.x
 * follow-up sub-phases — each gets its own halt for operator review.
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

const CARD = "src/components/ui/primitives/integration-status-card.tsx";
const HUB = "src/app/(dashboard)/dashboard/settings/integrations/page.tsx";
const BARREL = "src/components/ui/primitives/index.ts";

// ============================================================================
// IntegrationStatusCard primitive
// ============================================================================

test("10.6.D.2.0 — IntegrationStatusCard ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, CARD)));
});

test("10.6.D.2.0 — IntegrationStatusCard exports component + props + status type", () => {
  const src = read(CARD);
  assert.match(src, /export function IntegrationStatusCard/);
  assert.match(src, /export interface IntegrationStatusCardProps/);
  assert.match(src, /export type IntegrationStatus =/);
});

test("10.6.D.2.0 — IntegrationStatusCard supports all 5 status tones", () => {
  const src = read(CARD);
  for (const status of [
    "configured",
    "ready",
    "needs-config",
    "broken",
    "not-available",
  ]) {
    assert.match(src, new RegExp(`"${status}"`));
  }
});

test("10.6.D.2.0 — IntegrationStatusCard uses rounded-3xl + shadow-soft-card (10.6.C token system)", () => {
  const src = read(CARD);
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
  assert.match(src, /hover:shadow-elevated-card/);
});

test("10.6.D.2.0 — IntegrationStatusCard surfaces the broken errorMessage in a danger pill", () => {
  const src = read(CARD);
  assert.match(
    src,
    /status === "broken"[\s\S]{0,200}errorMessage[\s\S]{0,200}text-danger bg-danger-weak/,
  );
});

test("10.6.D.2.0 — IntegrationStatusCard distinguishes per-org vs platform scope visibly", () => {
  const src = read(CARD);
  assert.match(src, /scope: "per-org" \| "platform"/);
  assert.match(src, /scope === "per-org" \? "Per-org" : "Platform-wide"/);
});

// ============================================================================
// Integrations hub page
// ============================================================================

test("10.6.D.2.1 — /dashboard/settings/integrations hub page ships", () => {
  assert.ok(existsSync(resolve(ROOT, HUB)));
});

test("10.6.D.2.1 — hub page renders IntegrationStatusCard per integration", () => {
  const src = read(HUB);
  assert.match(
    src,
    /import \{[\s\S]{0,300}IntegrationStatusCard[\s\S]{0,300}\} from "@\/components\/ui\/primitives";/,
  );
  assert.match(src, /<IntegrationStatusCard /);
});

test("10.6.D.2.1 — hub page surfaces all 15 integrations in the integrations array", () => {
  const src = read(HUB);
  // Each integration entry has `name:` — count them
  const names = src.match(/^\s*name:\s*"/gm);
  assert.ok(
    names && names.length >= 15,
    `expected 15+ integrations, got ${names?.length ?? 0}`,
  );
});

test("10.6.D.2.1 — hub page covers the customer-launch priority integrations", () => {
  const src = read(HUB);
  for (const name of [
    "AI providers",
    "Stripe Connect",
    "Resend",
    "WhatsApp",
    "Channel managers",
    "Maps",
    "Calendar feeds",
    "Banking sync",
    "Marketing connections",
    "Webhooks",
    "Document storage",
    "Cron",
    "Credential KMS",
  ]) {
    assert.match(
      src,
      new RegExp(`name:\\s*"${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`),
      `missing integration: ${name}`,
    );
  }
});

test("10.6.D.2.1 — hub page resolves env-var-driven status (RESEND_API_KEY, STRIPE_SECRET_KEY, etc.)", () => {
  const src = read(HUB);
  for (const env of [
    "RESEND_API_KEY",
    "STRIPE_SECRET_KEY",
    "TWILIO_ACCOUNT_SID",
    "ANTHROPIC_API_KEY",
    "STAY_LINK_KMS_SECRET",
    "CRON_SECRET",
  ]) {
    assert.match(src, new RegExp(env));
  }
});

test("10.6.D.2.1 — hub page summary counts configured / ready / need-setup / need-attention", () => {
  const src = read(HUB);
  for (const counter of ["configured", "ready", "needsConfig", "broken"]) {
    assert.match(src, new RegExp(`${counter}:`));
  }
});

test("10.6.D.2.1 — hub page is gap-10 + 3-col responsive grid (matches 10.6.C list-page rhythm)", () => {
  const src = read(HUB);
  assert.match(src, /flex flex-col gap-10/);
  assert.match(src, /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5/);
});

// ============================================================================
// Barrel re-exports
// ============================================================================

test("10.6.D.2.0 — primitives barrel re-exports IntegrationStatusCard + types", () => {
  const src = read(BARREL);
  assert.match(
    src,
    /export \{ IntegrationStatusCard \} from "\.\/integration-status-card";/,
  );
  assert.match(src, /IntegrationStatusCardProps/);
  assert.match(src, /IntegrationStatus,/);
});
