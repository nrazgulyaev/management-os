/**
 * Sprint 1 — chart primitives acceptance.
 *
 * Follows the source-inspection pattern used by Stage 10.6.C.1 tests:
 * read the file as text + assert structural invariants. Keeps tests
 * dependency-free (no JSX render harness) which matches the rest of
 * the repo's `node:test`-based test suite.
 *
 * Verifies for each of the 5 new primitives:
 *   - the file exists at the documented path
 *   - the named export is present
 *   - the prop type is exported
 *   - the primitive's distinctive token / library usage is in the file
 *
 * Plus barrel re-export checks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

/**
 * client-tax: the chart primitives were split for lazy-loading — the
 * public named export now lives in `<base>.tsx` (a thin
 * `next/dynamic({ ssr:false })` wrapper), the recharts render moved to
 * `<base>-impl.tsx`, and the shared prop/tone types to `<base>-shared`.
 * These source-inspection guards assert the primitive's distinctive
 * content still exists, so we read the whole module set concatenated.
 */
function readChart(base: string): string {
  const tsx = (suffix: string) =>
    safeRead(`${base}${suffix}.tsx`) + "\n" + safeRead(`${base}${suffix}.ts`);
  return tsx("") + "\n" + tsx("-impl") + "\n" + tsx("-shared");
}

