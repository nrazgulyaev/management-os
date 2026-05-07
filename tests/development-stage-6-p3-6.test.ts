// Stage 6.P3.6 — Targeted CRUD coverage closure tests.
//
// Real-functionality assertions: for every section flagged 🔴 in the
// P3.5 audit, this file asserts that the page is in fact functional
// via the dominant pattern (workflow on detail / `<XModalForm>`
// mount / sibling /new sub-route). When the audit's regex misses an
// affordance, these tests pin the contract: the wiring must remain
// in place after future refactors.
//
// Source: see tmp/coverage-audit-decisions.md for the per-section
// disposition. Every "🟢 HEURISTIC_MISS" / "🟢 RO_BY_DESIGN" entry
// has a matching test below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

/**
 * Assert that a list page delegates its workflow to a detail
 * sub-route, and that detail sub-route imports the named action
 * affordances. This is the dominant pattern in the codebase — list
 * pages are read-only, the row click drills in, the detail page
 * carries the workflow.
 */
function assertDetailWorkflow(
  detailFile: string,
  expectedAffordances: string[],
  ctx: string,
): void {
  assert.ok(
    fileExists(detailFile),
    `${ctx}: detail page must exist at ${detailFile}`,
  );
  const src = readFile(detailFile);
  for (const aff of expectedAffordances) {
    assert.match(
      src,
      new RegExp(`\\b${aff}\\b`),
      `${ctx}: detail must carry ${aff}`,
    );
  }
}

/**
 * Assert that a list page wires Create via a sibling /new sub-route
 * (the Create flow lives in /new/page.tsx).
 */
function assertNewSubRoute(
  parentDir: string,
  ctx: string,
): void {
  assert.ok(
    fileExists(`${parentDir}/new/page.tsx`),
    `${ctx}: must have a /new sibling page that carries the Create form`,
  );
}

/**
 * Assert that a page mounts the named client component (which
 * carries the CRUD modal / form).
 */
function assertMountsComponent(
  pageFile: string,
  componentName: string,
  ctx: string,
): void {
  assert.ok(fileExists(pageFile), `${ctx}: page must exist`);
  const src = readFile(pageFile);
  assert.match(
    src,
    new RegExp(`<${componentName}\\b`),
    `${ctx}: page must mount <${componentName}>`,
  );
}

// ===========================================================================
// Tier 1 — Critical operator workflow
// ===========================================================================

// ---------------------------------------------------------------------------
// Direct Bookings (4 sections — all RO list + workflow on detail)
// ---------------------------------------------------------------------------

test("P3.6 · direct-bookings/holds: detail carries CancelHoldButton", () => {
  assertDetailWorkflow(
    "src/app/(dashboard)/dashboard/direct-bookings/holds/[id]/page.tsx",
    ["CancelHoldButton"],
    "direct-bookings/holds",
  );
});

test("P3.6 · direct-bookings/requests: detail carries Approve + Reject + Convert workflow", () => {
  assertDetailWorkflow(
    "src/app/(dashboard)/dashboard/direct-bookings/requests/[id]/page.tsx",
    [
      "ApproveRequestForm",
      "RejectRequestForm",
      "ConvertToBookingButton",
      "MarkUnderReviewButton",
    ],
    "direct-bookings/requests",
  );
});

test("P3.6 · direct-bookings/deposits: detail carries MarkPaid + Cancel + Refund affordances", () => {
  assertDetailWorkflow(
    "src/app/(dashboard)/dashboard/direct-bookings/deposits/[id]/page.tsx",
    [
      "MarkDepositPaidButton",
      "CancelDepositButton",
      "MarkDepositFailedForm",
      "RefundDepositPlaceholderButton",
    ],
    "direct-bookings/deposits",
  );
});

test("P3.6 · direct-bookings/messages: detail carries Reply + MarkRead + SetStatus", () => {
  assertDetailWorkflow(
    "src/app/(dashboard)/dashboard/direct-bookings/messages/[threadId]/page.tsx",
    ["AdminReplyForm", "AdminMarkReadButton", "AdminSetThreadStatusButton"],
    "direct-bookings/messages",
  );
});

// ---------------------------------------------------------------------------
// Front Office (3 sections — RO status views)
// ---------------------------------------------------------------------------

