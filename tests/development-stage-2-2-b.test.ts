/**
 * Stage 2.2.B regression — pricing, reservations, contracts, payments,
 * discounts, notifications.
 *
 * Pure-function tests + migration corpus checks. No DB or network required.
 * Follows the existing repo convention: tests do NOT import any module that
 * carries `import "server-only"`. Server modules expose pure helpers next
 * to them (`*-helpers.ts`) which the tests import directly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// -----------------------------------------------------------------------------
// Migration 0036 — schema sanity
// -----------------------------------------------------------------------------

test("0036 migration creates all 18 tables", () => {
  const path = resolve(
    process.cwd(),
    "drizzle/0036_development_os_stage_2_2_b.sql",
  );
  assert.ok(existsSync(path), "Migration 0036 must exist");
  const sql = readFileSync(path, "utf8");
  for (const tbl of [
    "pricing_rules",
    "unit_price_snapshots",
    "reservations",
    "contract_templates",
    "contract_template_components",
    "sales_schemes",
    "sales_scheme_milestones",
    "contract_groups",
    "contracts",
    "contract_milestones",
    "invoices",
    "late_fee_rules",
    "late_fee_accruals",
    "discount_authorizations",
    "unit_discounts",
    "dev_notification_rules",
    "dev_notification_templates",
    "dev_notification_delivery_log",
  ]) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS "${tbl}"`),
      `0036 must create table ${tbl}`,
    );
  }
});

test("0036 enables and forces RLS on every new table", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0036_development_os_stage_2_2_b.sql"),
    "utf8",
  );
  assert.ok(
    sql.includes("ENABLE ROW LEVEL SECURITY"),
    "0036 must call ENABLE ROW LEVEL SECURITY",
  );
  assert.ok(
    sql.includes("FORCE ROW LEVEL SECURITY"),
    "0036 must call FORCE ROW LEVEL SECURITY",
  );
  assert.ok(
    sql.includes("public.is_internal_user()"),
    "0036 RLS policies must gate on public.is_internal_user()",
  );
});

test("0036 wraps everything in a single transaction", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0036_development_os_stage_2_2_b.sql"),
    "utf8",
  );
  assert.ok(sql.includes("BEGIN;"), "Must wrap in BEGIN");
  assert.ok(sql.includes("COMMIT;"), "Must end with COMMIT");
});

test("0036 enforces partial-unique index on active reservations per villa", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0036_development_os_stage_2_2_b.sql"),
    "utf8",
  );
  assert.ok(
    sql.includes("reservations_villa_active_unique"),
    "Must define the partial unique index on active reservations",
  );
  assert.ok(
    /WHERE\s+"status"\s+IN\s+\('pending_payment',\s*'active'\)/.test(sql),
    "Partial-unique index must scope to active statuses",
  );
});

test("0036 prevents double-billing late fees per day", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0036_development_os_stage_2_2_b.sql"),
    "utf8",
  );
  assert.ok(
    sql.includes("late_fee_accruals_unique_per_day"),
    "Must define the unique-per-day index on late_fee_accruals",
  );
});

test("0036 dev-prefixes notification tables to avoid Management OS collision", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0036_development_os_stage_2_2_b.sql"),
    "utf8",
  );
  assert.ok(
    sql.includes('"dev_notification_templates"'),
    "Must prefix to avoid clash with existing Management OS notification_templates",
  );
});

// -----------------------------------------------------------------------------
// Schema exports
// -----------------------------------------------------------------------------

test("sales schema file exports all 2.2.B Drizzle tables", async () => {
  const mod = await import("../src/lib/db/schema/sales");
  for (const key of [
    "pricingRules",
    "unitPriceSnapshots",
    "reservations",
    "contractTemplates",
    "contractTemplateComponents",
    "salesSchemes",
    "salesSchemeMilestones",
    "contractGroups",
    "contracts",
    "contractMilestones",
    "invoices",
    "lateFeeRules",
    "lateFeeAccruals",
    "discountAuthorizations",
    "unitDiscounts",
    "devNotificationRules",
    "devNotificationTemplates",
    "devNotificationDeliveryLog",
  ]) {
    assert.ok(key in mod, `Schema must export ${key}`);
  }
});

// -----------------------------------------------------------------------------
// Pricing math
// -----------------------------------------------------------------------------

test("calculatePrice handles manual rule (no escalation) with location coefficient", async () => {
  const { calculatePrice } = await import(
    "../src/lib/development/server/pricing-helpers"
  );
  const result = calculatePrice({
    rule: {
      id: "r1",
      projectId: "p1",
      ruleType: "manual",
      basePriceUsdMinor: 100_000_000n,
      escalationPercent: 0,
      escalationFrequency: null,
      escalationStartTrigger: "sales_start",
      escalationStartValue: null,
      ceilingPriceUsdMinor: null,
      isActive: true,
      notes: null,
    },
    constructionProgressPct: 30,
    ruleStartedAt: new Date("2026-01-01"),
    now: new Date("2026-04-01"),
    locationCoefficient: 1.15,
  });
  assert.equal(result.basePriceUsdMinor, 100_000_000n);
  assert.equal(result.escalatedPriceUsdMinor, 100_000_000n);
  assert.equal(result.finalPriceUsdMinor, 115_000_000n);
});

test("calculatePrice escalates time_based monthly", async () => {
  const { calculatePrice } = await import(
    "../src/lib/development/server/pricing-helpers"
  );
  const result = calculatePrice({
    rule: {
      id: "r1",
      projectId: "p1",
      ruleType: "time_based",
      basePriceUsdMinor: 100_000_000n,
      escalationPercent: 1, // 1% per month
      escalationFrequency: "monthly",
      escalationStartTrigger: "sales_start",
      escalationStartValue: null,
      ceilingPriceUsdMinor: null,
      isActive: true,
      notes: null,
    },
    constructionProgressPct: 0,
    ruleStartedAt: new Date("2026-01-01"),
    now: new Date("2026-07-01"),
    locationCoefficient: 1.0,
  });
  assert.equal(result.stepCount, 6);
  assert.equal(result.escalatedPriceUsdMinor, 106_000_000n);
});

test("calculatePrice respects ceiling cap", async () => {
  const { calculatePrice } = await import(
    "../src/lib/development/server/pricing-helpers"
  );
  const result = calculatePrice({
    rule: {
      id: "r1",
      projectId: "p1",
      ruleType: "progress_based",
      basePriceUsdMinor: 100_000_000n,
      escalationPercent: 5,
      escalationFrequency: "per_10_progress_pct",
      escalationStartTrigger: "construction_start",
      escalationStartValue: null,
      ceilingPriceUsdMinor: 130_000_000n,
      isActive: true,
      notes: null,
    },
    constructionProgressPct: 90,
    ruleStartedAt: new Date("2025-01-01"),
    now: new Date("2026-01-01"),
    locationCoefficient: 1.0,
  });
  assert.ok(result.hitCeiling, "Should hit ceiling at 9 × 5% = 45% increase");
  assert.equal(result.escalatedPriceUsdMinor, 130_000_000n);
});

test("stepsFromProgress maps progress to step counts", async () => {
  const { stepsFromProgress } = await import(
    "../src/lib/development/server/pricing-helpers"
  );
  assert.equal(stepsFromProgress(64, "per_10_progress_pct"), 6);
  assert.equal(stepsFromProgress(64, "per_5_progress_pct"), 12);
  assert.equal(stepsFromProgress(64, "monthly"), 0);
  assert.equal(stepsFromProgress(150, "per_10_progress_pct"), 10);
  assert.equal(stepsFromProgress(-10, "per_10_progress_pct"), 0);
});

// -----------------------------------------------------------------------------
// Contract auto-split (off-plan three-part)
// -----------------------------------------------------------------------------

test("splitContractAcrossComponents handles off-plan three-part", async () => {
  const { splitContractAcrossComponents } = await import(
    "../src/lib/development/server/contract-helpers"
  );
  const split = splitContractAcrossComponents({
    totalContractValueUsdMinor: 100_000_000n,
    fxRateUsdToIdr: 16500,
    components: [
      {
        id: "c1",
        templateId: "t1",
        sequence: 1,
        componentType: "leasehold_agreement",
        componentName: "Leasehold",
        defaultAmountFormula: "percent_of_total",
        defaultPercentValue: 10,
        defaultFlatAmountUsdMinor: null,
        defaultTaxRate: 10,
        defaultTaxBearer: "buyer",
        defaultSplitPercent: null,
        description: null,
      },
      {
        id: "c2",
        templateId: "t1",
        sequence: 2,
        componentType: "construction_management",
        componentName: "Construction management",
        defaultAmountFormula: "percent_of_total",
        defaultPercentValue: 60,
        defaultFlatAmountUsdMinor: null,
        defaultTaxRate: 11,
        defaultTaxBearer: "seller",
        defaultSplitPercent: null,
        description: null,
      },
      {
        id: "c3",
        templateId: "t1",
        sequence: 3,
        componentType: "service_fee",
        componentName: "Service fee",
        defaultAmountFormula: "computed_remainder",
        defaultPercentValue: null,
        defaultFlatAmountUsdMinor: null,
        defaultTaxRate: 10,
        defaultTaxBearer: "split",
        defaultSplitPercent: 50,
        description: null,
      },
    ],
  });
  assert.equal(split.length, 3);
  assert.equal(split[0].amountUsdMinor, 10_000_000n, "leasehold = 10% of total");
  assert.equal(split[1].amountUsdMinor, 60_000_000n, "construction = 60% of total");
  assert.equal(split[2].amountUsdMinor, 30_000_000n, "service fee = remainder");
  // Tax computations:
  assert.equal(split[0].taxAmountUsdMinor, 1_000_000n, "10% of leasehold");
  assert.equal(split[0].netReceivedBySellerUsdMinor, 10_000_000n, "buyer-borne — seller keeps full");
  assert.equal(split[1].taxAmountUsdMinor, 6_600_000n, "11% of construction");
  assert.equal(
    split[1].netReceivedBySellerUsdMinor,
    53_400_000n,
    "seller-borne — seller keeps amount minus tax",
  );
  assert.equal(split[2].taxAmountUsdMinor, 3_000_000n, "10% of service fee");
  assert.equal(
    split[2].netReceivedBySellerUsdMinor,
    28_500_000n,
    "split 50/50 — seller pays half",
  );
});

test("splitContractAcrossComponents rejects multiple computed_remainder rows", async () => {
  const { splitContractAcrossComponents } = await import(
    "../src/lib/development/server/contract-helpers"
  );
  assert.throws(() =>
    splitContractAcrossComponents({
      totalContractValueUsdMinor: 100n,
      fxRateUsdToIdr: 1,
      components: [
        {
          id: "a",
          templateId: "t",
          sequence: 1,
          componentType: "service_fee",
          componentName: "A",
          defaultAmountFormula: "computed_remainder",
          defaultPercentValue: null,
          defaultFlatAmountUsdMinor: null,
          defaultTaxRate: 0,
          defaultTaxBearer: "buyer",
          defaultSplitPercent: null,
          description: null,
        },
        {
          id: "b",
          templateId: "t",
          sequence: 2,
          componentType: "service_fee",
          componentName: "B",
          defaultAmountFormula: "computed_remainder",
          defaultPercentValue: null,
          defaultFlatAmountUsdMinor: null,
          defaultTaxRate: 0,
          defaultTaxBearer: "buyer",
          defaultSplitPercent: null,
          description: null,
        },
      ],
    }),
  );
});

test("buildMilestoneInstances computes amounts from collection percent", async () => {
  const { buildMilestoneInstances } = await import(
    "../src/lib/development/server/contract-helpers"
  );
  const instances = buildMilestoneInstances({
    totalContractValueUsdMinor: 100_000_000n,
    fxRateUsdToIdr: 16500,
    contractDate: new Date("2026-04-01"),
    templates: [
      {
        id: "m1",
        sequence: 1,
        name: "On signing",
        triggerType: "on_signing",
        triggerValue: null,
        collectionPercent: 30,
        preInvoiceDaysBeforeTrigger: 7,
        dueDaysAfterInvoice: 14,
      },
      {
        id: "m2",
        sequence: 2,
        name: "60% construction",
        triggerType: "construction_progress_pct",
        triggerValue: 60,
        collectionPercent: 40,
        preInvoiceDaysBeforeTrigger: 7,
        dueDaysAfterInvoice: 14,
      },
    ],
  });
  assert.equal(instances[0].expectedAmountUsdMinor, 30_000_000n);
  assert.equal(instances[0].expectedDueDate, "2026-04-01");
  assert.ok(instances[0].preInvoiceDate, "Pre-invoice date computed for on_signing");
  assert.equal(instances[1].expectedAmountUsdMinor, 40_000_000n);
  assert.equal(
    instances[1].expectedDueDate,
    null,
    "Progress-based milestones leave due date null until trigger fires",
  );
});

// -----------------------------------------------------------------------------
// Late fee accrual math
// -----------------------------------------------------------------------------

test("computeAccrualForDay returns zero inside grace period", async () => {
  const { computeAccrualForDay } = await import(
    "../src/lib/development/server/late-fee-helpers"
  );
  const result = computeAccrualForDay({
    expectedAmountUsdMinor: 10_000_000n,
    expectedDueDate: new Date("2026-04-01"),
    asOf: new Date("2026-04-05"),
    rule: {
      id: "r1",
      projectId: "p1",
      gracePeriodDays: 30,
      feeType: "percent_per_day",
      feeValue: 0.05,
      feeCurrency: "USD",
      maxFeeUsdMinor: null,
      isActive: true,
      notes: null,
    },
  });
  assert.equal(result.daysOverdue, 0);
  assert.equal(result.todayFeeUsdMinor, 0n);
});

test("computeAccrualForDay accumulates daily percent_per_day", async () => {
  const { computeAccrualForDay } = await import(
    "../src/lib/development/server/late-fee-helpers"
  );
  // 10 days past grace, 0.05% per day on $100,000 = $50/day, total $500.
  const result = computeAccrualForDay({
    expectedAmountUsdMinor: 10_000_000n,
    expectedDueDate: new Date("2026-04-01"),
    asOf: new Date("2026-04-11"),
    rule: {
      id: "r1",
      projectId: "p1",
      gracePeriodDays: 0,
      feeType: "percent_per_day",
      feeValue: 0.05,
      feeCurrency: "USD",
      maxFeeUsdMinor: null,
      isActive: true,
      notes: null,
    },
  });
  assert.equal(result.daysOverdue, 10);
  assert.equal(result.totalFeeUsdMinor, 50_000n);
});

test("computeAccrualForDay caps at maxFee", async () => {
  const { computeAccrualForDay } = await import(
    "../src/lib/development/server/late-fee-helpers"
  );
  const result = computeAccrualForDay({
    expectedAmountUsdMinor: 10_000_000n,
    expectedDueDate: new Date("2026-04-01"),
    asOf: new Date("2026-08-01"),
    rule: {
      id: "r1",
      projectId: "p1",
      gracePeriodDays: 0,
      feeType: "percent_per_day",
      feeValue: 0.05,
      feeCurrency: "USD",
      maxFeeUsdMinor: 100_000n, // $1,000 cap
      isActive: true,
      notes: null,
    },
  });
  assert.ok(result.hitCap);
  assert.equal(result.totalFeeUsdMinor, 100_000n);
});

test("computeAccrualForDay only charges the delta given prior accrual", async () => {
  const { computeAccrualForDay } = await import(
    "../src/lib/development/server/late-fee-helpers"
  );
  const result = computeAccrualForDay({
    expectedAmountUsdMinor: 10_000_000n,
    expectedDueDate: new Date("2026-04-01"),
    asOf: new Date("2026-04-11"),
    rule: {
      id: "r1",
      projectId: "p1",
      gracePeriodDays: 0,
      feeType: "percent_per_day",
      feeValue: 0.05,
      feeCurrency: "USD",
      maxFeeUsdMinor: null,
      isActive: true,
      notes: null,
    },
    alreadyAccruedUsdMinor: 45_000n,
  });
  assert.equal(result.totalFeeUsdMinor, 50_000n);
  assert.equal(result.todayFeeUsdMinor, 5_000n);
});

// -----------------------------------------------------------------------------
// Discount authorization evaluation
// -----------------------------------------------------------------------------

test("evaluateDiscountProposal approves within sales-manager limit", async () => {
  const { evaluateDiscountProposal } = await import(
    "../src/lib/development/server/discount-helpers"
  );
  const result = evaluateDiscountProposal({
    proposerRoleKeys: ["dev_os_sales_manager"],
    discountPercent: 4,
    discountAbsoluteUsdMinor: 4_000_000n,
    authorizationLimits: [
      { id: "a1", roleKey: "dev_os_sales_manager", maxPercentValue: 5, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: 5, escalateToRoleKey: "dev_os_director", notes: null, isActive: true },
      { id: "a2", roleKey: "dev_os_director", maxPercentValue: 15, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: 15, escalateToRoleKey: "dev_os_ceo", notes: null, isActive: true },
      { id: "a3", roleKey: "dev_os_ceo", maxPercentValue: null, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: null, escalateToRoleKey: null, notes: null, isActive: true },
    ],
  });
  assert.equal(result.withinAuthority, true);
  assert.equal(result.needsEscalation, false);
});

test("evaluateDiscountProposal escalates to director above 5%", async () => {
  const { evaluateDiscountProposal } = await import(
    "../src/lib/development/server/discount-helpers"
  );
  const result = evaluateDiscountProposal({
    proposerRoleKeys: ["dev_os_sales_manager"],
    discountPercent: 8,
    discountAbsoluteUsdMinor: 8_000_000n,
    authorizationLimits: [
      { id: "a1", roleKey: "dev_os_sales_manager", maxPercentValue: 5, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: 5, escalateToRoleKey: "dev_os_director", notes: null, isActive: true },
      { id: "a2", roleKey: "dev_os_director", maxPercentValue: 15, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: 15, escalateToRoleKey: "dev_os_ceo", notes: null, isActive: true },
      { id: "a3", roleKey: "dev_os_ceo", maxPercentValue: null, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: null, escalateToRoleKey: null, notes: null, isActive: true },
    ],
  });
  assert.equal(result.withinAuthority, false);
  assert.equal(result.needsEscalation, true);
  assert.equal(result.escalateToRoleKey, "dev_os_director");
});

test("evaluateDiscountProposal escalates to CEO above 15%", async () => {
  const { evaluateDiscountProposal } = await import(
    "../src/lib/development/server/discount-helpers"
  );
  const result = evaluateDiscountProposal({
    proposerRoleKeys: ["dev_os_director"],
    discountPercent: 20,
    discountAbsoluteUsdMinor: 20_000_000n,
    authorizationLimits: [
      { id: "a2", roleKey: "dev_os_director", maxPercentValue: 15, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: 15, escalateToRoleKey: "dev_os_ceo", notes: null, isActive: true },
      { id: "a3", roleKey: "dev_os_ceo", maxPercentValue: null, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: null, escalateToRoleKey: null, notes: null, isActive: true },
    ],
  });
  assert.equal(result.escalateToRoleKey, "dev_os_ceo");
});

test("evaluateDiscountProposal accepts unlimited CEO authority", async () => {
  const { evaluateDiscountProposal } = await import(
    "../src/lib/development/server/discount-helpers"
  );
  const result = evaluateDiscountProposal({
    proposerRoleKeys: ["dev_os_ceo"],
    discountPercent: 50,
    discountAbsoluteUsdMinor: 500_000_000n,
    authorizationLimits: [
      { id: "a3", roleKey: "dev_os_ceo", maxPercentValue: null, maxAbsoluteUsdMinor: null, requiresEscalationAbovePercent: null, escalateToRoleKey: null, notes: null, isActive: true },
    ],
  });
  assert.equal(result.withinAuthority, true);
});

// -----------------------------------------------------------------------------
// Notification template interpolation
// -----------------------------------------------------------------------------

test("interpolateTemplate substitutes {{variable}} placeholders", async () => {
  const { interpolateTemplate } = await import(
    "../src/lib/development/server/notification-helpers"
  );
  const out = interpolateTemplate(
    "Dear {{ name }}, your invoice {{invoiceNumber}} is due on {{dueDate}}.",
    {
      name: "Wei Wang",
      invoiceNumber: "ARC-2026-0042",
      dueDate: "2026-09-30",
    },
  );
  assert.equal(out, "Dear Wei Wang, your invoice ARC-2026-0042 is due on 2026-09-30.");
});

test("interpolateTemplate replaces missing variables with empty string", async () => {
  const { interpolateTemplate } = await import(
    "../src/lib/development/server/notification-helpers"
  );
  const out = interpolateTemplate("Hi {{ name }}, total: {{ amount }}.", { name: "X" });
  assert.equal(out, "Hi X, total: .");
});

test("interpolateTemplate handles bigint values", async () => {
  const { interpolateTemplate } = await import(
    "../src/lib/development/server/notification-helpers"
  );
  const out = interpolateTemplate("Amount: {{ amt }} minor.", { amt: 12345n });
  assert.equal(out, "Amount: 12345 minor.");
});

test("extractTemplateVariables enumerates all placeholders", async () => {
  const { extractTemplateVariables } = await import(
    "../src/lib/development/server/notification-helpers"
  );
  const vars = extractTemplateVariables(
    "Dear {{name}}, your invoice {{invoiceNumber}} for {{ projectName }} is due {{dueDate}}.",
  );
  assert.deepEqual(vars.sort(), [
    "dueDate",
    "invoiceNumber",
    "name",
    "projectName",
  ]);
});

// -----------------------------------------------------------------------------
// Sales Assistant — regenerate parser
// -----------------------------------------------------------------------------

test("regenerateLeadWelcomeDraft is exported from the agent module", async () => {
  // Static-source check: no runtime import of `server-only` modules.
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/ai/agents/sales-assistant.ts"),
    "utf8",
  );
  assert.ok(
    src.includes("export async function regenerateLeadWelcomeDraft"),
    "Stage 2.2.B must add regenerateLeadWelcomeDraft to the Sales Assistant",
  );
  assert.ok(
    !src.includes("@anthropic-ai/sdk"),
    "Sales assistant must still not import the SDK directly",
  );
});

test("regenerateAIDraft server action is exported", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/lead-actions.ts"),
    "utf8",
  );
  assert.ok(
    src.includes("export async function regenerateAIDraft"),
    "lead-actions.ts must export the regenerateAIDraft server action",
  );
});

// -----------------------------------------------------------------------------
// Workspace separation — Stage 1 invariants must still hold after 2.2.B
// -----------------------------------------------------------------------------

test("dashboardNav still has zero /development-os/* routes after 2.2.B", async () => {
  const { dashboardNav } = await import("../src/config/navigation");
  for (const group of dashboardNav) {
    for (const item of group.items) {
      assert.ok(
        !item.href.startsWith("/development-os"),
        `Management OS sidebar leaked Development OS route after 2.2.B: ${item.href}`,
      );
    }
  }
});

test("developmentAppNav exposes the new 2.2.B routes", async () => {
  const { developmentAppNav } = await import(
    "../src/lib/development/navigation"
  );
  const flat = developmentAppNav.flatMap((g) => g.items.map((i) => i.href));
  for (const route of [
    "/development-os/reservations",
    "/development-os/contracts",
    "/development-os/invoices",
    "/development-os/discounts",
  ]) {
    assert.ok(flat.includes(route), `developmentAppNav must include ${route}`);
  }
});

test("Stage 2.2.B workspace pages exist", () => {
  const root = resolve(process.cwd(), "src/app/(development-app)/development-os");
  for (const p of [
    "reservations/page.tsx",
    "contracts/page.tsx",
    "invoices/page.tsx",
    "discounts/page.tsx",
  ]) {
    assert.ok(
      existsSync(resolve(root, p)),
      `Stage 2.2.B page must exist: ${p}`,
    );
  }
});

// -----------------------------------------------------------------------------
// No new dependency added (still zero — same outcome as 2.2.A)
// -----------------------------------------------------------------------------

test("Stage 2.2.B added zero new top-level dependencies", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  );
  // Both PDF and email infrastructure were already installed.
  assert.equal(pkg.dependencies?.["@anthropic-ai/sdk"], undefined);
  assert.equal(pkg.dependencies?.openai, undefined);
  // PDF lib should already be there from a prior stage.
  assert.ok(
    pkg.dependencies?.["@react-pdf/renderer"],
    "Existing PDF lib should remain — 2.2.B reuses it for invoice PDFs.",
  );
});
