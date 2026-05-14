/**
 * Sprint LD-1 — Landing primitives acceptance.
 *
 * Source-inspection tests for the four new public-facing primitives
 * in src/components/landing/. Page-composition tests live in
 * sprint-ld-1-landing-pages.test.ts (so primitives can ship + pass
 * in isolation before the page rebuilds land).
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
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const PH = "src/components/landing/photographic-hero.tsx";
const AP = "src/components/landing/action-pill-button.tsx";
const CR = "src/components/landing/concentric-rings.tsx";
const DGS = "src/components/landing/dot-grid-streak.tsx";
const BARREL = "src/components/landing/index.ts";

// ============================================================================
// PhotographicHero
// ============================================================================

test("ld-1 — PhotographicHero ships with documented prop surface", () => {
  assert.ok(exists(PH));
  const src = read(PH);
  assert.match(src, /export function PhotographicHero\(/);
  assert.match(src, /bgImageSrc/);
  assert.match(src, /floatingCards/);
  assert.match(src, /rating\?:/);
});

test("ld-1 — PhotographicHero supports an optional video background fallback", () => {
  const src = read(PH);
  assert.match(src, /bgVideoSrc/);
  assert.match(src, /<video/);
  assert.match(src, /muted/);
  assert.match(src, /loop/);
});

test("ld-1 — PhotographicHero renders floating cards in two layouts (stacked mobile, absolute desktop)", () => {
  const src = read(PH);
  assert.match(src, /lg:hidden[\s\S]{0,80}grid/);
  assert.match(src, /hidden lg:block/);
  assert.match(src, /FLOATING_POSITIONS/);
});

test("ld-1 — PhotographicHero exposes 5 tone tokens for floating cards", () => {
  const src = read(PH);
  for (const t of ["emerald", "gold", "coral", "sage", "ink-deep"]) {
    assert.match(src, new RegExp(`"${t}"`));
  }
});

// ============================================================================
// ActionPillButton
// ============================================================================

test("ld-1 — ActionPillButton exposes three variants", () => {
  assert.ok(exists(AP));
  const src = read(AP);
  assert.match(src, /"primary"/);
  assert.match(src, /"secondary"/);
  assert.match(src, /"ghost"/);
});

test("ld-1 — ActionPillButton renders the arrow with group-hover translate animation", () => {
  const src = read(AP);
  assert.match(src, /group-hover:translate-x/);
});

test("ld-1 — ActionPillButton uses next/link for href routing", () => {
  const src = read(AP);
  assert.match(src, /from "next\/link"/);
});

// ============================================================================
// ConcentricRings
// ============================================================================

test("ld-1 — ConcentricRings renders a pure SVG (no recharts, no client island)", () => {
  assert.ok(exists(CR));
  const src = read(CR);
  assert.match(src, /<svg/);
  assert.doesNotMatch(src, /from "recharts"/);
  assert.doesNotMatch(src, /^"use client"/m);
});

test("ld-1 — ConcentricRings exposes 6 tone tokens", () => {
  const src = read(CR);
  for (const t of [
    "ink-deep",
    "ink",
    "emerald",
    "gold",
    "coral",
    "sage",
  ]) {
    assert.match(src, new RegExp(`"${t}"`));
  }
});

test("ld-1 — ConcentricRings accepts 2–5 rings + optional centerLabel", () => {
  const src = read(CR);
  assert.match(src, /centerLabel\?: string/);
  assert.match(src, /Math\.min\(5/);
});

// ============================================================================
// DotGridStreak
// ============================================================================

test("ld-1 — DotGridStreak renders as a pure CSS grid (no SVG, no client)", () => {
  assert.ok(exists(DGS));
  const src = read(DGS);
  assert.match(src, /gridTemplateColumns/);
  assert.doesNotMatch(src, /<svg/);
  assert.doesNotMatch(src, /^"use client"/m);
});

test("ld-1 — DotGridStreak surfaces a filled/total ratio header", () => {
  const src = read(DGS);
  assert.match(src, /\{safeFilled\} \/ \{safeTotal\}/);
});

test("ld-1 — DotGridStreak exposes 5 tone tokens", () => {
  const src = read(DGS);
  for (const t of ["emerald", "gold", "coral", "sage", "ink"]) {
    assert.match(src, new RegExp(`\\b${t}\\b`));
  }
});

// ============================================================================
// Barrel
// ============================================================================

test("ld-1 — landing barrel exports all 4 primitives", () => {
  const src = read(BARREL);
  for (const n of [
    "PhotographicHero",
    "ActionPillButton",
    "ConcentricRings",
    "DotGridStreak",
  ]) {
    assert.match(src, new RegExp(`export\\s*\\{\\s*${n}`));
  }
});