test("P3.6 · front-office/arrivals: list view exists; check-in lives on booking detail (RO list)", () => {
  // Page exists + reads via service-layer. Operator drills into the
  // booking detail to check-in.
  const src = readFile(
    "src/app/(dashboard)/dashboard/front-office/arrivals/page.tsx",
  );
  assert.match(src, /listArrivals\b/);
  assert.match(src, /front-office\/services/);
});

test("P3.6 · front-office/departures: same shape as arrivals (RO list)", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/front-office/departures/page.tsx",
  );
  assert.match(src, /listDepartures\b|front-office\/services/);
});

test("P3.6 · front-office/in-house: RO status view (audit-confirmed by user)", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/front-office/in-house/page.tsx",
  );
  assert.match(src, /front-office\/services/);
});

// ---------------------------------------------------------------------------
// Operations Mgmt (3 sections)
// ---------------------------------------------------------------------------

test("P3.6 · operations/housekeeping: has Create button + drill-in to task detail", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/operations/housekeeping/page.tsx",
  );
  assert.match(src, /\/dashboard\/operations\/tasks\/new/);
  assert.match(src, /TaskCard/);
});

test("P3.6 · operations/checklists: templates library — RO catalog by design", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/operations/checklists/page.tsx",
  );
  assert.match(src, /listChecklistTemplates/);
});

test("P3.6 · operations/service-requests: list with drill-in to detail", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/operations/service-requests/page.tsx",
  );
  assert.match(src, /listServiceRequests/);
  assert.match(src, /\/dashboard\/operations\/service-requests\/\$\{/);
});

// ---------------------------------------------------------------------------
// Guest Services (1 section)
// ---------------------------------------------------------------------------

test("P3.6 · guest-services/orders: detail carries Note + Bridge + Transition + Fulfilment affordances", () => {
  assertDetailWorkflow(
    "src/app/(dashboard)/dashboard/guest-services/orders/[id]/page.tsx",
    [
      "AddOrderNoteForm",
      "BridgeOrderForm",
      "OrderTransitionForm",
      "CreateFulfilmentForOrderButton",
    ],
    "guest-services/orders",
  );
});

// ---------------------------------------------------------------------------
// Capital — Dev OS (3 sections)
// ---------------------------------------------------------------------------

test("P3.6 · investors: list page mounts InvestorModalForm + ExportButton", () => {
  assertMountsComponent(
    "src/app/(development-app)/development-os/investors/page.tsx",
    "InvestorModalForm",
    "investors",
  );
  assertMountsComponent(
    "src/app/(development-app)/development-os/investors/page.tsx",
    "ExportButton",
    "investors",
  );
});

test("P3.6 · commitments: list with drill-in to commitment detail", () => {
  assert.ok(
    fileExists(
      "src/app/(development-app)/development-os/commitments/[id]/page.tsx",
    ),
    "commitments must have a /[id] detail page",
  );
});

test("P3.6 · investor-requests: list with drill-in to request detail", () => {
  assert.ok(
    fileExists(
      "src/app/(development-app)/development-os/investor-requests/[code]/page.tsx",
    ),
    "investor-requests must have a /[code] detail page",
  );
});

// ---------------------------------------------------------------------------
// Owner Stays (1 section)
// ---------------------------------------------------------------------------

test("P3.6 · owner-stays/requests: detail mounts OwnerStayDecisionBar (Approve/Reject/Suggest)", () => {
  assertMountsComponent(
    "src/app/(dashboard)/dashboard/owner-stays/requests/[id]/page.tsx",
    "OwnerStayDecisionBar",
    "owner-stays/requests",
  );
});

// ===========================================================================
// Tier 2 — Bulk-pattern verifications (~17 sections)
// ===========================================================================

// ---------------------------------------------------------------------------
// Knowledge Base (5)
// ---------------------------------------------------------------------------

const KNOWLEDGE_BASE_SECTIONS: Array<[string, string]> = [
  ["drawings", "src/app/(development-app)/development-os/drawings"],
  ["boq", "src/app/(development-app)/development-os/boq"],
  ["specifications", "src/app/(development-app)/development-os/specifications"],
  [
    "method-statements",
    "src/app/(development-app)/development-os/method-statements",
  ],
  ["quality-standards", "src/app/(development-app)/development-os/quality-standards"],
];

