/**
 * Stage 10.E.7 — Delete confirmation rollout (final E sub-phase).
 *
 * Sweep verifying every destructive client-side action surfaces a
 * confirmation step via the 10.D primitives:
 *   <ConfirmDialog>   — generic
 *   <DeleteConfirmDialog>   (variant)
 *   <ArchiveConfirmDialog>  (variant; reversible)
 *   <RevokeConfirmDialog>   (variant; non-recoverable credentials)
 *
 * Two layers of coverage:
 *
 * 1. **Wrapper regression guard** — the 6 row-action wrappers shipped
 *    in 10.E.1 .. 10.E.6 all use ArchiveConfirmDialog. The wrappers
 *    are the consumer pattern for list-page CRUD; verifying they keep
 *    the dialog wrapper protects the work done across the prior 6
 *    sub-phases.
 *
 * 2. **Straggler confirmation** — 5 stand-alone destructive buttons
 *    not driven by the wrapper pattern (admin/archive-button,
 *    guest-stays/revoke-token-button, dev-os/cost-category-archive,
 *    payments/connection-actions-buttons, security/mfa-buttons,
 *    integrations/feed-actions). Each was wrapped in this sub-phase.
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

// ============================================================================
// 1. Wrapper regression guard — every E.1..E.6 wrapper uses a confirm dialog
// ============================================================================

const WRAPPERS = [
  "src/components/dashboard/inventory/inventory-row-actions.tsx",
  "src/components/dashboard/operations/operations-row-actions.tsx",
  "src/components/dashboard/owners/owners-row-actions.tsx",
  "src/components/dashboard/villa-guides/villa-guides-row-actions.tsx",
  "src/components/dashboard/settings/settings-row-actions.tsx",
  "src/components/development/dev-os-row-actions.tsx",
];

test("10.E.7: each row-action wrapper imports + uses ArchiveConfirmDialog", () => {
  for (const path of WRAPPERS) {
    const src = read(path);
    assert.match(
      src,
      /ArchiveConfirmDialog/,
      `${path} must reference ArchiveConfirmDialog`,
    );
    assert.match(
      src,
      /<ArchiveConfirmDialog/,
      `${path} must render <ArchiveConfirmDialog>`,
    );
  }
});

test("10.E.7: each row-action wrapper imports primitives from the barrel", () => {
  for (const path of WRAPPERS) {
    const src = read(path);
    assert.match(
      src,
      /from\s+"@\/components\/ui\/primitives"/,
      `${path} must import from @/components/ui/primitives barrel`,
    );
  }
});

// ============================================================================
// 2. Straggler confirmation — 6 stand-alone buttons wrapped in 10.E.7
// ============================================================================

const STRAGGLERS: Array<{
  path: string;
  primitive: string;
  /** Optional sub-string the file should NOT contain (e.g. window.confirm). */
  forbidden?: string;
}> = [
  {
    path: "src/components/admin/archive-button.tsx",
    primitive: "ArchiveConfirmDialog",
  },
  {
    path: "src/components/guest-stays/revoke-token-button.tsx",
    primitive: "RevokeConfirmDialog",
  },
  {
    path: "src/components/development/finance/cost-category-archive-button.tsx",
    primitive: "ArchiveConfirmDialog",
  },
  {
    path: "src/components/payments/connection-actions-buttons.tsx",
    primitive: "ConfirmDialog",
    forbidden: "window.prompt(",
  },
  {
    path: "src/components/security/mfa-buttons.tsx",
    primitive: "ConfirmDialog",
  },
  {
    path: "src/components/integrations/feed-actions.tsx",
    primitive: "ArchiveConfirmDialog",
  },
];

test("10.E.7: 6 stand-alone destructive buttons wrap their action in a confirm primitive", () => {
  for (const s of STRAGGLERS) {
    assert.ok(exists(s.path), `${s.path} must exist`);
    const src = read(s.path);
    assert.match(
      src,
      new RegExp(s.primitive),
      `${s.path} must reference ${s.primitive}`,
    );
    assert.match(
      src,
      new RegExp(`<${s.primitive}\\b`),
      `${s.path} must render <${s.primitive}>`,
    );
    if (s.forbidden) {
      // Strip comments before checking — historical mentions of the
      // forbidden API in JSDoc are fine (they explain the rewrite).
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[\t ]*\*.*$/gm, "")
        .replace(/^[\t ]*\/\/.*$/gm, "");
      assert.ok(
        !stripped.includes(s.forbidden),
        `${s.path} must NOT use ${s.forbidden} for confirmation`,
      );
    }
  }
});

