/**
 * Stage 10.6 / Phase 10.6.C.2.0 — List page modernization foundation.
 *
 * Two new primitives:
 *   - <FilterPills> — rounded-full filter chips with active state +
 *     count badge. Server-driven (Link href) or client-driven (onClick).
 *   - <ListTableCard> — rounded-3xl card shell wrapping any table or
 *     list body, with optional header (eyebrow + title + count + actions).
 *
 * Both ship with shadow-soft-card + rounded-3xl tokens from 10.6.C.1.
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

const PILLS = "src/components/ui/primitives/filter-pills.tsx";
const CARD = "src/components/ui/primitives/list-table-card.tsx";
const BARREL = "src/components/ui/primitives/index.ts";

// ============================================================================
// FilterPills primitive
// ============================================================================

test("10.6.C.2.0 — FilterPills primitive ships", () => {
  assert.ok(existsSync(resolve(ROOT, PILLS)));
});

test("10.6.C.2.0 — FilterPills exports component + types", () => {
  const src = read(PILLS);
  assert.match(src, /export function FilterPills/);
  assert.match(src, /export interface FilterPillsProps/);
  assert.match(src, /export interface FilterPillItem/);
});

test("10.6.C.2.0 — FilterPills supports both Link href + onClick + non-clickable spans", () => {
  const src = read(PILLS);
  // Link branch
  assert.match(src, /if \(item\.href\) \{[\s\S]{0,200}<Link/);
  // onClick branch
  assert.match(src, /if \(item\.onClick\) \{[\s\S]{0,200}<button/);
  // Non-clickable fallback
  assert.match(src, /<span[\s\S]{0,80}cursor-default/);
});

test("10.6.C.2.0 — FilterPills active pill uses bg-ink + text-ink-inverse", () => {
  const src = read(PILLS);
  assert.match(src, /isActive[\s\S]{0,80}bg-ink text-ink-inverse/);
});

test("10.6.C.2.0 — FilterPills renders rounded-full pills (reference shape)", () => {
  const src = read(PILLS);
  assert.match(src, /rounded-full/);
});

test("10.6.C.2.0 — FilterPills supports per-pill count badge", () => {
  const src = read(PILLS);
  assert.match(src, /count\?: number;/);
  assert.match(src, /typeof item\.count === "number"/);
});

// ============================================================================
// ListTableCard primitive
// ============================================================================

test("10.6.C.2.0 — ListTableCard primitive ships", () => {
  assert.ok(existsSync(resolve(ROOT, CARD)));
});

test("10.6.C.2.0 — ListTableCard exports component + props type", () => {
  const src = read(CARD);
  assert.match(src, /export function ListTableCard/);
  assert.match(src, /export interface ListTableCardProps/);
});

test("10.6.C.2.0 — ListTableCard wraps body in rounded-3xl + shadow-soft-card", () => {
  const src = read(CARD);
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
});

test("10.6.C.2.0 — ListTableCard renders optional header with eyebrow + title + count + actions", () => {
  const src = read(CARD);
  assert.match(src, /eyebrow\?: string/);
  assert.match(src, /title\?: string/);
  assert.match(src, /count\?: string \| number/);
  assert.match(src, /actions\?: React\.ReactNode/);
});

test("10.6.C.2.0 — ListTableCard supports flushBody (default true) so tables hit edges", () => {
  const src = read(CARD);
  assert.match(src, /flushBody = true/);
  assert.match(src, /flushBody \? "" : "p-6"/);
});

test("10.6.C.2.0 — ListTableCard supports isEmpty + emptyState slot", () => {
  const src = read(CARD);
  assert.match(src, /isEmpty\?: boolean/);
  assert.match(src, /emptyState\?: React\.ReactNode/);
  assert.match(src, /isEmpty && emptyState \? emptyState : children/);
});

// ============================================================================
// Barrel re-exports
// ============================================================================

test("10.6.C.2.0 — primitives barrel re-exports FilterPills + ListTableCard", () => {
  const src = read(BARREL);
  assert.match(
    src,
    /export \{ FilterPills \} from "\.\/filter-pills";/,
  );
  assert.match(
    src,
    /export \{ ListTableCard \} from "\.\/list-table-card";/,
  );
});

test("10.6.C.2.0 — primitives barrel re-exports FilterPillItem + ListTableCardProps types", () => {
  const src = read(BARREL);
  assert.match(src, /FilterPillItem/);
  assert.match(src, /ListTableCardProps/);
});
