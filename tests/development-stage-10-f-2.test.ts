/**
 * Stage 10.F.2 — Modal-First Add Forms (Dev OS) acceptance tests.
 *
 * Two-part rollout:
 *
 * Part A — verified the 14 existing Dev-OS modal-Add components built
 * on the older `<EntityModal>` shell are pattern-compliant; backfilled
 * `addAction` on the 2 pages that used `<NoItemsYet>` without it.
 *
 * Part B — converted 3 of the audit's outstanding `<Link href="/new">`
 * Dev-OS Add patterns to `<EntityFormModal>`-driven Add via new
 * add-button companions:
 *
 *   /development-os/quality-standards   → <AddQualityStandardButton>
 *   /development-os/drawings            → <AddDrawingButton>
 *   /development-os/boq                 → <AddBoqButton>
 *
 * Deferred to /new page (4): distributions, method-statements, safety,
 * banking. qa-qc also deferred (2 required FKs + dependent dropdowns).
 * See tmp/stage-10-f-2-decisions.md.
 *
 * No new server actions (per pattern-guide rule); all Add buttons
 * re-use existing typed-input `create*` actions.
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

const QS_BUTTONS =
  "src/components/development/quality-standards/quality-standards-add-buttons.tsx";
const DRAWINGS_BUTTONS =
  "src/components/development/drawings/drawings-add-buttons.tsx";
const BOQ_BUTTONS = "src/components/development/boq/boq-add-buttons.tsx";

const QS_PAGE =
  "src/app/(development-app)/development-os/quality-standards/page.tsx";
const DRAWINGS_PAGE =
  "src/app/(development-app)/development-os/drawings/page.tsx";
const BOQ_PAGE = "src/app/(development-app)/development-os/boq/page.tsx";
const ASSET_TYPES_PAGE =
  "src/app/(development-app)/development-os/asset-types/page.tsx";
const LEAD_SOURCES_PAGE =
  "src/app/(development-app)/development-os/marketing/lead-sources/page.tsx";

const PATTERN_DOC = "docs/stage-10-modal-pattern.md";
const DECISIONS_DOC = "tmp/stage-10-f-2-decisions.md";

// ----- Part B: 3 newly converted add-button modules exist + use the pattern.

test("10.F.2 — quality-standards add-button module exists", () => {
  assert.ok(exists(QS_BUTTONS), `Missing ${QS_BUTTONS}`);
});

test("10.F.2 — drawings add-button module exists", () => {
  assert.ok(exists(DRAWINGS_BUTTONS), `Missing ${DRAWINGS_BUTTONS}`);
});

test("10.F.2 — boq add-button module exists", () => {
  assert.ok(exists(BOQ_BUTTONS), `Missing ${BOQ_BUTTONS}`);
});

test("10.F.2 — all 3 add-button modules use <EntityFormModal>", () => {
  for (const file of [QS_BUTTONS, DRAWINGS_BUTTONS, BOQ_BUTTONS]) {
    const src = read(file);
    assert.match(
      src,
      /EntityFormModal/,
      `${file} must use <EntityFormModal> from 10.D primitives`,
    );
    assert.match(
      src,
      /from "@\/components\/ui\/primitives"/,
      `${file} must import from primitives barrel`,
    );
  }
});

test("10.F.2 — all 3 add-button modules call existing create* server action (no new server-side code)", () => {
  const expectations: Array<[string, RegExp]> = [
    [QS_BUTTONS, /createQualityStandard/],
    [DRAWINGS_BUTTONS, /createDrawing/],
    [BOQ_BUTTONS, /createBoqDocument/],
  ];
  for (const [file, action] of expectations) {
    const src = read(file);
    assert.match(src, action, `${file} must re-use ${action.source}`);
  }
});

test("10.F.2 — all 3 add-button modules call router.refresh() (not router.push) on success", () => {
  for (const file of [QS_BUTTONS, DRAWINGS_BUTTONS, BOQ_BUTTONS]) {
    const src = read(file);
    assert.match(
      src,
      /router\.refresh\(\)/,
      `${file} must call router.refresh()`,
    );
    assert.doesNotMatch(
      src,
      /router\.push\(/,
      `${file} must NOT call router.push() (operator stays on list page)`,
    );
  }
});

test("10.F.2 — drawings + boq buttons accept projects prop + render disabled when empty", () => {
  for (const file of [DRAWINGS_BUTTONS, BOQ_BUTTONS]) {
    const src = read(file);
    assert.match(
      src,
      /projects:\s*Array<\{\s*id:\s*string;\s*name:\s*string\s*\}>/,
      `${file} must accept projects: {id, name}[]`,
    );
    assert.match(src, /disabled\s*=\s*\{\s*disabled\s*\}/, `${file} must disable trigger when no projects`);
    assert.match(src, /Create a project before adding/, `${file} must show tooltip explaining the disabled state`);
  }
});

test("10.F.2 — add-button modules provide sensible initialValues for required fields", () => {
  // quality-standards: category default
  assert.match(read(QS_BUTTONS), /initialValues=\{\{[^}]*category:\s*"finishes"/);
  // drawings: drawingType + drawingPhase + projectId default
  const drawings = read(DRAWINGS_BUTTONS);
  assert.match(drawings, /drawingType:\s*"architectural"/);
  assert.match(drawings, /projectId:\s*projects\[0\]\?\.id/);
  // boq: versionLabel + currency + projectId default
  const boq = read(BOQ_BUTTONS);
  assert.match(boq, /versionLabel:\s*"v1\.0"/);
  assert.match(boq, /currency:\s*"IDR"/);
  assert.match(boq, /projectId:\s*projects\[0\]\?\.id/);
});

// ----- Part B: list pages wired (header + NoItemsYet addAction).

test("10.F.2 — quality-standards list page wires <AddQualityStandardButton>", () => {
  const src = read(QS_PAGE);
  assert.match(src, /AddQualityStandardButton/, "import + usage");
  assert.match(src, /addAction=\{<AddQualityStandardButton/, "NoItemsYet addAction wired");
  assert.doesNotMatch(
    src,
    /href="\/development-os\/quality-standards\/new"/,
    "old <Link href='/new'> Plus button must be removed from list page",
  );
});

test("10.F.2 — drawings list page wires <AddDrawingButton projects={...}>", () => {
  const src = read(DRAWINGS_PAGE);
  assert.match(src, /AddDrawingButton/, "import + usage");
  assert.match(
    src,
    /AddDrawingButton\s+projects=\{projectRows\}/,
    "passes project list to button",
  );
  assert.match(src, /addAction=\{<AddDrawingButton/, "NoItemsYet addAction wired");
  assert.doesNotMatch(
    src,
    /href="\/development-os\/drawings\/new"/,
    "old <Link href='/new'> Plus button must be removed",
  );
});

test("10.F.2 — boq list page wires <AddBoqButton projects={...}>", () => {
  const src = read(BOQ_PAGE);
  assert.match(src, /AddBoqButton/, "import + usage");
  assert.match(
    src,
    /AddBoqButton\s+projects=\{projectRows\}/,
    "passes project list to button",
  );
  assert.match(src, /addAction=\{<AddBoqButton/, "NoItemsYet addAction wired");
  assert.doesNotMatch(
    src,
    /href="\/development-os\/boq\/new"/,
    "old <Link href='/new'> Plus button must be removed",
  );
});

// ----- Part A: addAction backfilled on existing modal-form pages.

test("10.F.2 — asset-types page wires AssetTypeModalForm via NoItemsYet.addAction", () => {
  const src = read(ASSET_TYPES_PAGE);
  assert.match(
    src,
    /addAction=\{<AssetTypeModalForm/,
    "addAction backfill missing on asset-types/page.tsx",
  );
});

test("10.F.2 — lead-sources page wires LeadSourceModalForm via NoItemsYet.addAction", () => {
  const src = read(LEAD_SOURCES_PAGE);
  assert.match(
    src,
    /addAction=\{<LeadSourceModalForm/,
    "addAction backfill missing on marketing/lead-sources/page.tsx",
  );
});

// ----- /new pages preserved as deep-link fallback (8 of 8).

test("10.F.2 — all 8 /new pages preserved as deep-link fallback", () => {
  const newPages = [
    "src/app/(development-app)/development-os/distributions/new/page.tsx",
    "src/app/(development-app)/development-os/drawings/new/page.tsx",
    "src/app/(development-app)/development-os/boq/new/page.tsx",
    "src/app/(development-app)/development-os/method-statements/new/page.tsx",
    "src/app/(development-app)/development-os/qa-qc/new/page.tsx",
    "src/app/(development-app)/development-os/quality-standards/new/page.tsx",
    "src/app/(development-app)/development-os/safety/new/page.tsx",
    "src/app/(development-app)/development-os/banking/new/page.tsx",
  ];
  for (const p of newPages) {
    assert.ok(
      exists(p),
      `${p} must remain (bookmarks + bulk import + external doc links)`,
    );
  }
});

// ----- Pattern guide doc + decisions doc.

test("10.F.2 — pattern guide gains a 10.F.2 section", () => {
  const doc = read(PATTERN_DOC);
  assert.match(doc, /Stage 10\.F\.2 — completed/, "must add 10.F.2 section");
  assert.match(
    doc,
    /AddQualityStandardButton/,
    "doc must reference quality-standards button",
  );
  assert.match(
    doc,
    /AddDrawingButton/,
    "doc must reference drawings button",
  );
  assert.match(doc, /AddBoqButton/, "doc must reference boq button");
});

test("10.F.2 — pattern guide acknowledges <EntityModal> legacy primitive as compliant", () => {
  const doc = read(PATTERN_DOC);
  assert.match(
    doc,
    /<EntityModal>/,
    "doc must mention the legacy EntityModal shell",
  );
  assert.match(
    doc,
    /Don't migrate/i,
    "doc must say not to migrate the 14 existing components",
  );
});

test("10.F.2 — decisions doc shipped + lists deferrals", () => {
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.F\.2 ACCEPTED/);
  for (const entity of [
    "distributions",
    "method-statements",
    "safety",
    "banking",
    "qa-qc",
  ]) {
    assert.match(
      doc,
      new RegExp(entity, "i"),
      `decisions doc must document ${entity} deferral`,
    );
  }
});

// ----- Modal-form audit: 16 components exist (sanity check on Part A scope).

test("10.F.2 — Part A: all 16 audited modal-form components still exist", () => {
  const audited = [
    "src/components/development/sales/reservation-modal-form.tsx",
    "src/components/development/sales/lead-source-modal-form.tsx",
    "src/components/development/sales/lead-modal-form.tsx",
    "src/components/development/sales/contract-modal-form.tsx",
    "src/components/development/sales/discount-proposal-modal-form.tsx",
    "src/components/development/sales/buyer-modal-form.tsx",
    "src/components/development/platform/webhook-modal-form.tsx",
    "src/components/development/platform/api-key-modal-form.tsx",
    "src/components/development/operations/material-po-modal-form.tsx",
    "src/components/development/operations/site-report-modal-form.tsx",
    "src/components/development/finance/cost-category-modal-form.tsx",
    "src/components/development/finance/bank-account-modal-form.tsx",
    "src/components/development/finance/vendor-modal-form.tsx",
    "src/components/development/finance/transaction-modal-form.tsx",
    "src/components/development/assets/asset-type-modal-form.tsx",
    "src/components/development/investors/investor-modal-form.tsx",
  ];
  for (const f of audited) {
    assert.ok(exists(f), `${f} must exist (audit reference)`);
  }
});
