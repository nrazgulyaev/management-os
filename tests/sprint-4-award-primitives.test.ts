/**
 * Sprint 4 — Award primitive acceptance.
 *
 * Source-inspection tests (no React render harness) following the
 * Sprint-1/2/3 pattern.
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

const HERO = "src/components/award/hero-greeting-ai.tsx";
const HERO_INPUT = "src/components/award/hero-greeting-ai-input.tsx";
const DONUT = "src/components/award/half-donut-gauge.tsx";
const BAR = "src/components/award/hatched-bar-chart.tsx";
const KPI = "src/components/award/kpi-row-mixed.tsx";
const TEAM = "src/components/award/team-row-list.tsx";
const BARREL = "src/components/award/index.ts";

// ============================================================================
// HeroGreetingAI
// ============================================================================

test("sprint-4 — HeroGreetingAI ships with greeting + input island", () => {
  assert.ok(existsSync(resolve(ROOT, HERO)));
  const src = read(HERO);
  assert.match(src, /export function HeroGreetingAI\(/);
  // Server-component shell — must NOT have "use client" at the top.
  assert.doesNotMatch(src.split("\n").slice(0, 5).join("\n"), /"use client"/);
  // Mounts the client island, not raw inputs.
  assert.match(src, /import \{ HeroAskInput.*HeroAskAction.*\} from "\.\/hero-greeting-ai-input"/);
  // Greeting copy.
  assert.match(src, /Hey,/);
});

test("sprint-4 — HeroGreetingAI input island is a client component using useActionState", () => {
  assert.ok(existsSync(resolve(ROOT, HERO_INPUT)));
  const src = read(HERO_INPUT);
  // "use client" directive present (location varies — header comment
  // can precede it). The regex matches at line start anywhere in the
  // file.
  assert.match(src, /^"use client";/m);
  assert.match(src, /useActionState/);
  assert.match(src, /export type HeroAskAction/);
});

// ============================================================================
// HalfDonutGauge — pure SVG
// ============================================================================

test("sprint-4 — HalfDonutGauge ships as pure SVG (no recharts import)", () => {
  assert.ok(existsSync(resolve(ROOT, DONUT)));
  const src = read(DONUT);
  assert.match(src, /export function HalfDonutGauge\(/);
  assert.doesNotMatch(src, /from "recharts"/);
  // Uses --data-* tokens.
  assert.match(src, /var\(--data-emerald\)/);
  // Clamps ratio.
  assert.match(src, /Math\.max\(0, Math\.min\(1,/);
});

// ============================================================================
// HatchedBarChart
// ============================================================================

test("sprint-4 — HatchedBarChart uses Recharts BarChart with a custom shape", () => {
  assert.ok(existsSync(resolve(ROOT, BAR)));
  const src = read(BAR);
  assert.match(src, /^"use client";/m);
  assert.match(src, /from "recharts"/);
  assert.match(src, /BarChart/);
  assert.match(src, /shape=\{/);
  // <pattern> element for diagonal hatch fill.
  assert.match(src, /<pattern\b/);
});

test("sprint-4 — HatchedBarChart highlightIndex renders an inline caption chip", () => {
  const src = read(BAR);
  // The custom shape draws a chip with the highlight label.
  assert.match(src, /highlightLabel/);
  assert.match(src, /<rect[\s\S]{0,300}rx=\{10\}/);
});

// ============================================================================
// KpiRowMixed
// ============================================================================

test("sprint-4 — KpiRowMixed exports component + hero tones", () => {
  assert.ok(existsSync(resolve(ROOT, KPI)));
  const src = read(KPI);
  assert.match(src, /export function KpiRowMixed\(/);
  assert.match(src, /export type KpiHeroTone =/);
  // All four hero tone keys.
  for (const k of ["emerald-solid", "gold-solid", "coral-solid", "ink-deep"]) {
    assert.match(src, new RegExp(`"${k}"`), `missing hero tone: ${k}`);
  }
});

test("sprint-4 — KpiRowMixed renders the first item with the hero tone, rest with surface", () => {
  const src = read(KPI);
  // First card → isHero=true; isHero?HERO_BG:bg-surface
  assert.match(src, /isHero={i === 0}/);
  // Surface fallback.
  assert.match(src, /bg-surface text-ink/);
});

// ============================================================================
// TeamRowList
// ============================================================================

test("sprint-4 — TeamRowList exports component + 5 status tones", () => {
  assert.ok(existsSync(resolve(ROOT, TEAM)));
  const src = read(TEAM);
  assert.match(src, /export function TeamRowList\(/);
  for (const s of [
    "completed",
    "in_progress",
    "pending",
    "blocked",
    "neutral",
  ]) {
    assert.match(
      src,
      new RegExp(`${s}:\\s*"`),
      `missing TeamRowStatus key: ${s}`,
    );
  }
});

test("sprint-4 — TeamRowList falls back to initials when avatar absent", () => {
  const src = read(TEAM);
  assert.match(src, /function initials\(/);
});

// ============================================================================
// Barrel
// ============================================================================

test("sprint-4 — award barrel re-exports all five components", () => {
  const src = read(BARREL);
  for (const ex of [
    "HeroGreetingAI",
    "HalfDonutGauge",
    "HatchedBarChart",
    "KpiRowMixed",
    "TeamRowList",
  ]) {
    assert.match(
      src,
      new RegExp(`export \\{ ${ex} \\}`),
      `barrel missing export: ${ex}`,
    );
  }
});
