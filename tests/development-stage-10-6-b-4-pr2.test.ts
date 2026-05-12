/**
 * Stage 10.6 / Phase 10.6.B.4.2 — Modal-First migration PR 2.
 *
 * Migrates Mgmt OS villas + projects from `/new`-link Add buttons to
 * inline `<ModalFirstAddButton>` triggers, using the shared form
 * `useModalOrRouteForm` hook for redirect-safe submission.
 *
 * These tests assert the structural contract — the actual modal-open
 * behavior is covered by the helper-level tests in
 * tests/development-stage-10-6-b-4-helper.test.ts.
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

const HOOK = "src/lib/forms/use-modal-or-route-form.ts";

// ============================================================================
// Step A — useModalOrRouteForm hook
// ============================================================================

test("10.6.B.4.2.A — useModalOrRouteForm hook ships + isRedirectError-aware", () => {
  assert.ok(existsSync(resolve(ROOT, HOOK)));
  const src = read(HOOK);
  // Imports the redirect-error sentinel from Next.js so success-by-redirect
  // can be intercepted in modal mode (matches the layout-level pattern
  // shipped in 10.6.B.2-fix).
  assert.match(
    src,
    /import \{ isRedirectError \} from "next\/dist\/client\/components\/redirect-error";/,
  );
  // Modal-mode submission catches redirect signals + calls onSuccess.
  assert.match(
    src,
    /isRedirectError\(err\)[\s\S]{0,200}onSuccess\?\.\(\)/,
  );
  // Returns the {state, submitAction, pending, isModal} contract.
  assert.match(src, /submitAction: isModal \? modalSubmit : dispatch/);
});

// ============================================================================
// Step B — Migrated forms accept onSuccess + onCancel
// ============================================================================

const MIGRATED_FORMS: Array<{ name: string; file: string }> = [
  { name: "VillaForm", file: "src/features/villas/form.tsx" },
  { name: "ProjectForm", file: "src/features/projects/form.tsx" },
];

for (const { name, file } of MIGRATED_FORMS) {
  test(`10.6.B.4.2.B — ${name} accepts onSuccess + onCancel`, () => {
    const src = read(file);
    assert.match(src, /onSuccess\?: \(\) => void;/, `${name} missing onSuccess prop`);
    assert.match(src, /onCancel\?: \(\) => void;/, `${name} missing onCancel prop`);
  });

  test(`10.6.B.4.2.B — ${name} uses useModalOrRouteForm hook`, () => {
    const src = read(file);
    assert.match(
      src,
      /import \{ useModalOrRouteForm \} from "@\/lib\/forms\/use-modal-or-route-form";/,
      `${name} missing hook import`,
    );
    assert.match(
      src,
      /const \{ state, submitAction, pending \} = useModalOrRouteForm/,
      `${name} not using hook output`,
    );
    // Form action is bound to submitAction (not the legacy dispatch).
    assert.match(src, /<form action=\{submitAction\}>/, `${name} not wired to submitAction`);
  });

  test(`10.6.B.4.2.B — ${name} Cancel branches: onCancel button vs cancelHref Link`, () => {
    const src = read(file);
    // Cancel-as-button when onCancel provided.
    assert.match(
      src,
      /onCancel \? \(\s*<Button[\s\S]{0,200}onClick=\{onCancel\}/,
      `${name} missing onCancel branch in Cancel button`,
    );
    // Cancel-as-Link fallback for /new route mode.
    assert.match(
      src,
      /<Link href=\{cancelHref\}>Cancel<\/Link>/,
      `${name} missing cancelHref Link fallback`,
    );
  });
}

// ============================================================================
// Step C — List pages use ModalFirstAddButton (NO direct /new Link for Add)
// ============================================================================

const MIGRATED_LIST_PAGES: Array<{
  page: string;
  addButton: string;
  badPattern: RegExp;
}> = [
  {
    page: "src/app/(dashboard)/dashboard/villas/page.tsx",
    addButton: "src/components/villas/villa-add-button.tsx",
    badPattern: /<Link href="\/dashboard\/villas\/new">[\s\S]{0,80}Add villa[\s\S]{0,80}<\/Link>/,
  },
  {
    page: "src/app/(dashboard)/dashboard/projects/page.tsx",
    addButton: "src/components/projects/project-add-button.tsx",
    badPattern: /<Link href="\/dashboard\/projects\/new">[\s\S]{0,80}New project[\s\S]{0,80}<\/Link>/,
  },
];

for (const { page, addButton, badPattern } of MIGRATED_LIST_PAGES) {
  test(`10.6.B.4.2.C — ${page} ships its *-add-button wrapper`, () => {
    assert.ok(existsSync(resolve(ROOT, addButton)), `${addButton} missing`);
    const src = read(addButton);
    assert.match(
      src,
      /import \{ ModalFirstAddButton \} from "@\/components\/ui\/primitives\/modal-first-add-button";/,
    );
  });

  test(`10.6.B.4.2.C — ${page} renders the AddButton wrapper, NOT a Link to /new`, () => {
    const src = read(page);
    const fileName = addButton.split("/").pop()!.replace(".tsx", "");
    const wrapperName = fileName
      .split("-")
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join("");
    assert.match(
      src,
      new RegExp(`<${wrapperName}[\\s/]`),
      `${page} doesn't render <${wrapperName} />`,
    );
    assert.doesNotMatch(
      src,
      badPattern,
      `${page} still renders Link to /new for Add CTA (Modal-First violation)`,
    );
  });
}

// ============================================================================
// Step D — /new route deep-link survival
// ============================================================================

for (const slug of ["villas", "projects"]) {
  test(`10.6.B.4.2.D — /dashboard/${slug}/new route page still exists (deep-link fallback)`, () => {
    const newRoute = `src/app/(dashboard)/dashboard/${slug}/new/page.tsx`;
    assert.ok(
      existsSync(resolve(ROOT, newRoute)),
      `${newRoute} must stay for deep-link survival`,
    );
  });
}
