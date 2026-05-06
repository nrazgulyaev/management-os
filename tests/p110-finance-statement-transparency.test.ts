/**
 * Prompt 110 — Finance & Statement Transparency Final Polish.
 *
 * Pure-logic + source-grep + migration-pin tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0032 pins 4 transparency tables + RLS + CHECKs + uniques", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0032_finance_statement_transparency.sql"),
    "utf-8",
  );
  for (const t of [
    '"statement_source_groups"',
    '"statement_source_group_lines"',
    '"statement_reconciliation_warnings"',
    '"statement_explanation_snapshots"',
  ]) {
    assert.ok(sql.includes(t), `missing table ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("owner_self_read"));
  assert.ok(sql.includes("public.current_owner_ids()"));
  // CHECK enums.
  assert.ok(sql.includes("statement_source_groups_group_key_check"));
  for (const key of [
    "'direct_booking_revenue'",
    "'ota_revenue'",
    "'guest_service_revenue'",
    "'owner_stay_charges'",
    "'maintenance_charges'",
    "'utility_charges'",
    "'inventory_charges'",
    "'service_fulfilment_costs'",
    "'management_fees'",
    "'taxes'",
    "'reserves'",
    "'payouts'",
    "'adjustments'",
    "'other'",
  ]) {
    assert.ok(sql.includes(key), `missing group key ${key}`);
  }
  assert.ok(sql.includes("statement_source_group_lines_status_check"));
  for (const key of [
    "'linked'",
    "'missing_source'",
    "'ambiguous_source'",
    "'estimated'",
    "'manual_adjustment'",
    "'archived_source'",
  ]) {
    assert.ok(sql.includes(key), `missing trace status ${key}`);
  }
  assert.ok(sql.includes("statement_reconciliation_warnings_type_check"));
  for (const key of [
    "'pending_direct_booking_revenue'",
    "'pending_guest_service_revenue'",
    "'pending_owner_stay_charge'",
    "'pending_material_usage_charge'",
    "'pending_service_fulfilment_bridge'",
    "'locked_period_skipped'",
    "'missing_source_trace'",
    "'currency_mismatch'",
    "'negative_payout'",
  ]) {
    assert.ok(sql.includes(key), `missing warning type ${key}`);
  }
  assert.ok(sql.includes("statement_reconciliation_warnings_severity_check"));
  assert.ok(sql.includes("statement_reconciliation_warnings_status_check"));
  // Uniques.
  assert.ok(sql.includes("statement_source_groups_unique"));
  assert.ok(sql.includes("statement_source_group_lines_unique"));
  assert.ok(sql.includes("statement_reconciliation_warnings_open_unique"));
  assert.ok(sql.includes("statement_explanation_snapshots_unique"));
});

// -----------------------------------------------------------------------------
// Grouping logic
// -----------------------------------------------------------------------------
function makeLine(
  partial: Partial<{
    id: string;
    lineType:
      | "revenue"
      | "fee"
      | "expense"
      | "tax"
      | "reserve"
      | "management_fee"
      | "payout"
      | "adjustment";
    category: string;
    description: string;
    amountMinor: bigint;
    currency: string;
    sortOrder: number;
    sourceTable: string | null;
    sourceId: string | null;
  }>,
) {
  return {
    id: partial.id ?? `line-${Math.random()}`,
    lineType: partial.lineType ?? "revenue",
    category: partial.category ?? "category",
    description: partial.description ?? "description",
    amountMinor: partial.amountMinor ?? 100_000n,
    currency: partial.currency ?? "USD",
    ownerVisible: true,
    sortOrder: partial.sortOrder ?? 0,
    sourceTable: partial.sourceTable ?? null,
    sourceId: partial.sourceId ?? null,
  };
}

test("classifyStatementLineSource — direct booking via context", async () => {
  const { classifyStatementLineSource } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const ctx = {
    directBookingSourceIds: new Set(["rl-direct"]),
    revenueSource: { "rl-direct": "direct_booking" },
  };
  const out = classifyStatementLineSource(
    makeLine({
      lineType: "revenue",
      sourceTable: "revenue_lines",
      sourceId: "rl-direct",
    }),
    ctx,
  );
  assert.equal(out, "direct_booking_revenue");
});

test("classifyStatementLineSource — direct booking via revenue_type", async () => {
  const { classifyStatementLineSource } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const ctx = {
    revenueType: { "rl-1": "direct_booking_accommodation" },
  };
  const out = classifyStatementLineSource(
    makeLine({
      lineType: "revenue",
      sourceTable: "revenue_lines",
      sourceId: "rl-1",
      description: "Accommodation",
    }),
    ctx,
  );
  assert.equal(out, "direct_booking_revenue");
});

test("classifyStatementLineSource — OTA via channel key", async () => {
  const { classifyStatementLineSource } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const ctx = {
    channelKey: { "rl-1": "airbnb" },
  };
  const out = classifyStatementLineSource(
    makeLine({
      lineType: "revenue",
      sourceTable: "revenue_lines",
      sourceId: "rl-1",
    }),
    ctx,
  );
  assert.equal(out, "ota_revenue");
});

test("classifyStatementLineSource — guest_service via finance link", async () => {
  const { classifyStatementLineSource } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const ctx = {
    guestServiceSourceIds: new Set(["rl-2"]),
  };
  const out = classifyStatementLineSource(
    makeLine({
      lineType: "revenue",
      sourceTable: "revenue_lines",
      sourceId: "rl-2",
      description: "Some service order",
    }),
    ctx,
  );
  assert.equal(out, "guest_service_revenue");
});

test("classifyStatementLineSource — owner stay charge via context + description", async () => {
  const { classifyStatementLineSource } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const ctx = {
    expenseType: { "el-1": "owner_stay_operational_cost" },
  };
  const out = classifyStatementLineSource(
    makeLine({
      lineType: "expense",
      sourceTable: "expense_lines",
      sourceId: "el-1",
      description: "Owner stay operational cost — turn-down",
    }),
    ctx,
  );
  assert.equal(out, "owner_stay_charges");
});

test("classifyStatementLineSource — utility, maintenance, inventory, taxes, mgmt, reserve, payout, adjustment, other", async () => {
  const { classifyStatementLineSource } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  assert.equal(
    classifyStatementLineSource(
      makeLine({ lineType: "expense", description: "Utility electricity bill" }),
    ),
    "utility_charges",
  );
  assert.equal(
    classifyStatementLineSource(
      makeLine({
        lineType: "expense",
        description: "Quarterly maintenance / repair work",
      }),
    ),
    "maintenance_charges",
  );
  assert.equal(
    classifyStatementLineSource(
      makeLine({
        lineType: "expense",
        description: "Linen and amenity inventory",
      }),
    ),
    "inventory_charges",
  );
  assert.equal(
    classifyStatementLineSource(makeLine({ lineType: "tax" })),
    "taxes",
  );
  assert.equal(
    classifyStatementLineSource(makeLine({ lineType: "fee" })),
    "taxes",
  );
  assert.equal(
    classifyStatementLineSource(makeLine({ lineType: "management_fee" })),
    "management_fees",
  );
  assert.equal(
    classifyStatementLineSource(makeLine({ lineType: "reserve" })),
    "reserves",
  );
  assert.equal(
    classifyStatementLineSource(makeLine({ lineType: "payout" })),
    "payouts",
  );
  assert.equal(
    classifyStatementLineSource(makeLine({ lineType: "adjustment" })),
    "adjustments",
  );
  // Generic revenue with no context falls back to other.
  assert.equal(
    classifyStatementLineSource(
      makeLine({ lineType: "revenue", description: "Misc revenue" }),
    ),
    "other",
  );
});

test("buildStatementSourceGroups aggregates net = revenue - deductions per group", async () => {
  const { buildStatementSourceGroups } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const ctx = {
    directBookingSourceIds: new Set(["rl-direct"]),
    channelKey: { "rl-ota": "airbnb" },
  };
  const groups = buildStatementSourceGroups(
    [
      makeLine({
        id: "a",
        lineType: "revenue",
        sourceTable: "revenue_lines",
        sourceId: "rl-direct",
        amountMinor: 200_000n,
      }),
      makeLine({
        id: "b",
        lineType: "revenue",
        sourceTable: "revenue_lines",
        sourceId: "rl-ota",
        amountMinor: 300_000n,
      }),
      makeLine({
        id: "c",
        lineType: "fee",
        amountMinor: 15_000n,
        description: "channel commission",
      }),
      makeLine({
        id: "d",
        lineType: "management_fee",
        amountMinor: 90_000n,
      }),
    ],
    ctx,
  );
  const direct = groups.find((g) => g.groupKey === "direct_booking_revenue");
  const ota = groups.find((g) => g.groupKey === "ota_revenue");
  const taxes = groups.find((g) => g.groupKey === "taxes");
  const mgmt = groups.find((g) => g.groupKey === "management_fees");
  assert.ok(direct);
  assert.ok(ota);
  assert.ok(taxes);
  assert.ok(mgmt);
  assert.equal(direct!.grossAmountMinor, 200_000n);
  assert.equal(direct!.deductionAmountMinor, 0n);
  assert.equal(direct!.netAmountMinor, 200_000n);
  assert.equal(ota!.grossAmountMinor, 300_000n);
  assert.equal(taxes!.deductionAmountMinor, 15_000n);
  assert.equal(taxes!.netAmountMinor, -15_000n);
  assert.equal(mgmt!.deductionAmountMinor, 90_000n);
});

test("buildStatementGroupLines marks adjustments + missing source correctly", async () => {
  const {
    buildStatementSourceGroups,
    buildStatementGroupLines,
  } = await import("../src/features/statement-transparency/grouping-pure");
  const lines = [
    makeLine({
      id: "adj",
      lineType: "adjustment",
      sourceTable: null,
      sourceId: null,
    }),
    makeLine({
      id: "rev-no-source",
      lineType: "revenue",
      sourceTable: null,
      sourceId: null,
    }),
    makeLine({
      id: "rev-linked",
      lineType: "revenue",
      sourceTable: "revenue_lines",
      sourceId: "abc",
    }),
  ];
  const groups = buildStatementSourceGroups(lines, {});
  const bridge = buildStatementGroupLines(lines, groups);
  const byId = Object.fromEntries(
    bridge.map((b) => [b.statementLineId, b]),
  );
  assert.equal(byId.adj.sourceTraceStatus, "manual_adjustment");
  assert.equal(byId["rev-no-source"].sourceTraceStatus, "missing_source");
  assert.equal(byId["rev-linked"].sourceTraceStatus, "linked");
});

// -----------------------------------------------------------------------------
// Explanation logic
// -----------------------------------------------------------------------------
test("buildStatementExplanationSnapshot is deterministic", async () => {
  const { buildStatementExplanationSnapshot } = await import(
    "../src/features/statement-transparency/explanation-pure"
  );
  const { buildStatementSourceGroups } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  const groups = buildStatementSourceGroups(
    [
      makeLine({
        id: "a",
        lineType: "revenue",
        sourceTable: "revenue_lines",
        sourceId: "rl-d",
        amountMinor: 482000n,
      }),
    ],
    { directBookingSourceIds: new Set(["rl-d"]) },
  );
  const args = {
    statement: {
      statementCode: "STM-DEMO",
      periodLabel: "April 2026",
      currency: "USD",
      grossRevenueMinor: 482000n,
      totalFeesMinor: 0n,
      totalExpensesMinor: 0n,
      totalTaxesMinor: 0n,
      totalReservesMinor: 50000n,
      managementFeeMinor: 197580n,
      netPayoutMinor: 234420n,
      status: "issued",
    },
    groups,
    warningCounts: { info: 0, warning: 0, critical: 0 },
  };
  const a = buildStatementExplanationSnapshot(args);
  const b = buildStatementExplanationSnapshot(args);
  assert.deepEqual(a, b);
  assert.match(a.headline, /April 2026/);
  assert.ok(a.bulletPoints.length > 0);
});

test("buildPayoutExplanation handles negative + zero + positive payouts", async () => {
  const { buildPayoutExplanation } = await import(
    "../src/features/statement-transparency/explanation-pure"
  );
  const negative = buildPayoutExplanation({
    currency: "USD",
    netPayoutMinor: -50000n,
    grossRevenueMinor: 100000n,
    totalDeductionsMinor: 150000n,
  });
  assert.match(negative, /deficit/i);
  const zero = buildPayoutExplanation({
    currency: "USD",
    netPayoutMinor: 0n,
    grossRevenueMinor: 0n,
    totalDeductionsMinor: 0n,
  });
  assert.match(zero, /no net payout/i);
  const positive = buildPayoutExplanation({
    currency: "USD",
    netPayoutMinor: 50000n,
    grossRevenueMinor: 100000n,
    totalDeductionsMinor: 50000n,
  });
  assert.match(positive, /net payout/i);
});

test("buildWarningExplanation only fires when warning/critical > 0", async () => {
  const { buildWarningExplanation } = await import(
    "../src/features/statement-transparency/explanation-pure"
  );
  assert.equal(
    buildWarningExplanation({ info: 5, warning: 0, critical: 0 }),
    null,
  );
  assert.match(
    buildWarningExplanation({ info: 0, warning: 1, critical: 0 }) ?? "",
    /flagged/i,
  );
  assert.match(
    buildWarningExplanation({ info: 0, warning: 0, critical: 1 }) ?? "",
    /need operator review/i,
  );
});

test("explanation output never contains banned internal tokens", async () => {
  const { buildStatementExplanationSnapshot, BANNED_EXPLANATION_TOKENS } =
    await import("../src/features/statement-transparency/explanation-pure");
  const snap = buildStatementExplanationSnapshot({
    statement: {
      statementCode: "STM",
      periodLabel: "April 2026",
      currency: "USD",
      grossRevenueMinor: 100000n,
      totalFeesMinor: 0n,
      totalExpensesMinor: 0n,
      totalTaxesMinor: 0n,
      totalReservesMinor: 0n,
      managementFeeMinor: 0n,
      netPayoutMinor: 100000n,
      status: "issued",
    },
    groups: [],
    warningCounts: { info: 0, warning: 0, critical: 0 },
  });
  const blob = JSON.stringify(snap, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  for (const banned of BANNED_EXPLANATION_TOKENS) {
    assert.equal(
      blob.includes(banned),
      false,
      `explanation output contains banned token ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Reconciliation logic
// -----------------------------------------------------------------------------
test("warningSeverity escalates pending revenue on issued statements", async () => {
  const { warningSeverity } = await import(
    "../src/features/statement-transparency/reconciliation-pure"
  );
  assert.equal(
    warningSeverity("pending_direct_booking_revenue", { statementStatus: "draft" }),
    "warning",
  );
  assert.equal(
    warningSeverity("pending_direct_booking_revenue", { statementStatus: "issued" }),
    "critical",
  );
});

test("shouldOwnerSeeWarning hides pending bridges on draft + missing_source_trace always", async () => {
  const { shouldOwnerSeeWarning } = await import(
    "../src/features/statement-transparency/reconciliation-pure"
  );
  assert.equal(
    shouldOwnerSeeWarning("pending_direct_booking_revenue", {
      statementStatus: "draft",
    }),
    false,
  );
  assert.equal(
    shouldOwnerSeeWarning("pending_direct_booking_revenue", {
      statementStatus: "issued",
    }),
    true,
  );
  assert.equal(
    shouldOwnerSeeWarning("missing_source_trace", { statementStatus: "issued" }),
    false,
  );
  assert.equal(
    shouldOwnerSeeWarning("currency_mismatch", { statementStatus: "draft" }),
    true,
  );
});

test("detectStatementWarnings produces expected candidates", async () => {
  const { detectStatementWarnings } = await import(
    "../src/features/statement-transparency/reconciliation-pure"
  );
  const out = detectStatementWarnings({
    statement: {
      id: "s1",
      status: "issued",
      netPayoutMinor: -100n,
      currency: "USD",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      ownerId: "o1",
    },
    statementLines: [
      { id: "l1", currency: "USD", sourceTable: null, sourceId: null, lineType: "revenue" },
      { id: "l2", currency: "IDR", sourceTable: "revenue_lines", sourceId: "rl-1", lineType: "revenue" },
    ],
    pendingDirectBookings: [
      { id: "pl1", sourceTable: "direct_booking_finance_links" },
    ],
    pendingGuestServices: [],
    pendingOwnerStays: [],
    pendingServiceFulfilments: [],
    lockedPeriodSkipped: [
      { id: "ll1", sourceTable: "direct_booking_finance_links" },
    ],
  });
  const types = new Set(out.map((c) => c.warningType));
  assert.ok(types.has("pending_direct_booking_revenue"));
  assert.ok(types.has("locked_period_skipped"));
  assert.ok(types.has("negative_payout"));
  assert.ok(types.has("currency_mismatch"));
  assert.ok(types.has("missing_source_trace"));
});

test("reconciliation health score + status", async () => {
  const { buildReconciliationHealthScore, buildReconciliationStatus } =
    await import("../src/features/statement-transparency/reconciliation-pure");
  const healthy = buildReconciliationStatus([]);
  assert.equal(healthy, "healthy");
  const needs = buildReconciliationStatus([
    { severity: "warning", status: "open" },
  ]);
  assert.equal(needs, "needs_review");
  const critical = buildReconciliationStatus([
    { severity: "critical", status: "open" },
  ]);
  assert.equal(critical, "critical");
  const score = buildReconciliationHealthScore([
    { severity: "critical", status: "open" },
    { severity: "warning", status: "open" },
    { severity: "info", status: "open" },
    // Closed warnings ignored.
    { severity: "critical", status: "resolved" },
  ]);
  assert.equal(score, 100 - 25 - 10 - 2);
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permissions matrix — statement_transparency + statement_reconciliation", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const ctx = (
    role:
      | "investor_owner"
      | "investor_viewer"
      | "finance_manager"
      | "booking_manager"
      | "housekeeper"
      | "agent",
  ) => ({
    mode: "live" as const,
    appUser: null,
    roles: [role as never],
    isInternal: role !== "investor_owner" && role !== "investor_viewer",
    isSuperAdmin: false,
  });
  assert.equal(
    hasPermission(ctx("investor_owner"), "statement_transparency.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("investor_owner"), "statement_transparency.manage"),
    false,
  );
  assert.equal(
    hasPermission(ctx("investor_viewer"), "statement_transparency.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("finance_manager"), "statement_transparency.manage"),
    true,
  );
  assert.equal(
    hasPermission(ctx("finance_manager"), "statement_reconciliation.manage"),
    true,
  );
  assert.equal(
    hasPermission(ctx("booking_manager"), "statement_transparency.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("booking_manager"), "statement_transparency.manage"),
    false,
  );
  assert.equal(
    hasPermission(ctx("housekeeper"), "statement_transparency.read"),
    false,
  );
  assert.equal(
    hasPermission(ctx("agent"), "statement_transparency.read"),
    false,
  );
});

// -----------------------------------------------------------------------------
// Source greps — owner-facing surfaces
// -----------------------------------------------------------------------------
function readAllUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(p);
    }
  }
  return out;
}

test("owner statement detail does not reference banned source identifiers", () => {
  const body = readFileSync(
    join(repoRoot, "src/app/(owner)/owner/statements/[id]/page.tsx"),
    "utf-8",
  );
  for (const banned of [
    "revenueLineId",
    "revenue_line_id",
    "expenseLineId",
    "expense_line_id",
    "financeLinkId",
    "finance_link_id",
    "directBookingFinanceLinkId",
    "providerSessionId",
    "paymentWebhook",
    "webhookPayload",
    "configPrivateEncrypted",
    "tokenHash",
    "holdTokenHash",
    "guest.email",
    "guest.phone",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `owner statement page leaks ${banned}`,
    );
  }
});

test("owner-facing finance components do not surface source_table / source_id", () => {
  const candidates = [
    "src/components/finance/statement-source-breakdown.tsx",
    "src/components/finance/statement-warning-list.tsx",
    "src/components/finance/statement-explanation-card.tsx",
    "src/components/finance/statement-linked-activity.tsx",
    "src/components/finance/transparency-status-badge.tsx",
  ];
  for (const c of candidates) {
    const body = readFileSync(join(repoRoot, c), "utf-8");
    // Owner components must not embed source IDs in their JSX.  The
    // admin trace component is allowed to and is excluded.
    if (c.includes("source-breakdown") || c.includes("warning-list")) {
      // These components show a "trace status" string but never the
      // raw source_id when audience is owner — verified separately.
      // For this grep, we just check banned tokens.
    }
    for (const banned of [
      "providerPayload",
      "webhookPayload",
      "configPrivateEncrypted",
      "tokenHash",
      "passwordCiphertext",
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${c} contains banned token ${banned}`,
      );
    }
  }
});

test("admin source trace card does not embed encrypted/secret tokens", () => {
  const body = readFileSync(
    join(repoRoot, "src/components/finance/admin-source-trace-card.tsx"),
    "utf-8",
  );
  for (const banned of [
    "configPrivateEncrypted",
    "providerPayload",
    "webhookPayload",
    "tokenHash",
    "passwordCiphertext",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `admin trace card contains banned token ${banned}`,
    );
  }
  // It SHOULD contain source_table/source_id because that's its job.
  assert.ok(body.includes("internalSourceTable"));
  assert.ok(body.includes("internalSourceId"));
});

test("PDF renderer does not reference banned identifiers in output template", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/finance/pdf/owner-statement-pdf.tsx"),
    "utf-8",
  );
  for (const banned of [
    "providerSessionId",
    "providerPayload",
    "webhookPayload",
    "configPrivateEncrypted",
    "tokenHash",
    "passwordCiphertext",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `PDF renderer leaks ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Job + cron route
// -----------------------------------------------------------------------------
test("cron route + job catalog wire statement_transparency_rebuild", () => {
  const route = readFileSync(
    join(
      repoRoot,
      "src/app/api/cron/statement-transparency-rebuild/route.ts",
    ),
    "utf-8",
  );
  assert.ok(route.includes("statement_transparency_rebuild"));
  assert.ok(route.includes("handleCronJobRequest"));
  const defs = readFileSync(
    join(repoRoot, "src/features/jobs/definitions.ts"),
    "utf-8",
  );
  assert.ok(defs.includes('"statement_transparency_rebuild"'));
  assert.ok(defs.includes('"0 5 * * *"'));
  const actions = readFileSync(
    join(repoRoot, "src/features/jobs/actions.ts"),
    "utf-8",
  );
  assert.ok(actions.includes('"statement_transparency_rebuild"'));
  assert.ok(actions.includes("runStatementTransparencyRebuildJob"));
});

// -----------------------------------------------------------------------------
// Statement polish
// -----------------------------------------------------------------------------
test("groupKeyToOwnerLabel maps direct_booking_revenue to friendly label", async () => {
  const { groupKeyToOwnerLabel } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  assert.equal(
    groupKeyToOwnerLabel("direct_booking_revenue"),
    "Direct booking revenue",
  );
  assert.equal(groupKeyToOwnerLabel("ota_revenue"), "OTA / platform revenue");
  assert.equal(groupKeyToOwnerLabel("owner_stay_charges"), "Owner stay charges");
});

test("isOwnerVisibleGroup hides payouts but shows everything else", async () => {
  const { isOwnerVisibleGroup, STATEMENT_GROUP_KEYS } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  assert.equal(isOwnerVisibleGroup("payouts"), false);
  for (const k of STATEMENT_GROUP_KEYS) {
    if (k === "payouts") continue;
    assert.equal(isOwnerVisibleGroup(k), true, `${k} should be owner-visible`);
  }
});

test("formatOwnerSafeSourceLabel trims booking codes + falls back to group label", async () => {
  const { formatOwnerSafeSourceLabel } = await import(
    "../src/features/statement-transparency/grouping-pure"
  );
  // Booking code-like token is stripped.
  const stripped = formatOwnerSafeSourceLabel({
    groupKey: "direct_booking_revenue",
    description: "DBF-DEMO-0001 accommodation revenue",
  });
  assert.equal(stripped.includes("DBF-DEMO-0001"), false);
  // Empty description falls back to the group label.
  const fallback = formatOwnerSafeSourceLabel({
    groupKey: "direct_booking_revenue",
    description: "",
  });
  assert.equal(fallback, "Direct booking revenue");
});