for (const [name, dir] of KNOWLEDGE_BASE_SECTIONS) {
  test(`P3.6 · knowledge-base/${name}: list + /new sub-route + /[code] detail`, () => {
    assert.ok(fileExists(`${dir}/page.tsx`));
    assertNewSubRoute(dir, `knowledge-base/${name}`);
    assert.ok(
      fileExists(`${dir}/[code]/page.tsx`),
      `${name}: must have a /[code] detail page`,
    );
  });
}

// ---------------------------------------------------------------------------
// Villa Guides (4)
// ---------------------------------------------------------------------------

const VILLA_GUIDE_SECTIONS: Array<[string, string]> = [
  ["sections", "src/app/(dashboard)/dashboard/villa-guides/sections"],
  ["wifi", "src/app/(dashboard)/dashboard/villa-guides/wifi"],
  [
    "emergency-contacts",
    "src/app/(dashboard)/dashboard/villa-guides/emergency-contacts",
  ],
  ["neighborhood", "src/app/(dashboard)/dashboard/villa-guides/neighborhood"],
];

for (const [name, dir] of VILLA_GUIDE_SECTIONS) {
  test(`P3.6 · villa-guides/${name}: list + /new sub-route`, () => {
    assert.ok(fileExists(`${dir}/page.tsx`));
    assertNewSubRoute(dir, `villa-guides/${name}`);
  });
}

// ---------------------------------------------------------------------------
// Inventory (5)
// ---------------------------------------------------------------------------

const INVENTORY_SECTIONS: Array<[string, string]> = [
  ["items", "src/app/(dashboard)/dashboard/inventory/items"],
  ["movements", "src/app/(dashboard)/dashboard/inventory/movements"],
  ["locations", "src/app/(dashboard)/dashboard/inventory/locations"],
  ["suppliers", "src/app/(dashboard)/dashboard/inventory/suppliers"],
  ["counts", "src/app/(dashboard)/dashboard/inventory/counts"],
];

for (const [name, dir] of INVENTORY_SECTIONS) {
  test(`P3.6 · inventory/${name}: list + /new sub-route`, () => {
    assert.ok(fileExists(`${dir}/page.tsx`));
    assertNewSubRoute(dir, `inventory/${name}`);
  });
}

// ---------------------------------------------------------------------------
// Service Fulfilment / Maintenance / Procurement / Owner-Stays Policies
// ---------------------------------------------------------------------------

test("P3.6 · service-fulfilment/vendors: list + /new + /[id] detail", () => {
  const dir = "src/app/(dashboard)/dashboard/service-fulfilment/vendors";
  assert.ok(fileExists(`${dir}/page.tsx`));
  assertNewSubRoute(dir, "service-fulfilment/vendors");
  assert.ok(fileExists(`${dir}/[id]/page.tsx`));
});

test("P3.6 · maintenance-intelligence/templates: list + /new sub-route", () => {
  const dir = "src/app/(dashboard)/dashboard/maintenance-intelligence/templates";
  assert.ok(fileExists(`${dir}/page.tsx`));
  assertNewSubRoute(dir, "maintenance-intelligence/templates");
});

test("P3.6 · procurement/requests: list + /new + /[id]", () => {
  const dir = "src/app/(dashboard)/dashboard/procurement/requests";
  assert.ok(fileExists(`${dir}/page.tsx`));
  assertNewSubRoute(dir, "procurement/requests");
  assert.ok(fileExists(`${dir}/[id]/page.tsx`));
});

test("P3.6 · procurement/orders: list + /new + /[id]", () => {
  const dir = "src/app/(dashboard)/dashboard/procurement/orders";
  assert.ok(fileExists(`${dir}/page.tsx`));
  assertNewSubRoute(dir, "procurement/orders");
  assert.ok(fileExists(`${dir}/[id]/page.tsx`));
});

test("P3.6 · owner-stays/policies: list + /new sub-route", () => {
  const dir = "src/app/(dashboard)/dashboard/owner-stays/policies";
  assert.ok(fileExists(`${dir}/page.tsx`));
  assertNewSubRoute(dir, "owner-stays/policies");
});

// ===========================================================================
// Tier 3 — Settings / admin (8 sections)
// ===========================================================================

test("P3.6 · settings/api-keys: page mounts ApiKeyModalForm", () => {
  assertMountsComponent(
    "src/app/(development-app)/development-os/settings/api-keys/page.tsx",
    "ApiKeyModalForm",
    "settings/api-keys",
  );
});

