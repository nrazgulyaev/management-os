/**
 * Stage 6.P0.5 + P0.6 — Sales + Operations + Admin Forms tests.
 *
 * Combined checkpoint covering 12 new modal forms across 3 tiers,
 * 5 action use-server flips, asset-type polish (added updateAssetType),
 * and wiring onto 10 list pages. Contract + Discount are context-
 * triggered (caller-supplies entity IDs) and currently unwired —
 * tests verify the components exist and accept the expected props.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ---- form components
const F_LEAD = "src/components/development/sales/lead-modal-form.tsx";
const F_RESV = "src/components/development/sales/reservation-modal-form.tsx";
const F_CONT = "src/components/development/sales/contract-modal-form.tsx";
const F_BUYR = "src/components/development/sales/buyer-modal-form.tsx";
const F_LSRC = "src/components/development/sales/lead-source-modal-form.tsx";
const F_DISC = "src/components/development/sales/discount-proposal-modal-form.tsx";
const F_INV = "src/components/development/investors/investor-modal-form.tsx";
const F_ATYP = "src/components/development/assets/asset-type-modal-form.tsx";
const F_SITE = "src/components/development/operations/site-report-modal-form.tsx";
const F_MAT = "src/components/development/operations/material-po-modal-form.tsx";
const F_KEY = "src/components/development/platform/api-key-modal-form.tsx";
const F_HOOK = "src/components/development/platform/webhook-modal-form.tsx";

const ALL_FORMS = [F_LEAD, F_RESV, F_CONT, F_BUYR, F_LSRC, F_DISC, F_INV, F_ATYP, F_SITE, F_MAT, F_KEY, F_HOOK];

// ---- action files (P0.5/6 flips)
const A_BUYER = "src/lib/development/server/buyers/buyer-actions.ts";
const A_SITE = "src/lib/development/server/site-report-actions.ts";
const A_MAT = "src/lib/development/server/material-actions.ts";
const A_INV = "src/lib/development/server/investor-actions.ts";
const A_ATYP = "src/lib/development/server/assets/asset-type-actions.ts";

const FLIPPED_ACTIONS = [A_BUYER, A_SITE, A_MAT, A_INV, A_ATYP];

// ---- list pages with wiring
const P_BUYER = "src/app/(development-app)/development-os/buyers/page.tsx";
const P_LSRC = "src/app/(development-app)/development-os/marketing/lead-sources/page.tsx";
const P_INV = "src/app/(development-app)/development-os/investors/page.tsx";
const P_ATYP = "src/app/(development-app)/development-os/asset-types/page.tsx";
const P_SITE = "src/app/(development-app)/development-os/site-reports/page.tsx";
const P_MAT = "src/app/(development-app)/development-os/materials/page.tsx";
const P_SALES = "src/app/(development-app)/development-os/sales/page.tsx";
const P_RESV = "src/app/(development-app)/development-os/reservations/page.tsx";
const P_KEY = "src/app/(development-app)/development-os/settings/api-keys/page.tsx";
const P_HOOK = "src/app/(development-app)/development-os/settings/webhooks/page.tsx";

// ===========================================================================
// 1) All 12 form files exist + are client components
// ===========================================================================

for (const f of ALL_FORMS) {
  test(`form file exists + is client component: ${f.split("/").pop()}`, () => {
    assert.ok(exists(f), `missing ${f}`);
    assert.match(read(f), /^"use client";/m);
  });
}

// ===========================================================================
// 2) Action use-server flips (5 files)
// ===========================================================================

for (const a of FLIPPED_ACTIONS) {
  test(`action carries "use server" + drops import "server-only": ${a.split("/").pop()}`, () => {
    const src = read(a);
    assert.match(src, /^"use server";/m);
    assert.doesNotMatch(src, /^import\s+"server-only"/m);
  });
}

// ===========================================================================
// 3) Asset-type polish: updateAssetType added
// ===========================================================================

test("updateAssetType function added to asset-type-actions.ts (P0.2 carry-forward)", () => {
  const src = read(A_ATYP);
  assert.match(src, /export async function updateAssetType/);
  assert.match(src, /updateTypeSchema/);
});

test("updateAssetType intentionally omits typeKey (immutable lookup handle)", () => {
  const src = read(A_ATYP);
  // Find the updateTypeSchema declaration and confirm typeKey is NOT a key in it
  const m = /const updateTypeSchema\s*=\s*z\.object\(\{([\s\S]*?)\}\);/.exec(src);
  assert.ok(m, "updateTypeSchema not found");
  assert.doesNotMatch(m![1], /typeKey/);
});

test("AssetTypeModalForm calls both createAssetType + updateAssetType", () => {
  const src = read(F_ATYP);
  assert.match(src, /createAssetType/);
  assert.match(src, /updateAssetType/);
});

test("AssetTypeModalForm uses defaults?.id to switch between create and edit modes", () => {
  const src = read(F_ATYP);
  assert.match(src, /isEdit\s*=\s*!!defaults\?\.id/);
});

// ===========================================================================
// 4) Workflow-verb labels (per P0.2 audit doc)
// ===========================================================================

const WORKFLOW_LABELS: Record<string, string[]> = {
  [F_LEAD]: ["Add lead"],
  [F_RESV]: ["Create reservation"],
  [F_CONT]: ["Convert reservation to contract"],
  [F_BUYR]: ["Add buyer"],
  [F_LSRC]: ["Add lead source"],
  [F_DISC]: ["Propose discount"],
  [F_INV]: ["Add investor"],
  [F_ATYP]: ["Add asset type"],
  [F_SITE]: ["Record site report"],
  [F_MAT]: ["Create material PO"],
  [F_KEY]: ["Generate API key"],
  [F_HOOK]: ["Subscribe webhook"],
};

for (const [path, labels] of Object.entries(WORKFLOW_LABELS)) {
  for (const label of labels) {
    test(`${path.split("/").pop()} uses workflow-verb label: "${label}"`, () => {
      assert.match(read(path), new RegExp(label));
    });
  }
}

// ===========================================================================
// 5) Each form imports its expected server action
// ===========================================================================

const FORM_TO_ACTION: Record<string, string> = {
  [F_LEAD]: "createLead",
  [F_RESV]: "createReservation",
  [F_CONT]: "convertReservationToContract",
  [F_BUYR]: "createBuyer",
  [F_LSRC]: "createLeadSource",
  [F_DISC]: "proposeDiscount",
  [F_INV]: "createInvestor",
  [F_SITE]: "createSiteReport",
  [F_MAT]: "createMaterialPO",
  [F_KEY]: "createApiKey",
  [F_HOOK]: "subscribeWebhook",
};

for (const [form, action] of Object.entries(FORM_TO_ACTION)) {
  test(`${form.split("/").pop()} imports + invokes ${action}`, () => {
    const src = read(form);
    assert.match(src, new RegExp(`import\\s+\\{[\\s\\S]*?${action}[\\s\\S]*?\\}`));
    assert.match(src, new RegExp(`\\b${action}\\(`));
  });
}

// ===========================================================================
// 6) Each form: useTransition + setError + router.refresh
// ===========================================================================

for (const f of ALL_FORMS) {
  test(`${f.split("/").pop()} uses useTransition for pending state`, () => {
    assert.match(read(f), /useTransition/);
  });
  test(`${f.split("/").pop()} surfaces server errors via setError (no toast dep)`, () => {
    const src = read(f);
    assert.match(src, /catch\s*\(/);
    assert.match(src, /setError/);
  });
  // Contract + Discount are context-triggered (caller may not always
  // want a router.refresh — they're typically inside a detail page
  // that already revalidates). Skip refresh-check for those two.
  if (f !== F_CONT && f !== F_DISC) {
    test(`${f.split("/").pop()} calls router.refresh() on success`, () => {
      assert.match(read(f), /router\.refresh\(\)/);
    });
  }
}

// ===========================================================================
// 7) Mobile-friendly inputs across the form set
// ===========================================================================

test("Buyer + Investor + Vendor-style forms use type=email + type=tel for contact fields", () => {
  for (const f of [F_BUYR, F_INV]) {
    const src = read(f);
    assert.match(src, /type="email"/);
    assert.match(src, /type="tel"/);
  }
});

test("Contract + Site-report + Material forms use type=date for dates (Reservation uses days-offset instead)", () => {
  for (const f of [F_CONT, F_SITE, F_MAT]) {
    assert.match(read(f), /type="date"/);
  }
  // Reservation uses an expiresInDays field instead of a target date
  assert.match(read(F_RESV), /expiresInDays/);
});

test("Money + count fields use inputMode=decimal / numeric", () => {
  for (const f of [F_RESV, F_CONT, F_DISC, F_SITE, F_MAT]) {
    const src = read(f);
    assert.match(src, /inputMode=("decimal"|"numeric")/);
  }
});

// ===========================================================================
// 8) Atomic-upsert special: LeadModalForm passes FormData straight through
// ===========================================================================

test("LeadModalForm posts FormData directly to createLead (atomic contact+role+lead upsert per Q3)", () => {
  const src = read(F_LEAD);
  assert.match(src, /createLead\(formData\)/);
});

test("LeadModalForm has fields for fullName + email + phone (the dedup keys)", () => {
  const src = read(F_LEAD);
  assert.match(src, /name="fullName"/);
  assert.match(src, /name="email"/);
  assert.match(src, /name="phone"/);
});

// ===========================================================================
// 9) ContractModalForm: convertReservationToContract pattern
// ===========================================================================

test("ContractModalForm requires reservationId prop (caller context, not form input)", () => {
  const src = read(F_CONT);
  assert.match(src, /reservationId:\s*string/);
  assert.match(src, /formData\.set\("reservationId"/);
});

test("ContractModalForm requires templateId + salesSchemeId selects (action requirement)", () => {
  const src = read(F_CONT);
  assert.match(src, /name="templateId"/);
  assert.match(src, /name="salesSchemeId"/);
});

// ===========================================================================
// 10) DiscountProposalModalForm: percent vs fixed_amount split
// ===========================================================================

test("DiscountProposalModalForm switches percent/fixed_amount via local state + posts the right field", () => {
  const src = read(F_DISC);
  assert.match(src, /useState<"percent" \| "fixed_amount">/);
  assert.match(src, /discountType === "percent"/);
});

test("DiscountProposalModalForm requires caller context: villaId + contactId + proposedByUserId + originalPriceUsdMinor", () => {
  const src = read(F_DISC);
  assert.match(src, /villaId:\s*string/);
  assert.match(src, /contactId:\s*string/);
  assert.match(src, /proposedByUserId:\s*string/);
  assert.match(src, /originalPriceUsdMinor:\s*bigint/);
});

// ===========================================================================
// 11) ApiKey + Webhook: secret-shown-once UX
// ===========================================================================

test("ApiKeyModalForm shows the generated full key once (data-testid hook)", () => {
  const src = read(F_KEY);
  assert.match(src, /data-testid="api-key-generated-value"/);
  // Warning copy about "only time"
  assert.match(src, /only time/i);
});

test("ApiKeyModalForm has a copy-to-clipboard helper", () => {
  assert.match(read(F_KEY), /navigator\.clipboard\.writeText/);
});

test("WebhookModalForm shows the signing secret once + offers copy-to-clipboard", () => {
  const src = read(F_HOOK);
  assert.match(src, /data-testid="webhook-secret-value"/);
  assert.match(src, /navigator\.clipboard\.writeText/);
});

test("WebhookModalForm parses comma/whitespace event lists", () => {
  const src = read(F_HOOK);
  assert.match(src, /split\(\/\[,\\s\]\+\/\)/);
});

// ===========================================================================
// 12) List page wiring (10 pages)
// ===========================================================================

const PAGE_WIRING: Array<[string, string]> = [
  [P_BUYER, "BuyerModalForm"],
  [P_LSRC, "LeadSourceModalForm"],
  [P_INV, "InvestorModalForm"],
  [P_ATYP, "AssetTypeModalForm"],
  [P_SITE, "SiteReportModalForm"],
  [P_MAT, "MaterialPOModalForm"],
  [P_SALES, "LeadModalForm"],
  [P_RESV, "ReservationModalForm"],
  [P_KEY, "ApiKeyModalForm"],
  [P_HOOK, "WebhookModalForm"],
];

for (const [page, formName] of PAGE_WIRING) {
  test(`${page.split("/").slice(-3).join("/")} mounts ${formName}`, () => {
    const src = read(page);
    assert.match(src, new RegExp(`import\\s+\\{\\s*${formName}\\s*\\}`));
    assert.match(src, new RegExp(`<${formName}`));
  });
}

// Sites + Materials preserve "Full form" link to the existing /new routes
test("Site reports page keeps 'Full form' link to /site-reports/new (modal-exception preserved)", () => {
  const src = read(P_SITE);
  assert.match(src, /href="\/development-os\/site-reports\/new"/);
  assert.match(src, /Full form/);
});

test("Materials page keeps 'Full form' link to /materials/new (modal-exception preserved)", () => {
  const src = read(P_MAT);
  assert.match(src, /href="\/development-os\/materials\/new"/);
  assert.match(src, /Full form/);
});

// ===========================================================================
// 13) Stage 5.J build-fix invariant: client forms don't import server-only
// ===========================================================================

for (const f of ALL_FORMS) {
  test(`Stage 5.J build-fix invariant preserved: ${f.split("/").pop()} doesn't import server-only`, () => {
    assert.doesNotMatch(read(f), /^import\s+"server-only"/m);
  });
}

// ===========================================================================
// 14) No new dependencies in P0.5/6
// ===========================================================================

test("P0.5/6 introduces no new modal/toast/dialog dependencies", () => {
  const pkg = JSON.parse(read("package.json"));
  const all = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const f of ["sonner", "react-hot-toast", "@headlessui/react", "react-aria"]) {
    assert.equal(f in all, false, `must not add ${f}`);
  }
});

// ===========================================================================
// 15) Audit-doc decisions still in sync
// ===========================================================================

test("audit doc Q3 decision (contacts merged into leads) is still documented", () => {
  const md = read("docs/STAGE-6-P0-AUDIT.md");
  assert.match(md, /contacts.*merged.*leads|Lead form handles `contacts` upsert/i);
});

test("audit doc Q5 decision (land-plots use existing land-actions, phases stay nested) is still documented", () => {
  const md = read("docs/STAGE-6-P0-AUDIT.md");
  assert.match(md, /land-actions/);
  assert.match(md, /phases.*nested|standalone phase CRUD deferred/i);
});

// ===========================================================================
// 16) Each form has data-testid trigger hook
// ===========================================================================

const TRIGGER_TESTIDS: Record<string, string> = {
  [F_LEAD]: "lead-add-trigger",
  [F_RESV]: "reservation-create-trigger",
  [F_CONT]: "contract-convert-trigger",
  [F_BUYR]: "buyer-add-trigger",
  [F_LSRC]: "lead-source-add-trigger",
  [F_DISC]: "discount-propose-trigger",
  [F_INV]: "investor-add-trigger",
  [F_ATYP]: "asset-type-add-trigger",
  [F_SITE]: "site-report-record-trigger",
  [F_MAT]: "material-po-create-trigger",
  [F_KEY]: "api-key-generate-trigger",
  [F_HOOK]: "webhook-subscribe-trigger",
};

for (const [form, testid] of Object.entries(TRIGGER_TESTIDS)) {
  test(`${form.split("/").pop()} carries data-testid="${testid}"`, () => {
    // Match either literal string or inside a ternary expression
    const src = read(form);
    const literal = new RegExp(`data-testid="${testid}"`);
    const ternary = new RegExp(`"${testid}"`);
    assert.ok(
      literal.test(src) || ternary.test(src),
      `${form} missing testid ${testid}`,
    );
  });
}
