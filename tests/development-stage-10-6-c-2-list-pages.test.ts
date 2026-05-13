/**
 * Stage 10.6 / Phase 10.6.C.2.1 + .2.3 — List pages modernization +
 * Modal-First residual closure acceptance.
 *
 * Asserts:
 *   - 6 high-traffic Mgmt OS list pages import ListTableCard from
 *     the primitives barrel
 *   - operations/tasks uses FilterPills (replaces local FilterPill helper)
 *   - 4 Dev OS Modal-First residuals now render *AddButton wrappers
 *     instead of <Link href=".../new">
 *   - 4 Dev OS forms accept onSuccess + onCancel props
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

// ============================================================================
// 10.6.C.2.1 — Mgmt OS list pages adopt ListTableCard
// ============================================================================

const LIST_TABLE_CARD_PAGES: Array<{ name: string; path: string }> = [
  {
    name: "/dashboard/villas",
    path: "src/app/(dashboard)/dashboard/villas/page.tsx",
  },
  {
    name: "/dashboard/bookings",
    path: "src/app/(dashboard)/dashboard/bookings/page.tsx",
  },
  {
    name: "/dashboard/owners",
    path: "src/app/(dashboard)/dashboard/owners/page.tsx",
  },
  {
    name: "/dashboard/finance/expenses",
    path: "src/app/(dashboard)/dashboard/finance/expenses/page.tsx",
  },
];

for (const page of LIST_TABLE_CARD_PAGES) {
  test(`10.6.C.2.1 — ${page.name} imports ListTableCard`, () => {
    const src = read(page.path);
    assert.match(
      src,
      /import \{[^}]*ListTableCard[^}]*\} from "@\/components\/ui\/primitives";/,
    );
  });

  test(`10.6.C.2.1 — ${page.name} renders <ListTableCard>`, () => {
    const src = read(page.path);
    assert.match(src, /<ListTableCard\b/);
  });

  test(`10.6.C.2.1 — ${page.name} bumped container gap to gap-10`, () => {
    const src = read(page.path);
    assert.match(src, /flex flex-col gap-10/);
  });
}

test("10.6.C.2.1 — operations/tasks uses FilterPills (replaces local FilterPill)", () => {
  const path = "src/app/(dashboard)/dashboard/operations/tasks/page.tsx";
  const src = read(path);
  assert.match(
    src,
    /import \{[^}]*FilterPills[^}]*\} from "@\/components\/ui\/primitives";/,
  );
  assert.match(src, /<FilterPills /);
  // Local FilterPill helper removed
  assert.doesNotMatch(src, /function FilterPill\(\{/);
});

test("10.6.C.2.1 — projects page uses rounded-3xl + shadow-soft-card on cards", () => {
  const path = "src/app/(dashboard)/dashboard/projects/page.tsx";
  const src = read(path);
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
});

// ============================================================================
// 10.6.C.2.3 — Modal-First residuals closed (4 Dev OS pages)
// ============================================================================

const MODAL_FIRST_RESIDUALS: Array<{
  name: string;
  page: string;
  addButton: string;
  formFile: string;
}> = [
  {
    name: "/development-os/finance/invoices",
    page: "src/app/(development-app)/development-os/finance/invoices/page.tsx",
    addButton:
      "src/components/development/finance/invoice-add-button.tsx",
    formFile: "src/components/development/finance/invoice-create-form.tsx",
  },
  {
    name: "/development-os/inventory/items",
    page: "src/app/(development-app)/development-os/inventory/items/page.tsx",
    addButton:
      "src/components/development/inventory/inventory-item-dev-add-button.tsx",
    formFile: "src/components/development/inventory/inventory-item-form.tsx",
  },
  {
    name: "/development-os/inventory/movements",
    page: "src/app/(development-app)/development-os/inventory/movements/page.tsx",
    addButton:
      "src/components/development/inventory/movement-dev-add-button.tsx",
    formFile: "src/components/development/inventory/movement-form.tsx",
  },
  {
    name: "/development-os/procurement/purchase-requests",
    page: "src/app/(development-app)/development-os/procurement/purchase-requests/page.tsx",
    addButton:
      "src/components/development/procurement/purchase-request-add-button.tsx",
    formFile:
      "src/components/development/procurement/purchase-request-mobile-form.tsx",
  },
];

for (const r of MODAL_FIRST_RESIDUALS) {
  test(`10.6.C.2.3 — ${r.name} ships its *AddButton wrapper`, () => {
    assert.ok(existsSync(resolve(ROOT, r.addButton)));
    const src = read(r.addButton);
    assert.match(
      src,
      /import \{ ModalFirstAddButton \} from "@\/components\/ui\/primitives\/modal-first-add-button";/,
    );
  });

  test(`10.6.C.2.3 — ${r.name} list page no longer renders Link href=".../new" Add CTA`, () => {
    const src = read(r.page);
    // Must NOT have the old "<Button asChild>...<Link href=".../new">" pattern
    // for the Add CTA. A bare <Link href=".../new"> in NoItemsYet body is fine.
    assert.doesNotMatch(
      src,
      /<Button asChild>\s*<Link href="[^"]*\/new">/,
      `${r.name} still has <Button asChild><Link .../new"> pattern`,
    );
  });

  test(`10.6.C.2.3 — ${r.formFile} accepts onSuccess + onCancel props`, () => {
    const src = read(r.formFile);
    assert.match(src, /onSuccess\?: \(\) => void/);
    assert.match(src, /onCancel\?: \(\) => void/);
  });

  test(`10.6.C.2.3 — ${r.formFile} prefers onSuccess() over router.push when supplied`, () => {
    const src = read(r.formFile);
    assert.match(
      src,
      /if \(onSuccess\) onSuccess\(\);\s*else router\.push/,
    );
  });
}