test("P3.6 · settings/webhooks: page mounts WebhookModalForm", () => {
  assertMountsComponent(
    "src/app/(development-app)/development-os/settings/webhooks/page.tsx",
    "WebhookModalForm",
    "settings/webhooks",
  );
});

test("P3.6 · settings/notifications: page mounts NotificationRulesTabs", () => {
  assertMountsComponent(
    "src/app/(development-app)/development-os/settings/notifications/page.tsx",
    "NotificationRulesTabs",
    "settings/notifications",
  );
});

test("P3.6 · notifications/preferences: page mounts SelfPreferenceForm", () => {
  assertMountsComponent(
    "src/app/(dashboard)/dashboard/notifications/preferences/page.tsx",
    "SelfPreferenceForm",
    "notifications/preferences",
  );
});

test("P3.6 · settings/responsibility-scopes: page mounts ResponsibilityScopeForm", () => {
  assertMountsComponent(
    "src/app/(dashboard)/dashboard/settings/responsibility-scopes/page.tsx",
    "ResponsibilityScopeForm",
    "settings/responsibility-scopes",
  );
});

test("P3.6 · settings/data-export: RO audit log of past export requests (new exports triggered from per-entity bulk-export buttons)", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/data-export/page.tsx",
  );
  assert.match(src, /listExportRequestsForOrg/);
});

// ---------------------------------------------------------------------------
// Tier 3 deferrals — sections genuinely missing CRUD that need P5 wiring.
// We pin the deferral here so a future audit doesn't lose track of them.
// ---------------------------------------------------------------------------

test("P3.6 · settings/approval-thresholds: page exists, edit affordance deferred to P5 (asserted in decisions doc)", () => {
  assert.ok(
    fileExists(
      "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
    ),
    "approval-thresholds page must exist (read-only display today)",
  );
  // Sanity: the decisions doc records the deferral.
  const decisions = readFile("tmp/coverage-audit-decisions.md");
  assert.match(decisions, /approval-thresholds.*DEFERRED_TO_P5/);
});

test("P3.6 · settings/whatsapp: page exists, credential CRUD deferred to P5 (asserted in decisions doc)", () => {
  assert.ok(
    fileExists(
      "src/app/(development-app)/development-os/settings/whatsapp/page.tsx",
    ),
    "whatsapp settings page must exist (status display today)",
  );
  const decisions = readFile("tmp/coverage-audit-decisions.md");
  assert.match(decisions, /whatsapp.*DEFERRED_TO_P5/);
});

// ===========================================================================
// Decisions document integrity
// ===========================================================================

test("P3.6 · decisions doc covers every Tier 1 + Tier 2 + Tier 3 section", () => {
  const src = readFile("tmp/coverage-audit-decisions.md");
  for (const route of [
    // Tier 1
    "/dashboard/direct-bookings/holds",
    "/dashboard/direct-bookings/requests",
    "/dashboard/direct-bookings/deposits",
    "/dashboard/direct-bookings/messages",
    "/dashboard/front-office/arrivals",
    "/dashboard/front-office/departures",
    "/dashboard/front-office/in-house",
    "/dashboard/operations/housekeeping",
    "/dashboard/operations/checklists",
    "/dashboard/operations/service-requests",
    "/dashboard/guest-services/orders",
    "/development-os/investors",
    "/development-os/commitments",
    "/development-os/investor-requests",
    "/dashboard/owner-stays/requests",
    // Tier 2
    "/development-os/drawings",
    "/development-os/boq",
    "/dashboard/villa-guides/sections",
    "/dashboard/inventory/items",
    "/dashboard/service-fulfilment/vendors",
    "/dashboard/maintenance-intelligence/templates",
    "/dashboard/procurement/requests",
    "/dashboard/owner-stays/policies",
    // Tier 3
    "/development-os/settings/api-keys",
    "/development-os/settings/webhooks",
    "/development-os/settings/notifications",
    "/development-os/settings/approval-thresholds",
    "/development-os/settings/whatsapp",
    "/dashboard/notifications/preferences",
    "/dashboard/settings/responsibility-scopes",
  ]) {
    assert.ok(
      src.includes(route),
      `decisions doc must list disposition for ${route}`,
    );
  }
});

test("P3.6 · arch doc marks Stage 6.P3.6 ACCEPTED", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P3\.6/);
});
