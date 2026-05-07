/**
 * Stage 6.P0 — CRUD Foundation tests.
 *
 * Test infrastructure note: this project uses pure `tsx --test` (no
 * JSDOM, no React Testing Library). Tests verify file presence, export
 * shape, and source-level invariants — NOT runtime behavior of React
 * components. The Vercel build (verified by Stage 5.J's build-fix
 * test invariants) is the sanity check that the components actually
 * render.
 *
 * P0.3 scope (this file): EntityModal + EntityForm + ConfirmDialog
 * primitives, plus their wiring onto the projects + villas list pages.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const ENTITY_MODAL = "src/components/forms/entity-modal.tsx";
const ENTITY_FORM = "src/components/forms/entity-form.tsx";
const CONFIRM_DIALOG = "src/components/forms/confirm-dialog.tsx";
const FORMS_README = "src/components/forms/README.md";
const PROJECTS_LIST = "src/components/development/projects-list.tsx";
const VILLA_ROW_ACTIONS = "src/components/villas/villa-row-actions.tsx";
const VILLAS_PAGE = "src/app/(dashboard)/dashboard/villas/page.tsx";
const ARCH_DOC = "docs/development-os-architecture.md";
const AUDIT_DOC = "docs/STAGE-6-P0-AUDIT.md";

// ===========================================================================
// 1) Architecture + audit docs are in place
// ===========================================================================

test("architecture doc marks Stage 5.J + 6.P0 + 6.P1 + 6.P2 ACCEPTED (post-P2.F)", () => {
  // Stage 6.P2 closed at the end of P2.F. The ACTIVE marker moves
  // forward to whichever sub-stage is currently in flight.
  const md = read(ARCH_DOC);
  assert.match(md, /\[ACCEPTED 5\.J\]/);
  assert.match(md, /\[ACCEPTED 6\.P0\]/);
  assert.match(md, /\[ACCEPTED 6\.P1\]/);
  assert.match(md, /\[ACCEPTED 6\.P2\]/);
});

test("architecture doc has Stage 6 master section with sub-stage roadmap", () => {
  const md = read(ARCH_DOC);
  assert.match(md, /## Stage 6 — Full Platform Functionality/);
  assert.match(md, /Sub-stage roadmap/);
  // All 9 sub-stages named
  for (const s of ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]) {
    assert.match(md, new RegExp(`\\b${s}\\b`));
  }
});

test("audit doc exists + lists all 7 decisions", () => {
  assert.ok(exists(AUDIT_DOC));
  const md = read(AUDIT_DOC);
  assert.match(md, /Decisions locked at P0\.2 entry/);
  // The 7 questions
  for (const k of [
    "Edit pattern",
    "cost-categories",
    "Contacts vs leads",
    "Group D triage",
    "Phases \\+ land-plots",
    "EntityForm template",
    "Timeline",
  ]) {
    assert.match(md, new RegExp(k));
  }
});

test("audit doc records the 18 CRUD-eligible Group D entities", () => {
  const md = read(AUDIT_DOC);
  assert.match(md, /18 CRUD-eligible Group D entities/);
});

// ===========================================================================
// 2) Primitives exist + carry "use client" + have expected shape
// ===========================================================================

test("EntityModal file exists + is a client component", () => {
  assert.ok(exists(ENTITY_MODAL));
  const src = read(ENTITY_MODAL);
  assert.match(src, /^"use client";/m);
});

test("EntityModal exports a named EntityModal component", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /export function EntityModal\s*\(/);
});

test("EntityModal accepts open + onClose + title + children + size", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /open:\s*boolean/);
  assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
  assert.match(src, /title\?:\s*string/);
  assert.match(src, /children:\s*React\.ReactNode/);
  assert.match(src, /size\?:\s*"sm"\s*\|\s*"md"\s*\|\s*"lg"\s*\|\s*"xl"/);
});

test("EntityModal uses native <dialog> element (no Radix / Headless UI dep)", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /<dialog/);
  assert.match(src, /HTMLDialogElement/);
  assert.doesNotMatch(src, /from\s+["']@radix-ui/);
  assert.doesNotMatch(src, /from\s+["']@headlessui/);
});

test("EntityModal drives showModal() / close() from the open prop", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /\.showModal\(\)/);
  assert.match(src, /\.close\(\)/);
  assert.match(src, /useEffect\(/);
});

test("EntityModal wires the native 'close' event back to onClose (Escape sync)", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /addEventListener\(["']close["']/);
});

test("EntityModal closes on backdrop click", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /onBackdropClick|backdrop/i);
  // The handler checks e.target === ref.current (only the dialog itself, not children)
  assert.match(src, /e\.target\s*===\s*ref\.current/);
});

test("EntityModal close button has 44x44 touch target (mobile)", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /min-h-\[44px\]/);
  assert.match(src, /min-w-\[44px\]/);
});

test("EntityModal carries data-testid for downstream test hooks", () => {
  const src = read(ENTITY_MODAL);
  assert.match(src, /data-testid="entity-modal"/);
});

test("EntityForm file exists + is a client component", () => {
  assert.ok(exists(ENTITY_FORM));
  const src = read(ENTITY_FORM);
  assert.match(src, /^"use client";/m);
});

test("EntityForm uses React 19 useActionState (matches existing platform convention)", () => {
  const src = read(ENTITY_FORM);
  assert.match(src, /useActionState/);
});

test("EntityForm wraps the existing FormShell + SubmitButton", () => {
  const src = read(ENTITY_FORM);
  assert.match(src, /from\s+["']@\/components\/admin\/form-shell["']/);
  assert.match(src, /from\s+["']@\/components\/admin\/submit-button["']/);
});

test("EntityForm exports the ActionResult shape used by every server action", () => {
  const src = read(ENTITY_FORM);
  assert.match(src, /export type ActionResult/);
  assert.match(src, /\{\s*ok:\s*true/);
  assert.match(src, /\{\s*ok:\s*false;\s*error/);
  assert.match(src, /fieldErrors\?:\s*Record<string,\s*string\[\]>/);
});

test("EntityForm supports render-prop children (errs => ReactNode) for field errors", () => {
  const src = read(ENTITY_FORM);
  assert.match(
    src,
    /children:\s*\(errs:\s*Record<string,\s*string\[\]\s*\|\s*undefined>\)\s*=>\s*ReactNode/,
  );
});

test("EntityForm supports onSuccess callback (used by EntityModal to auto-close)", () => {
  const src = read(ENTITY_FORM);
  assert.match(src, /onSuccess\?:\s*\(\)\s*=>\s*void/);
  assert.match(src, /if\s*\(result\.ok\)\s*onSuccess\?\.\(\)/);
});

test("EntityForm supports title=null for bare-form usage inside a modal", () => {
  const src = read(ENTITY_FORM);
  assert.match(src, /title\?:\s*string\s*\|\s*null/);
  assert.match(src, /title === null/);
});

test("ConfirmDialog file exists + is a client component", () => {
  assert.ok(exists(CONFIRM_DIALOG));
  const src = read(CONFIRM_DIALOG);
  assert.match(src, /^"use client";/m);
});

test("ConfirmDialog reuses EntityModal as its shell", () => {
  const src = read(CONFIRM_DIALOG);
  assert.match(src, /import\s+\{\s*EntityModal\s*\}\s+from\s+["']\.\/entity-modal["']/);
});

test("ConfirmDialog uses 'destructive' Button variant (matches existing button.tsx)", () => {
  const src = read(CONFIRM_DIALOG);
  assert.match(src, /variant=\{destructive \? "destructive" : "primary"\}/);
});

test("ConfirmDialog accepts the same (prev, formData) action signature as the rest of the platform", () => {
  const src = read(CONFIRM_DIALOG);
  // The signature is split across multiple lines; collapse whitespace for matching.
  const flat = src.replace(/\s+/g, " ");
  assert.match(
    flat,
    /type ConfirmAction = \( prev: ActionResult \| null, formData: FormData, \) => Promise<ActionResult>/,
  );
});

test("ConfirmDialog accepts hiddenFields (for passing entity id etc.)", () => {
  const src = read(CONFIRM_DIALOG);
  assert.match(src, /hiddenFields\?:\s*Record<string,\s*string>/);
  assert.match(src, /<input key=\{k\} type="hidden" name=\{k\} value=\{v\}/);
});

test("ConfirmDialog renders the action error inline (no toast dependency)", () => {
  const src = read(CONFIRM_DIALOG);
  assert.match(src, /state && !state\.ok/);
  assert.match(src, /\{state\.error\}/);
});

// ===========================================================================
// 3) README documents the pattern
// ===========================================================================

test("forms README exists", () => {
  assert.ok(exists(FORMS_README));
});

test("forms README documents all three primitives", () => {
  const md = read(FORMS_README);
  assert.match(md, /EntityModal/);
  assert.match(md, /EntityForm/);
  assert.match(md, /ConfirmDialog/);
});

test("forms README locks in the workflow-verb convention", () => {
  const md = read(FORMS_README);
  assert.match(md, /Workflow verbs/);
  // examples
  assert.match(md, /Issue invoice from milestone/);
  assert.match(md, /Convert reservation to contract/);
  assert.match(md, /Propose discount/);
});

test("forms README carries the Stage 5.J build-fix lesson", () => {
  const md = read(FORMS_README);
  // README uses backticks around `"use server"`; match without requiring exact quote shape.
  assert.match(md, /use server.*for client-imported actions/);
  assert.match(md, /Stage 5\.J/);
});

test("forms README documents the no-toast-library decision", () => {
  const md = read(FORMS_README);
  assert.match(md, /No toast library/);
  assert.match(md, /sonner|react-hot-toast/);
});

// ===========================================================================
// 4) No new dependencies introduced
// ===========================================================================

test("P0.3 introduces no new toast / modal-shell dependencies (Radix dialog is pre-existing, not used by P0.3)", () => {
  const pkg = JSON.parse(read("package.json"));
  const all = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  // P0.3 deliberately did NOT add a toast lib.
  for (const f of ["sonner", "react-hot-toast"]) {
    assert.equal(
      f in all,
      false,
      `P0.3 must not add toast lib ${f} — feedback flows through ActionResult inline errors`,
    );
  }
  // P0.3's EntityModal is hand-rolled on native <dialog>; no Headless UI / react-aria added.
  for (const f of ["@headlessui/react", "react-aria", "react-modal"]) {
    assert.equal(
      f in all,
      false,
      `P0.3 must not add modal-shell lib ${f} — uses native <dialog>`,
    );
  }
  // Confirm EntityModal does NOT import @radix-ui (even though it's pre-existing in package.json).
  const modalSrc = read(ENTITY_MODAL);
  assert.doesNotMatch(
    modalSrc,
    /from\s+["']@radix-ui/,
    "EntityModal must use native <dialog>, not @radix-ui",
  );
});

// ===========================================================================
// 5) Project list wiring
// ===========================================================================

test("ProjectsList imports EntityModal + ConfirmDialog + ProjectForm + archive action", () => {
  const src = read(PROJECTS_LIST);
  assert.match(src, /import\s+\{\s*EntityModal\s*\}/);
  assert.match(src, /import\s+\{\s*ConfirmDialog\s*\}/);
  assert.match(src, /import\s+\{\s*ProjectForm/);
  assert.match(src, /import\s+\{\s*archiveProjectAction\s*\}/);
});

test("ProjectsList tracks editing + archiving state", () => {
  const src = read(PROJECTS_LIST);
  assert.match(src, /setEditing/);
  assert.match(src, /setArchiving/);
});

test("ProjectsList renders an EntityModal wrapping ProjectForm in edit mode", () => {
  const src = read(PROJECTS_LIST);
  assert.match(src, /<EntityModal/);
  assert.match(src, /<ProjectForm[\s\S]+mode="edit"/);
});

test("ProjectsList renders a ConfirmDialog wired to archiveProjectAction", () => {
  const src = read(PROJECTS_LIST);
  assert.match(src, /<ConfirmDialog/);
  assert.match(src, /action=\{archiveProjectAction\}/);
});

test("Project card edit + archive buttons stop event propagation (cards are wrapped in <Link>)", () => {
  const src = read(PROJECTS_LIST);
  // Either a rowAction helper that calls preventDefault + stopPropagation, OR inline handlers
  assert.match(src, /preventDefault\(\)/);
  assert.match(src, /stopPropagation\(\)/);
});

test("Project card edit + archive buttons carry data-testid attributes", () => {
  const src = read(PROJECTS_LIST);
  assert.match(src, /data-testid="project-card-edit"/);
  assert.match(src, /data-testid="project-card-archive"/);
});

test("Project card buttons meet 44x44 touch target", () => {
  const src = read(PROJECTS_LIST);
  assert.match(src, /min-w-\[44px\]/);
  assert.match(src, /min-h-\[44px\]/);
});

// ===========================================================================
// 6) Villa row actions wiring
// ===========================================================================

test("VillaRowActions file exists + is a client component", () => {
  assert.ok(exists(VILLA_ROW_ACTIONS));
  const src = read(VILLA_ROW_ACTIONS);
  assert.match(src, /^"use client";/m);
});

test("VillaRowActions imports EntityModal + ConfirmDialog + VillaForm + archive action", () => {
  const src = read(VILLA_ROW_ACTIONS);
  assert.match(src, /EntityModal/);
  assert.match(src, /ConfirmDialog/);
  assert.match(src, /VillaForm/);
  assert.match(src, /archiveVillaAction/);
});

test("VillaRowActions accepts the WithSource<VillaListItem> shape returned by listVillas", () => {
  const src = read(VILLA_ROW_ACTIONS);
  // Accepts villa: VillaListItem (or compatible) + projects list
  assert.match(src, /villa:\s*VillaListItem/);
  assert.match(src, /projects:\s*\{\s*id:\s*string;\s*name:\s*string\s*\}\[\]/);
});

test("VillaRowActions stops event propagation (table row may be wrapped in <Link>)", () => {
  const src = read(VILLA_ROW_ACTIONS);
  assert.match(src, /stopPropagation\(\)/);
});

test("VillaRowActions edit + archive buttons carry data-testid + 44x44 touch", () => {
  const src = read(VILLA_ROW_ACTIONS);
  assert.match(src, /data-testid="villa-row-edit"/);
  assert.match(src, /data-testid="villa-row-archive"/);
  assert.match(src, /min-w-\[44px\]/);
  assert.match(src, /min-h-\[44px\]/);
});

test("VillaRowActions renders EntityModal with VillaForm in edit mode", () => {
  const src = read(VILLA_ROW_ACTIONS);
  assert.match(src, /<EntityModal/);
  assert.match(src, /<VillaForm[\s\S]+mode="edit"/);
});

test("VillaRowActions renders ConfirmDialog wired to archiveVillaAction", () => {
  const src = read(VILLA_ROW_ACTIONS);
  assert.match(src, /<ConfirmDialog/);
  assert.match(src, /action=\{archiveVillaAction\}/);
});

test("Villas page mounts VillaRowActions per row + fetches projects list", () => {
  const src = read(VILLAS_PAGE);
  assert.match(src, /import\s+\{\s*VillaRowActions\s*\}/);
  assert.match(src, /import\s+\{\s*listProjects\s*\}/);
  assert.match(src, /<VillaRowActions/);
});

test("Villas page table includes an Actions header column", () => {
  const src = read(VILLAS_PAGE);
  assert.match(src, /<TH[^>]*>\s*Actions\s*<\/TH>/);
  // empty-state colSpan now 8 (was 7)
  assert.match(src, /colSpan=\{8\}/);
});

// ===========================================================================
// 7) Stage 5.J build-fix invariant preserved
// ===========================================================================

test("Stage 5.J build-fix invariant: P0.3 client components do NOT import server-only", () => {
  for (const f of [ENTITY_MODAL, ENTITY_FORM, CONFIRM_DIALOG, VILLA_ROW_ACTIONS]) {
    const src = read(f);
    assert.doesNotMatch(
      src,
      /^import\s+"server-only"/m,
      `${f} must not import "server-only" — it's a client component`,
    );
  }
});

test("Stage 5.J build-fix invariant: every action used by P0.3 client code carries 'use server'", () => {
  for (const actionFile of [
    "src/features/projects/actions.ts",
    "src/features/villas/actions.ts",
  ]) {
    const src = read(actionFile);
    assert.match(
      src,
      /^"use server";/m,
      `${actionFile} must carry the "use server" directive`,
    );
  }
});
