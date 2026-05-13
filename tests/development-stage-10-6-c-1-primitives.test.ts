/**
 * Stage 10.6 / Phase 10.6.C.1.1 — Primitive enhancement acceptance.
 *
 * Verifies:
 *   - DashboardKpi adds `variant: "default" | "hero"` and `tone` props
 *   - DashboardKpi default variant preserves existing 28px size
 *     (backward compatibility — every Stage 10.B-10.5.A consumer
 *     expects the smaller size when variant is omitted)
 *   - DashboardKpi hero variant uses 56px+ display size + rounded-3xl
 *   - DashboardKpi tone="ink-deep" inverts text colors
 *   - CabinetGreetingBlock primitive ships at the documented path
 *   - CabinetGreetingBlock greets time-of-day appropriately
 *   - CabinetGreetingBlock falls back to "there" when firstName missing
 *   - Both new primitives are re-exported from the barrel
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

const KPI = "src/components/ui/primitives/dashboard-kpi.tsx";
const GREETING = "src/components/ui/primitives/cabinet-greeting-block.tsx";
const BARREL = "src/components/ui/primitives/index.ts";

// ============================================================================
// DashboardKpi — variant + tone
// ============================================================================

test("10.6.C.1.1 — DashboardKpi exports KpiVariant + KpiTone", () => {
  const src = read(KPI);
  assert.match(src, /export type KpiVariant = "default" \| "hero";/);
  assert.match(
    src,
    /export type KpiTone =[\s\S]{0,200}"emerald-soft"[\s\S]{0,200}"ink-deep"/,
  );
});

test("10.6.C.1.1 — DashboardKpi default variant preserves 28px size", () => {
  const src = read(KPI);
  // The conditional must include the 28px fallback for non-hero variant.
  assert.match(src, /text-\[28px\] leading-\[32px\]/);
});

test("10.6.C.1.1 — DashboardKpi hero variant uses 56-64px display size", () => {
  const src = read(KPI);
  assert.match(
    src,
    /text-\[56px\][\s\S]{0,80}md:text-\[64px\]/,
  );
});

test("10.6.C.1.1 — DashboardKpi hero variant uses rounded-3xl + soft-card shadow", () => {
  const src = read(KPI);
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
});

test("10.6.C.1.1 — DashboardKpi tone='ink-deep' inverts text colors", () => {
  const src = read(KPI);
  // ink-deep tone applies bg gradient + text-ink-inverse
  assert.match(src, /"ink-deep":\s*"bg-gradient-ink-deep text-ink-inverse"/);
  // The label/value contain `isDarkTone` checks
  assert.match(src, /isDarkTone &&/);
});

test("10.6.C.1.1 — DashboardKpi default variant defaults to bg-surface (no regression)", () => {
  const src = read(KPI);
  assert.match(src, /"surface":\s*"bg-surface"/);
});

// ============================================================================
// CabinetGreetingBlock primitive
// ============================================================================

test("10.6.C.1.1 — CabinetGreetingBlock ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, GREETING)));
});

test("10.6.C.1.1 — CabinetGreetingBlock exports the typed component", () => {
  const src = read(GREETING);
  assert.match(src, /export function CabinetGreetingBlock/);
  assert.match(src, /export interface CabinetGreetingBlockProps/);
});

test("10.6.C.1.1 — CabinetGreetingBlock falls back to 'there' when firstName missing", () => {
  const src = read(GREETING);
  assert.match(src, /firstName\?\.trim\(\) \|\| "there"/);
});

test("10.6.C.1.1 — CabinetGreetingBlock computes Good morning/afternoon/evening", () => {
  const src = read(GREETING);
  for (const greeting of ["Good morning", "Good afternoon", "Good evening"]) {
    assert.match(src, new RegExp(`return "${greeting}";`));
  }
});

test("10.6.C.1.1 — CabinetGreetingBlock supports avatar + badge slots", () => {
  const src = read(GREETING);
  assert.match(src, /avatar\?: React\.ReactNode/);
  assert.match(src, /badge\?: React\.ReactNode/);
  // Avatar wrapped in gradient ring
  assert.match(src, /bg-gradient-to-br from-accent/);
});

test("10.6.C.1.1 — CabinetGreetingBlock accepts deterministic 'now' for SSR/tests", () => {
  const src = read(GREETING);
  assert.match(src, /now\?: Date/);
  assert.match(src, /computeGreeting\(now \?\? new Date\(\)\)/);
});

// ============================================================================
// Barrel re-exports
// ============================================================================

test("10.6.C.1.1 — primitives barrel re-exports CabinetGreetingBlock", () => {
  const src = read(BARREL);
  assert.match(
    src,
    /export \{ CabinetGreetingBlock \} from "\.\/cabinet-greeting-block";/,
  );
  assert.match(
    src,
    /export type \{ CabinetGreetingBlockProps \} from "\.\/cabinet-greeting-block";/,
  );
});

test("10.6.C.1.1 — primitives barrel re-exports KpiVariant + KpiTone types", () => {
  const src = read(BARREL);
  assert.match(src, /KpiVariant/);
  assert.match(src, /KpiTone/);
});
