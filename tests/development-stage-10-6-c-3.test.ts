/**
 * Stage 10.6 / Phase 10.6.C.3 — detail pages + forms modernization.
 *
 * Foundation:
 *   - DetailPageHero primitive (rounded-3xl card-wrapped entity header
 *     with eyebrow + breadcrumbs + status row + actions + summary strip)
 *   - EmptyState `tone` variant (default | soft | emerald | gold | coral)
 *   - NoItemsYet pass-through `tone`
 *   - EntityFormModal upgraded to rounded-3xl (matches reference vibe)
 *   - EntityModal (HTML5 dialog) upgraded to rounded-3xl
 *
 * Application:
 *   - 3 detail pages migrated to DetailPageHero (villa, project, owner)
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

const HERO = "src/components/ui/primitives/detail-page-hero.tsx";
const EMPTY = "src/components/ui/empty-state.tsx";
const NO_ITEMS = "src/components/ui/primitives/empty-state-variants.tsx";
const FORM_MODAL = "src/components/ui/primitives/entity-form-modal.tsx";
const ENTITY_MODAL = "src/components/forms/entity-modal.tsx";
const BARREL = "src/components/ui/primitives/index.ts";

// ============================================================================
// DetailPageHero primitive
// ============================================================================

test("10.6.C.3.0 — DetailPageHero primitive ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, HERO)));
});

test("10.6.C.3.0 — DetailPageHero exports component + props type", () => {
  const src = read(HERO);
  assert.match(src, /export function DetailPageHero/);
  assert.match(src, /export interface DetailPageHeroProps/);
});

test("10.6.C.3.0 — DetailPageHero is a rounded-3xl card with shadow-soft-card", () => {
  const src = read(HERO);
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
});

test("10.6.C.3.0 — DetailPageHero supports the documented slot shape", () => {
  const src = read(HERO);
  // Required slots
  assert.match(src, /title: string;/);
  // Optional slots — breadcrumbs, eyebrow, description, statusRow, actions, summaryStrip
  for (const prop of [
    "breadcrumbs\\?:",
    "eyebrow\\?: string",
    "description\\?: string",
    "statusRow\\?: React\\.ReactNode",
    "actions\\?: React\\.ReactNode",
    "summaryStrip\\?:",
  ]) {
    assert.match(src, new RegExp(prop), `missing slot: ${prop}`);
  }
});

test("10.6.C.3.0 — DetailPageHero summaryStrip renders a 2/3/4-col grid", () => {
  const src = read(HERO);
  assert.match(
    src,
    /grid-cols-2 md:grid-cols-3 lg:grid-cols-4/,
  );
});

test("10.6.C.3.0 — primitives barrel re-exports DetailPageHero", () => {
  const src = read(BARREL);
  assert.match(
    src,
    /export \{ DetailPageHero \} from "\.\/detail-page-hero";/,
  );
  assert.match(
    src,
    /export type \{ DetailPageHeroProps \} from "\.\/detail-page-hero";/,
  );
});

// ============================================================================
// EmptyState + NoItemsYet tone refresh
// ============================================================================

test("10.6.C.3.1 — EmptyState exports EmptyStateTone with 5 variants", () => {
  const src = read(EMPTY);
  assert.match(src, /export type EmptyStateTone =/);
  for (const tone of ["default", "soft", "emerald", "gold", "coral"]) {
    assert.match(src, new RegExp(`"${tone}"`));
  }
});

test("10.6.C.3.1 — EmptyState tone='soft' uses rounded-3xl + shadow-soft-card (no dashed border)", () => {
  const src = read(EMPTY);
  assert.match(
    src,
    /soft:\s*\n?\s*"rounded-3xl border border-line-soft bg-surface shadow-soft-card/,
  );
});

test("10.6.C.3.1 — EmptyState gradient tones (emerald/gold/coral) use rounded-3xl + matching gradient utility", () => {
  const src = read(EMPTY);
  for (const tone of ["emerald", "gold", "coral"]) {
    const re = new RegExp(
      `${tone}:\\s*\\n?\\s*"rounded-3xl[\\s\\S]*?bg-gradient-${tone}-soft`,
    );
    assert.match(src, re, `tone="${tone}" missing gradient + rounded-3xl`);
  }
});

test("10.6.C.3.1 — EmptyState default tone preserves existing dashed look (no regression)", () => {
  const src = read(EMPTY);
  assert.match(
    src,
    /default:\s*\n?\s*"rounded-md border border-dashed border-line-soft bg-muted\/30/,
  );
});

test("10.6.C.3.1 — NoItemsYet threads tone through to EmptyState", () => {
  const src = read(NO_ITEMS);
  assert.match(src, /tone\?: EmptyStateTone/);
  assert.match(src, /tone=\{tone\}/);
});

// ============================================================================
// Modal styling refresh
// ============================================================================

test("10.6.C.3.3 — EntityFormModal upgraded to rounded-3xl", () => {
  const src = read(FORM_MODAL);
  // The primary Dialog.Content className includes rounded-3xl
  assert.match(
    src,
    /Dialog\.Content[\s\S]{0,400}rounded-3xl bg-surface shadow-\[var\(--shadow-floating\)\]/,
  );
});

test("10.6.C.3.3 — EntityModal (HTML5 dialog) upgraded to rounded-3xl", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /"p-0 rounded-3xl bg-canvas/);
});

// ============================================================================
// Detail page applications (3 high-traffic entity detail pages)
// ============================================================================

const DETAIL_PAGES: Array<{ name: string; path: string }> = [
  {
    name: "/dashboard/villas/[id]",
    path: "src/app/(dashboard)/dashboard/villas/[id]/page.tsx",
  },
  {
    name: "/dashboard/projects/[slug]",
    path: "src/app/(dashboard)/dashboard/projects/[slug]/page.tsx",
  },
  {
    name: "/dashboard/owners/[id]",
    path: "src/app/(dashboard)/dashboard/owners/[id]/page.tsx",
  },
];

for (const p of DETAIL_PAGES) {
  test(`10.6.C.3.2 — ${p.name} imports DetailPageHero`, () => {
    const src = read(p.path);
    assert.match(
      src,
      /import \{ DetailPageHero[^}]*\} from "@\/components\/ui\/primitives";/,
    );
  });

  test(`10.6.C.3.2 — ${p.name} renders <DetailPageHero> with summaryStrip`, () => {
    const src = read(p.path);
    assert.match(src, /<DetailPageHero\b/);
    assert.match(src, /summaryStrip=\{/);
  });

  test(`10.6.C.3.2 — ${p.name} no longer imports legacy PageHeader`, () => {
    const src = read(p.path);
    assert.doesNotMatch(
      src,
      /import \{ PageHeader \} from "@\/components\/ui\/page-header";/,
    );
  });
}