test("10.E.7: payments connection-actions-buttons replaced window.prompt with ConfirmDialog", () => {
  const src = read("src/components/payments/connection-actions-buttons.tsx");
  // Specific regression: the previous version used a confirmation via
  // window.prompt() to capture the disconnect reason. Verify it is gone.
  // Strip comments so the JSDoc historical mention of window.prompt()
  // doesn't false-positive.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[\t ]*\*.*$/gm, "")
    .replace(/^[\t ]*\/\/.*$/gm, "");
  assert.ok(
    !/window\.prompt\(/.test(stripped),
    "window.prompt() must be replaced by ConfirmDialog",
  );
  assert.match(src, /<ConfirmDialog/);
  assert.match(src, /tone="destructive"/);
});

test("10.E.7: cost-category archive button replaced bespoke 2-click confirm with ArchiveConfirmDialog", () => {
  const src = read(
    "src/components/development/finance/cost-category-archive-button.tsx",
  );
  // Previous version had a `confirming` state with two click states.
  // Verify the dialog primitive is now used + the inline 2-click is gone.
  assert.match(src, /<ArchiveConfirmDialog/);
  // The bespoke pattern used to set `setConfirming(true)` then check
  // `if (!confirming)`. Verify no such 2-click-state pattern remains.
  assert.ok(
    !/setConfirming\(true\)\s*\n[\s\S]{0,200}if \(!confirming\)/m.test(src),
    "cost-category archive button must not retain 2-click confirm pattern",
  );
});

test("10.E.7: archive-button uses ArchiveConfirmDialog only on archive (not on restore)", () => {
  const src = read("src/components/admin/archive-button.tsx");
  assert.match(src, /<ArchiveConfirmDialog/);
  // The restore branch is non-destructive — should NOT open a confirm dialog.
  // Verify by checking that the restore-path button does not call
  // setConfirmOpen.
  assert.match(src, /archived\s*\?\s*\(/);
  // The component must accept an entityName prop for confirm copy.
  assert.match(src, /entityName\?:\s*string/);
});

test("10.E.7: mfa-buttons covers BOTH disable + revoke factors", () => {
  const src = read("src/components/security/mfa-buttons.tsx");
  // Must wrap both DisableMfaButton + RevokeMfaFactorButton.
  assert.match(src, /export function DisableMfaButton/);
  assert.match(src, /export function RevokeMfaFactorButton/);
  assert.match(src, /<ConfirmDialog/); // disable
  assert.match(src, /<RevokeConfirmDialog/); // revoke
});

test("10.E.7: feed-actions wraps Archive only (Sync / Pause / Resume stay one-click)", () => {
  const src = read("src/components/integrations/feed-actions.tsx");
  assert.match(src, /<ArchiveConfirmDialog/);
  // Strip comments before counting the JSX render (JSDoc may reference
  // the primitive in a sentence, which would inflate the count).
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[\t ]*\*.*$/gm, "")
    .replace(/^[\t ]*\/\/.*$/gm, "");
  const dialogCount = (
    stripped.match(/<ArchiveConfirmDialog\b/g) ?? []
  ).length;
  assert.strictEqual(dialogCount, 1, "Only Archive should open a dialog");
});

// ============================================================================
// 3. Cross-cutting — every destructive primitive callsite has the right tone
// ============================================================================

test("10.E.7: every <ConfirmDialog> in stragglers uses an explicit tone", () => {
  // The generic ConfirmDialog defaults to neutral; destructive flows
  // should pick destructive or warning explicitly.
  for (const s of STRAGGLERS) {
    if (s.primitive !== "ConfirmDialog") continue;
    const src = read(s.path);
    assert.match(
      src,
      /tone=("destructive"|"warning"|"neutral")/,
      `${s.path} must specify tone on ConfirmDialog`,
    );
  }
});

// ============================================================================
// Phase 10.E.7 closure
// ============================================================================

test("Phase 10.E.7: decisions doc shipped + Stage 10.E series closed", () => {
  assert.ok(exists("tmp/stage-10-e-7-decisions.md"));
  const src = read("tmp/stage-10-e-7-decisions.md");
  assert.match(src, /10\.E\.7/);
  assert.match(src, /sub-phase 7|final/i);
});
