/**
 * Stage 10.D — Universal Primitives acceptance tests.
 *
 * 5 primitives ship in this phase + 3 EmptyState wrappers + 3
 * ConfirmDialog convenience variants. Tests verify export shape,
 * client-component contract, prop typing, accessibility hooks, and
 * design-token usage.
 *
 * Read-only: file-content static analysis (no DOM render).
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
const D = "src/components/ui/primitives";

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ============================================================================
// 10.D barrel re-exports
// ============================================================================

test("10.D: barrel index re-exports the 5 primitive families", () => {
  assert.ok(exists(`${D}/index.ts`));
  const src = read(`${D}/index.ts`);
  for (const name of [
    "ConfirmDialog",
    "DeleteConfirmDialog",
    "ArchiveConfirmDialog",
    "RevokeConfirmDialog",
    "EntityFormModal",
    "NoItemsYet",
    "NoMatchingResults",
    "ConfigurationRequired",
    "RowActionsMenu",
    "PageHeaderHero",
  ]) {
    assert.match(
      src,
      new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`),
      `barrel must export ${name}`,
    );
  }
});

// ============================================================================
// 10.D.1 — ConfirmDialog
// ============================================================================

test("10.D.1: ConfirmDialog file exists + is a client component", () => {
  assert.ok(exists(`${D}/confirm-dialog.tsx`));
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /^"use client"/m);
});

test("10.D.1: ConfirmDialog uses Radix Dialog (no custom modal scaffolding)", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /from\s+"@radix-ui\/react-dialog"/);
  assert.match(src, /Dialog\.Root/);
  assert.match(src, /Dialog\.Portal/);
  assert.match(src, /Dialog\.Overlay/);
  assert.match(src, /Dialog\.Content/);
});

test("10.D.1: ConfirmDialog exports 4 callables (generic + 3 convenience)", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  for (const name of [
    "ConfirmDialog",
    "DeleteConfirmDialog",
    "ArchiveConfirmDialog",
    "RevokeConfirmDialog",
  ]) {
    assert.match(src, new RegExp(`export function ${name}\\b`));
  }
});

test("10.D.1: ConfirmDialog declares 3 tones (destructive / warning / neutral)", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /ConfirmTone\s*=\s*"destructive"\s*\|\s*"warning"\s*\|\s*"neutral"/);
});

test("10.D.1: ConfirmDialog supports async onConfirm + busy state + inline error", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /onConfirm:\s*\(\s*\)\s*=>\s*void\s*\|\s*Promise<void>/);
  assert.match(src, /setBusy\(true\)/);
  assert.match(src, /role="alert"/);
  assert.match(src, /Loader2/);
});

test("10.D.1: ConfirmDialog supports type-to-confirm phrase gating", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /typeToConfirm\?:/);
  assert.match(src, /typed === typeToConfirm/);
});

test("10.D.1: DeleteConfirmDialog defaults to 'This cannot be undone' warning + destructive tone", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /This cannot be undone/);
  assert.match(src, /tone="destructive"/);
});

test("10.D.1: ArchiveConfirmDialog uses neutral tone (archive is reversible)", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(src, /export function ArchiveConfirmDialog[\s\S]*?tone="neutral"/);
});

test("10.D.1: RevokeConfirmDialog uses destructive tone + cannot-be-undone warning", () => {
  const src = read(`${D}/confirm-dialog.tsx`);
  assert.match(
    src,
    /export function RevokeConfirmDialog[\s\S]*?tone="destructive"[\s\S]*?This cannot be undone/,
  );
});

// ============================================================================
// 10.D.2 — EntityFormModal
// ============================================================================

test("10.D.2: EntityFormModal file exists + is a client component", () => {
  assert.ok(exists(`${D}/entity-form-modal.tsx`));
  const src = read(`${D}/entity-form-modal.tsx`);
  assert.match(src, /^"use client"/m);
});

test("10.D.2: EntityFormModal supports 7 field types", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  for (const t of [
    '"text"',
    '"textarea"',
    '"number"',
    '"email"',
    '"tel"',
    '"date"',
    '"select"',
    '"checkbox"',
  ]) {
    assert.ok(src.includes(t), `FieldType must include ${t}`);
  }
});

test("10.D.2: EntityFormModal renders required-marker + per-field validation + helper text", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  assert.match(src, /required\?:\s*boolean/);
  // Required marker (shows asterisk).
  assert.match(src, /text-danger ml-0\.5/);
  // Validate fn shape.
  assert.match(src, /validate\?:.*=>.*string\s*\|\s*null/s);
  // Helper text.
  assert.match(src, /helper\?:\s*string/);
});

test("10.D.2: EntityFormModal preserves user input on validation error (no data loss)", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  // After failed submit, busy = false but values stay set.
  assert.match(src, /setBusy\(false\)/);
  // We don't reset values on submit error — verify no `setValues\({}\)` after the catch.
  assert.ok(
    !/catch[\s\S]{0,200}setValues\(\{\}\)/.test(src),
    "EntityFormModal must NOT clear values on submit error",
  );
});

test("10.D.2: EntityFormModal supports column span (1 | 2) for grid layout", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  assert.match(src, /span\?:\s*1\s*\|\s*2/);
  assert.match(src, /col-span-2/);
});

test("10.D.2: EntityFormModal email validator + number coercion built in", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  // Email regex.
  assert.match(src, /\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$/);
  // Number coercion in setField.
  assert.match(src, /Number\(e\.target\.value\)/);
});

test("10.D.2: EntityFormModal disables close + submit while busy (prevents double-submit)", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  assert.match(src, /open=\{open\}\s+onOpenChange=\{busy \?\s*undefined\s*:\s*onOpenChange\}/);
  assert.match(src, /disabled=\{busy\}/);
});

test("10.D.2: EntityFormModal width tiers sm | md | lg + accessible Dialog.Title", () => {
  const src = read(`${D}/entity-form-modal.tsx`);
  assert.match(src, /width\?:.*"sm"\s*\|\s*"md"\s*\|\s*"lg"/s);
  assert.match(src, /Dialog\.Title/);
  assert.match(src, /Dialog\.Description/);
});

// ============================================================================
// 10.D.3 — Empty-state variants
// ============================================================================

test("10.D.3: empty-state-variants file exists (server-safe)", () => {
  assert.ok(exists(`${D}/empty-state-variants.tsx`));
  const src = read(`${D}/empty-state-variants.tsx`);
  // No "use client" — these are server-safe wrappers.
  assert.ok(!/^"use client"/m.test(src));
});

test("10.D.3: NoItemsYet wraps existing EmptyState + accepts addHref OR addAction slot", () => {
  const src = read(`${D}/empty-state-variants.tsx`);
  assert.match(src, /export function NoItemsYet/);
  assert.match(src, /from\s+"@\/components\/ui\/empty-state"/);
  assert.match(src, /addHref\?:/);
  assert.match(src, /addAction\?:\s*React\.ReactNode/);
});

test("10.D.3: NoMatchingResults supports onReset OR resetHref", () => {
  const src = read(`${D}/empty-state-variants.tsx`);
  assert.match(src, /export function NoMatchingResults/);
  assert.match(src, /onReset\?:/);
  assert.match(src, /resetHref\?:/);
  assert.match(src, /Clear filters/);
});

test("10.D.3: ConfigurationRequired requires CTA pair (label + href)", () => {
  const src = read(`${D}/empty-state-variants.tsx`);
  assert.match(src, /export function ConfigurationRequired/);
  assert.match(src, /ctaHref:\s*string/);
  assert.match(src, /ctaLabel:\s*string/);
});

// ============================================================================
// 10.D.4 — RowActionsMenu
// ============================================================================

test("10.D.4: RowActionsMenu file exists + is a client component", () => {
  assert.ok(exists(`${D}/row-actions-menu.tsx`));
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /^"use client"/m);
});

test("10.D.4: RowActionsMenu uses Radix DropdownMenu (no bespoke menu)", () => {
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /from\s+"@radix-ui\/react-dropdown-menu"/);
  assert.match(src, /DropdownMenu\.Root/);
  assert.match(src, /DropdownMenu\.Trigger/);
  assert.match(src, /DropdownMenu\.Content/);
  assert.match(src, /DropdownMenu\.Item/);
});

test("10.D.4: RowAction declares permission-aware shape + danger tone", () => {
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /permitted\?:\s*boolean/);
  assert.match(src, /tone\?:\s*RowActionTone/);
  assert.match(src, /RowActionTone\s*=\s*"neutral"\s*\|\s*"danger"/);
});

test("10.D.4: disabled (permitted: false) items render aria-disabled + non-clickable", () => {
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /aria-disabled=\{disabled\}/);
  assert.match(src, /e\.preventDefault\(\)/);
});

test("10.D.4: destructive items get danger styling", () => {
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /isDestructive[\s\S]{0,200}text-danger/);
});

test("10.D.4: mobile bottom-sheet variant via responsive class (max-sm)", () => {
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /mobileBottomSheet/);
  assert.match(src, /max-sm:fixed/);
  assert.match(src, /max-sm:bottom-0/);
});

test("10.D.4: trigger has accessible aria-label", () => {
  const src = read(`${D}/row-actions-menu.tsx`);
  assert.match(src, /triggerLabel\s*=\s*"Row actions"/);
  assert.match(src, /aria-label=\{triggerLabel\}/);
});

// ============================================================================
// 10.D.5 — PageHeaderHero
// ============================================================================

test("10.D.5: PageHeaderHero file exists (server-safe — no client state)", () => {
  assert.ok(exists(`${D}/page-header-hero.tsx`));
  const src = read(`${D}/page-header-hero.tsx`);
  // No "use client" — slots are passed in by the parent.
  assert.ok(!/^"use client"/m.test(src));
});

test("10.D.5: PageHeaderHero computes greeting from time-of-day", () => {
  const src = read(`${D}/page-header-hero.tsx`);
  assert.match(src, /computeGreeting/);
  assert.match(src, /Good morning/);
  assert.match(src, /Good afternoon/);
  assert.match(src, /Good evening/);
});

test("10.D.5: PageHeaderHero exposes 4 reserved slots (search / notifications / avatar / actions)", () => {
  const src = read(`${D}/page-header-hero.tsx`);
  for (const slot of ["search", "notifications", "avatar", "actions"]) {
    assert.match(
      src,
      new RegExp(`${slot}\\?:\\s*React\\.ReactNode`),
      `slot ${slot} must be in props`,
    );
  }
});

test("10.D.5: PageHeaderHero uses display typography + design tokens", () => {
  const src = read(`${D}/page-header-hero.tsx`);
  // Award-winning hero size.
  assert.match(src, /text-display/);
  assert.match(src, /text-\[44px\]/);
  assert.match(src, /md:text-\[56px\]/);
  // Tokens.
  assert.match(src, /bg-surface/);
  assert.match(src, /border-line-soft/);
});

test("10.D.5: PageHeaderHero accepts a deterministic `now` for SSR / tests", () => {
  const src = read(`${D}/page-header-hero.tsx`);
  assert.match(src, /now\?:\s*Date/);
});

// ============================================================================
// Cross-primitive contracts
// ============================================================================

test("10.D: every new primitive accepts a className escape hatch", () => {
  for (const file of [
    "confirm-dialog.tsx",
    "entity-form-modal.tsx",
    "empty-state-variants.tsx",
    "row-actions-menu.tsx",
    "page-header-hero.tsx",
  ]) {
    const src = read(`${D}/${file}`);
    if (file === "empty-state-variants.tsx") {
      // The variants forward to the existing EmptyState (which already
      // accepts className); they don't take their own.
      continue;
    }
    assert.match(
      src,
      /className\?:\s*string/,
      `${file} must expose className?: string`,
    );
  }
});

test("10.D: every new primitive uses the design-token palette", () => {
  const TOKENS = [
    "bg-surface",
    "bg-muted",
    "text-ink",
    "border-line",
    "text-ink-tertiary",
    "text-accent",
    "bg-accent",
    "text-success",
    "text-danger",
    "bg-danger",
    "text-warning",
  ];
  for (const file of [
    "confirm-dialog.tsx",
    "entity-form-modal.tsx",
    "empty-state-variants.tsx",
    "row-actions-menu.tsx",
    "page-header-hero.tsx",
  ]) {
    const src = read(`${D}/${file}`);
    const hits = TOKENS.filter((t) => src.includes(t)).length;
    assert.ok(
      hits >= 1,
      `${file} must reference at least one design token (got ${hits})`,
    );
  }
});

test("10.D: server-safe contract — empty-state-variants + page-header-hero have no 'use client'", () => {
  for (const file of ["empty-state-variants.tsx", "page-header-hero.tsx"]) {
    const src = read(`${D}/${file}`);
    assert.ok(
      !/^"use client"/m.test(src),
      `${file} must NOT be a client component (server-safe contract)`,
    );
  }
});

test("10.D: client-state contract — confirm-dialog + entity-form-modal + row-actions-menu carry 'use client'", () => {
  for (const file of [
    "confirm-dialog.tsx",
    "entity-form-modal.tsx",
    "row-actions-menu.tsx",
  ]) {
    const src = read(`${D}/${file}`);
    assert.match(
      src,
      /^"use client"/m,
      `${file} owns local state and MUST be marked as client component`,
    );
  }
});

// ============================================================================
// Phase 10.D closure
// ============================================================================

test("Phase 10.D: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-d-decisions.md"));
});

test("Phase 10.D: 5 primitive files + barrel index = 6 new files", () => {
  for (const f of [
    "confirm-dialog.tsx",
    "entity-form-modal.tsx",
    "empty-state-variants.tsx",
    "row-actions-menu.tsx",
    "page-header-hero.tsx",
    "index.ts",
  ]) {
    assert.ok(exists(`${D}/${f}`), `${f} missing`);
  }
});
