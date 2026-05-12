/**
 * Stage 10.6 / Phase 10.6.B.4 — ModalFirstAddButton helper acceptance.
 *
 * The audit found ~60 list pages where the Add CTA navigates to a
 * `/new` route instead of opening an inline modal. The helper primitive
 * `<ModalFirstAddButton>` is the single shared component every consumer
 * should use to restore the Modal-First invariant.
 *
 * These tests are file-based (no JSX runtime) — they assert the
 * primitive's contract surface:
 *   - file exists at the documented path
 *   - exported from the primitives barrel
 *   - accepts the documented prop shape (formComponent + onSuccess/onCancel)
 *   - wraps EntityModal (not a fresh modal impl)
 *   - calls router.refresh() on success
 *   - includes Plus icon + label + optional "Open as full page" footer
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

const HELPER = "src/components/ui/primitives/modal-first-add-button.tsx";
const BARREL = "src/components/ui/primitives/index.ts";

// ============================================================================
// File presence + Stage marker
// ============================================================================

test("10.6.B.4 — ModalFirstAddButton primitive ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, HELPER)), `expected ${HELPER} to exist`);
  const src = read(HELPER);
  assert.match(src, /Stage 10\.6\.B\.4/);
});

test("10.6.B.4 — ModalFirstAddButton re-exported from primitives barrel", () => {
  const src = read(BARREL);
  assert.match(src, /export \{ ModalFirstAddButton \} from "\.\/modal-first-add-button";/);
  assert.match(
    src,
    /export type \{[\s\S]*?ModalFirstAddButtonProps[\s\S]*?ModalFirstFormProps[\s\S]*?\} from "\.\/modal-first-add-button";/,
  );
});

// ============================================================================
// Contract: form callback shape
// ============================================================================

test("10.6.B.4 — ModalFirstFormProps requires onSuccess + onCancel callbacks", () => {
  const src = read(HELPER);
  // The form contract — every consumer's form must accept these two.
  assert.match(src, /export interface ModalFirstFormProps/);
  assert.match(src, /onSuccess: \(\) => void/);
  assert.match(src, /onCancel: \(\) => void/);
});

test("10.6.B.4 — helper accepts formComponent + forwards formProps + supplies callbacks", () => {
  const src = read(HELPER);
  // formComponent is the typed slot for caller-supplied form.
  assert.match(src, /formComponent: React\.ComponentType<TFormProps & ModalFirstFormProps>/);
  // formProps is the typed forward-prop bag.
  assert.match(src, /formProps\?: TFormProps/);
  // Helper supplies onSuccess + onCancel itself.
  assert.match(src, /onSuccess=\{handleSuccess\}/);
  assert.match(src, /onCancel=\{handleCancel\}/);
});

// ============================================================================
// Behavior: success closes modal + refreshes route
// ============================================================================

test("10.6.B.4 — handleSuccess closes modal + calls router.refresh()", () => {
  const src = read(HELPER);
  // Imports useRouter.
  assert.match(src, /import \{ useRouter \} from "next\/navigation";/);
  // handleSuccess body does setOpen(false) + router.refresh.
  assert.match(
    src,
    /handleSuccess[\s\S]{0,120}setOpen\(false\)[\s\S]{0,80}router\.refresh\(\)/,
  );
});

test("10.6.B.4 — handleCancel only closes modal (no refresh)", () => {
  const src = read(HELPER);
  assert.match(src, /handleCancel = React\.useCallback\(\(\) => \{[\s\S]{0,80}setOpen\(false\)/);
  // Cancel should NOT call router.refresh.
  const handleCancelBlock = src.match(
    /handleCancel = React\.useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/,
  );
  assert.ok(handleCancelBlock, "could not locate handleCancel block");
  assert.doesNotMatch(handleCancelBlock[0], /router\.refresh/);
});

// ============================================================================
// Built on EntityModal (not a fresh impl) — leverage existing primitives
// ============================================================================

test("10.6.B.4 — wraps EntityModal (does not re-implement modal shell)", () => {
  const src = read(HELPER);
  assert.match(
    src,
    /import \{ EntityModal \} from "@\/components\/forms\/entity-modal";/,
  );
  assert.match(src, /<EntityModal[\s\S]{0,400}open=\{open\}/);
});

// ============================================================================
// UI affordances
// ============================================================================

test("10.6.B.4 — renders Plus icon + label on the trigger button", () => {
  const src = read(HELPER);
  assert.match(src, /import \{ Plus[^}]*\} from "lucide-react";/);
  assert.match(src, /<Plus className="w-4 h-4"/);
  assert.match(src, /\{label\}/);
});

test('10.6.B.4 — renders optional "Open as full page" deep-link when newRouteHref supplied', () => {
  const src = read(HELPER);
  assert.match(src, /newRouteHref\?: string/);
  // Footer renders the Link when newRouteHref is truthy.
  assert.match(
    src,
    /newRouteHref &&[\s\S]{0,200}<Link[\s\S]{0,80}href=\{newRouteHref\}/,
  );
  assert.match(src, /Open as full page/);
});

// ============================================================================
// Permission / disabled gating
// ============================================================================

test("10.6.B.4 — supports disabled prop to gate the button", () => {
  const src = read(HELPER);
  assert.match(src, /disabled\?: boolean/);
  assert.match(src, /disabled=\{disabled\}/);
});