function safeRead(rel: string): string {
  try {
    return readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

const SPARK = "src/components/ui/primitives/sparkline-chart";
const AREA = "src/components/ui/primitives/area-chart-card";
const DONUT = "src/components/ui/primitives/donut-ratio-card";
const PROFILE = "src/components/ui/primitives/profile-rail-card.tsx";
const COMMS = "src/components/ui/primitives/comms-panel.tsx";
const BARREL = "src/components/ui/primitives/index.ts";
const PKG = "package.json";

// ----------------------------------------------------------------------------
// Recharts present in dependencies
// ----------------------------------------------------------------------------
test("sprint-1 — recharts is a direct dependency", () => {
  const pkg = JSON.parse(read(PKG)) as {
    dependencies?: Record<string, string>;
  };
  assert.ok(
    pkg.dependencies?.recharts,
    "expected `recharts` in package.json dependencies",
  );
});

// ----------------------------------------------------------------------------
// SparklineChart
// ----------------------------------------------------------------------------
test("sprint-1 — SparklineChart exports component + props + tone type", () => {
  const src = readChart(SPARK);
  assert.match(src, /export function SparklineChart\(/);
  assert.match(src, /export interface SparklineChartProps/);
  assert.match(src, /export type SparklineTone =/);
});

test("sprint-1 — SparklineChart is a client component using recharts AreaChart", () => {
  const src = readChart(SPARK);
  assert.match(src, /^"use client";/m);
  assert.match(src, /from "recharts"/);
  assert.match(src, /AreaChart/);
});

test("sprint-1 — SparklineChart maps tones to --data-* tokens", () => {
  const src = readChart(SPARK);
  assert.match(src, /var\(--data-emerald\)/);
  assert.match(src, /var\(--data-gold\)/);
  assert.match(src, /var\(--data-sage\)/);
  assert.match(src, /var\(--data-terracotta\)/);
});

test("sprint-1 — SparklineChart short-circuits on <2 data points", () => {
  const src = readChart(SPARK);
  assert.match(src, /data\.length < 2[\s\S]{0,40}return null/);
});

// ----------------------------------------------------------------------------
// AreaChartCard
// ----------------------------------------------------------------------------
test("sprint-1 — AreaChartCard exports component + props + tone + point types", () => {
  const src = readChart(AREA);
  assert.match(src, /export function AreaChartCard\(/);
  assert.match(src, /export interface AreaChartCardProps/);
  assert.match(src, /export interface AreaChartPoint/);
  assert.match(src, /export interface PinnedTooltipSpec/);
  assert.match(src, /export type AreaChartTone =/);
});

test("sprint-1 — AreaChartCard uses hero-card tokens (rounded-3xl + shadow-soft-card + gradient bg)", () => {
  const src = readChart(AREA);
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
  assert.match(src, /bg-gradient-emerald-soft/);
  assert.match(src, /bg-gradient-ink-deep/);
});

test("sprint-1 — AreaChartCard positions pinned tooltip at the series peak", () => {
  const src = readChart(AREA);
  // The peak is located by iterating the data and tracking the max.
  assert.match(src, /peakIndex/);
  // Capsule positioned absolutely with the computed peak percentage.
  assert.match(src, /pinnedTooltip/);
  assert.match(src, /peakPctX/);
});

// ----------------------------------------------------------------------------
// DonutRatioCard
// ----------------------------------------------------------------------------
test("sprint-1 — DonutRatioCard exports component + props + tone type", () => {
  const src = readChart(DONUT);
  assert.match(src, /export function DonutRatioCard\(/);
  assert.match(src, /export interface DonutRatioCardProps/);
  assert.match(src, /export type DonutTone =/);
});

test("sprint-1 — DonutRatioCard uses recharts PieChart with inner radius (donut shape)", () => {
  const src = readChart(DONUT);
  assert.match(src, /from "recharts"/);
  assert.match(src, /PieChart/);
  assert.match(src, /innerRadius/);
});

test("sprint-1 — DonutRatioCard clamps ratio to [0,1]", () => {
  const src = readChart(DONUT);
  assert.match(src, /Math\.max\(0,\s*Math\.min\(1,/);
});

// ----------------------------------------------------------------------------
// ProfileRailCard
// ----------------------------------------------------------------------------
test("sprint-1 — ProfileRailCard exports component + user/org/item types", () => {
  const src = read(PROFILE);
  assert.match(src, /export function ProfileRailCard\(/);
  assert.match(src, /export interface ProfileRailCardProps/);
  assert.match(src, /export interface ProfileUser/);
  assert.match(src, /export interface ProfileOrg/);
  assert.match(src, /export interface ProfileRailItem/);
});

test("sprint-1 — ProfileRailCard reuses the CabinetGreetingBlock avatar gradient ring", () => {
  const src = read(PROFILE);
  // Same gradient-ring class used by cabinet-greeting-block.
  assert.match(
    src,
    /bg-gradient-to-br from-accent via-accent-weak to-gold-weak/,
  );
});

test("sprint-1 — ProfileRailCard renders initials fallback when avatar absent", () => {
  const src = read(PROFILE);
  assert.match(src, /function initials\(/);
});

// ----------------------------------------------------------------------------
// CommsPanel
// ----------------------------------------------------------------------------
test("sprint-1 — CommsPanel exports component + header/item types", () => {
  const src = read(COMMS);
  assert.match(src, /export function CommsPanel\(/);
  assert.match(src, /export interface CommsPanelProps/);
  assert.match(src, /export interface CommsItem/);
  assert.match(src, /export interface CommsHeader/);
});

test("sprint-1 — CommsPanel supports both 'notifications' and 'activity' variants", () => {
  const src = read(COMMS);
  assert.match(src, /variant === "notifications"/);
  assert.match(src, /"activity"/);
});

test("sprint-1 — CommsPanel activity variant aligns left/right bubbles", () => {
  const src = read(COMMS);
  assert.match(src, /side\?: "left" \| "right"/);
  assert.match(src, /justify-end/);
  assert.match(src, /justify-start/);
});

test("sprint-1 — CommsPanel handles empty items gracefully", () => {
  const src = read(COMMS);
  assert.match(src, /items\.length === 0/);
});

// ----------------------------------------------------------------------------
// Barrel re-exports
// ----------------------------------------------------------------------------
test("sprint-1 — primitives barrel re-exports all 5 new primitives", () => {
  const src = read(BARREL);
  assert.match(src, /export \{ SparklineChart \}/);
  assert.match(src, /export \{ AreaChartCard \}/);
  assert.match(src, /export \{ DonutRatioCard \}/);
  assert.match(src, /export \{ ProfileRailCard \}/);
  assert.match(src, /export \{ CommsPanel \}/);
});

test("sprint-1 — primitives barrel re-exports the new prop / tone types", () => {
  const src = read(BARREL);
  assert.match(src, /SparklineChartProps/);
  assert.match(src, /SparklineTone/);
  assert.match(src, /AreaChartCardProps/);
  assert.match(src, /AreaChartPoint/);
  assert.match(src, /AreaChartTone/);
  assert.match(src, /PinnedTooltipSpec/);
  assert.match(src, /DonutRatioCardProps/);
  assert.match(src, /DonutTone/);
  assert.match(src, /ProfileRailCardProps/);
  assert.match(src, /CommsPanelProps/);
});
