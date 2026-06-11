/**
 * Hotfix HF-5 — multi-tenant scoping regression test.
 *
 * Migration 0072 added `organization_id NOT NULL` to ~85 tables. Any
 * `db.insert(table).values({...})` that omits `organizationId` will
 * fail at runtime with PG error 23502, and any
 * `db.update(table).set(...).where(eq(table.id, x))` that omits an
 * org-scope predicate is a cross-tenant data-write risk.
 *
 * This test walks every `"use server"` file under src/, finds every
 * Drizzle insert/update/delete on a known multi-tenant table, and
 * fails if:
 *  - INSERT.values literal doesn't include an `organizationId` key,
 *    AND doesn't contain a spread expression (object/array spread
 *    means the value may be supplied via the spread, manual review).
 *  - UPDATE.where doesn't reference `organizationId`.
 *
 * The list of multi-tenant tables is sourced from migration 0072.
 * Tables not listed there are treated as not-multi-tenant for this
 * check (e.g. organizations itself, asset_types, etc).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "src");

/**
 * Multi-tenant table identifiers (Drizzle camelCase exports). Names
 * here MUST match the JS identifier you'd see in `db.insert(X)`. The
 * underlying SQL column name (snake_case) is irrelevant to the scan.
 *
 * Sourced from drizzle/0072_development_os_stage_5_j_2_propagation.sql
 * — only the NOT NULL set (the first `tagged_tables` array). The
 * NULLABLE reference tables are excluded.
 */
const MULTI_TENANT_TABLES = new Set<string>([
  // Stage 4.A — dev finance + procurement
  "devBankAccounts",
  "devBudgetLines",
  "devCommitmentsLedger",
  "devCorporateEvents",
  "devCostCategories",
  "devFxSnapshots",
  "devInvoiceLines",
  "devInvoices",
  "devNotificationDeliveryLog",
  "devNotificationRules",
  "devNotificationTemplates",
  "devTransactions",
  "taxPeriodReports",
  "sharedCostAllocations",
  "sharedCostAllocationLines",
  "procurementQuotations",
  "procurementQuotationLines",
  // Stage 4.B — capital + investors + buyers
  "capitalCommitments",
  "capitalDrawdowns",
  "distributions",
  "distributionAllocations",
  "walletMovements",
  "walletTransactions",
  "waterfallRules",
  "investorWallets",
  "investors",
  "investorPortalRequests",
  "buyers",
  "buyerProgressReports",
  "buyerUnitAssignments",
  "residualInventoryUnits",
  "residualUnitOwnershipShares",
  "companyStructureShareholders",
  "projectCompanyStructures",
  // Stage 4.C — workpkgs + safety + qa + inventory + vendors
  "workPackages",
  "projectTasks",
  "taskDependencies",
  "projectPhases",
  "projectRisks",
  "projectDecisions",
  "qaQcInspections",
  "qaQcIssues",
  "qaQcIssuePhotos",
  "changeOrders",
  "safetyIncidents",
  "devOsInventoryItems",
  "devOsInventoryLocations",
  "devOsInventoryMovements",
  "devOsInventoryStockBalances",
  "devOsPurchaseRequests",
  "siteReports",
  "siteReportPhotos",
  "siteReportZones",
  "siteWorkforceLogs",
  "siteZones",
  "vendors",
  "vendorEngagements",
  "materialPurchaseOrders",
  "materialPoLines",
  "materialDeliveries",
  "materialDeliveryLines",
  "materialConsumptionLogs",
  // Stage 5.A — drawings + boq + specs
  "drawings",
  "drawingRevisions",
  "drawingDistributionLog",
  "boqDocuments",
  "boqSections",
  "boqItems",
  "specifications",
  "methodStatements",
  "qualityStandards",
  // Stage 5.B — revenue + payroll + capacity
  "revenueStreams",
  "payrollPeriods",
  // Migration 0172 — payroll statutory (BPJS/PPh21) + payslip breakdown.
  "orgPayrollSettings",
  "payrollPayslips",
  "teamCapacityTracking",
  "projectCycleRecommendations",
  "unitCostAllocations",
  "cashflowForecasts",
  // Stage 5.C — exec
  "executiveMetricsSnapshots",
  "riskRadarAlerts",
  "executiveDigests",
  // Stage 5.D — AI agent infra
  "agentInvocationLog",
  "agentOutputs",
  "projectAiMemory",
  // Stage 5.E — marketing + sales
  "campaigns",
  "campaignCosts",
  "leads",
  "contentPieces",
  "contentVariants",
  "salesConversationThreads",
  "managerPerformanceMetrics",
  // Stage 5.F — cabinet prefs
  "cabinetPreferences",
  // Stage 5.H — schedule
  "scheduleBaselines",
  "scheduleVariances",
  "resourcePools",
  "taskResourceAssignments",
  "productivityLogs",
  // Stage 5.I — push + offline
  "pushSubscriptions",
  "notificationDispatchLog",
  "offlineActionQueue",
]);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
}

function isUseServerFile(src: string): boolean {
  return /^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use server["']/.test(
    src,
  );
}

interface Violation {
  file: string;
  line: number;
  kind: "insert-missing-org" | "update-missing-org-where";
  table: string;
}

function getCallee(call: ts.CallExpression): string | null {
  // Match `db.insert(X)` or `db.update(X)` or `db.delete(X)`.
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const method = call.expression.name.text;
  if (method !== "insert" && method !== "update" && method !== "delete") {
    return null;
  }
  const arg = call.arguments[0];
  if (!arg || !ts.isIdentifier(arg)) return null;
  return `${method}:${arg.text}`;
}

function findChainedMethod(
  start: ts.CallExpression,
  method: string,
): ts.CallExpression | null {
  // Walk up the AST until we find a CallExpression whose property
  // access name is `method`. The Drizzle fluent chain
  // `db.insert(X).values({...}).returning(...)` parses as nested
  // PropertyAccess → Call. Reverse: start with the deepest
  // CallExpression and step UP.
  let node: ts.Node | undefined = start.parent;
  while (node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === method &&
      ts.isCallExpression(node.parent)
    ) {
      return node.parent;
    }
    if (!ts.isPropertyAccessExpression(node) && !ts.isCallExpression(node)) {
      return null;
    }
    node = node.parent;
  }
  return null;
}

function valuesArgIncludesOrg(arg: ts.Expression): {
  ok: boolean;
  reason: string;
} {
  // Spread-only or array literal of objects: skip — manual review.
  if (ts.isArrayLiteralExpression(arg)) {
    // If every element is an object literal, check each.
    if (arg.elements.length === 0) return { ok: true, reason: "empty-array" };
    for (const el of arg.elements) {
      if (!ts.isObjectLiteralExpression(el)) {
        return { ok: true, reason: "non-object-element" };
      }
      const check = objectIncludesOrgKey(el);
      if (!check.ok) return check;
    }
    return { ok: true, reason: "array-of-objects-all-pass" };
  }
  if (!ts.isObjectLiteralExpression(arg)) {
    // Identifier or computed — caller passed a pre-built object.
    // Manual review; treat as pass to avoid false positives.
    return { ok: true, reason: "non-literal" };
  }
  return objectIncludesOrgKey(arg);
}

function objectIncludesOrgKey(
  obj: ts.ObjectLiteralExpression,
): { ok: boolean; reason: string } {
  let sawSpread = false;
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) {
      sawSpread = true;
      continue;
    }
    if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
      const name = p.name;
      if (ts.isIdentifier(name) && name.text === "organizationId") {
        return { ok: true, reason: "has-organizationId-key" };
      }
    }
  }
  if (sawSpread) return { ok: true, reason: "has-spread-assume-supplies-org" };
  return { ok: false, reason: "missing-organizationId" };
}

function whereArgReferencesOrg(arg: ts.Expression): boolean {
  // Walk descendants for any Identifier with text 'organizationId'.
  let found = false;
  function walkExpr(node: ts.Node): void {
    if (found) return;
    if (ts.isIdentifier(node) && node.text === "organizationId") {
      found = true;
      return;
    }
    ts.forEachChild(node, walkExpr);
  }
  walkExpr(arg);
  return found;
}

function scanFile(file: string, src: string): Violation[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: Violation[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = getCallee(node);
      if (callee) {
        const [method, tableName] = callee.split(":");
        if (MULTI_TENANT_TABLES.has(tableName)) {
          if (method === "insert") {
            const valuesCall = findChainedMethod(node, "values");
            const arg = valuesCall?.arguments[0];
            if (arg) {
              const check = valuesArgIncludesOrg(arg);
              if (!check.ok) {
                const { line } = sf.getLineAndCharacterOfPosition(
                  node.getStart(sf),
                );
                out.push({
                  file,
                  line: line + 1,
                  kind: "insert-missing-org",
                  table: tableName,
                });
              }
            }
          } else if (method === "update" || method === "delete") {
            const whereCall = findChainedMethod(node, "where");
            const arg = whereCall?.arguments[0];
            // No .where() at all is also a violation (full-table
            // mutation).
            if (!arg || !whereArgReferencesOrg(arg)) {
              const { line } = sf.getLineAndCharacterOfPosition(
                node.getStart(sf),
              );
              out.push({
                file,
                line: line + 1,
                kind: "update-missing-org-where",
                table: tableName,
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return out;
}

const allFiles: string[] = [];
walk(SRC, allFiles);
const useServerFiles = allFiles.filter((f) =>
  isUseServerFile(readFileSync(f, "utf8")),
);

const allViolations: Violation[] = [];
for (const file of useServerFiles) {
  const src = readFileSync(file, "utf8");
  allViolations.push(...scanFile(file, src));
}

/**
 * Ratchet pattern: the codebase currently has ~163 multi-tenant
 * scoping violations (HF-5 audit). Fixing all 163 requires an
 * architectural sprint (the spec explicitly halted with "more than
 * 20 actions need fixing → suggests Drizzle middleware to inject
 * orgId universally"). Until that lands, this test only fails on
 * NEW violations — the baseline is captured in `hf5-baseline.json`.
 *
 * Workflow:
 *   1. Touched a "use server" file and added an INSERT/UPDATE that's
 *      missing organizationId? Test fails — fix it before merging.
 *   2. Cleaned up an existing violation? Re-run the test; it will
 *      tell you to shrink the baseline. Delete the matching line
 *      from hf5-baseline.json.
 *   3. Want the current full list of remaining sites? See
 *      docs/audits/2026-05-15-hotfix-hf-5-multitenant-audit.md.
 */
const BASELINE_PATH = resolve(HERE, "fixtures/hf5-baseline.json");

interface BaselineEntry {
  file: string;
  line: number;
  kind: Violation["kind"];
  table: string;
}

function loadBaseline(): BaselineEntry[] {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineEntry[];
  } catch {
    return [];
  }
}

function violationKey(v: { file: string; line: number; kind: string; table: string }): string {
  // Identity by (file, kind, table). Line numbers shift with edits;
  // file+kind+table is the stable tuple for a given violation site.
  return `${v.file.replace(ROOT + "/", "")}|${v.kind}|${v.table}`;
}

test("HF-5: no NEW multi-tenant scoping regressions vs. baseline", () => {
  const baseline = loadBaseline();
  const baselineKeys = new Set(baseline.map(violationKey));
  const currentKeys = new Set(allViolations.map(violationKey));

  const newSinceBaseline = allViolations.filter(
    (v) => !baselineKeys.has(violationKey(v)),
  );
  const fixedSinceBaseline = [...baselineKeys].filter(
    (k) => !currentKeys.has(k),
  );

  // Hard fail on new regressions.
  if (newSinceBaseline.length > 0) {
    const summary = newSinceBaseline
      .map(
        (v) =>
          `  ${v.file.replace(ROOT + "/", "")}:${v.line} — ${v.kind} on ${v.table}`,
      )
      .join("\n");
    assert.fail(
      `Found ${newSinceBaseline.length} NEW multi-tenant scoping violation(s) since baseline:\n${summary}\n\n` +
        `Either fix the new code to include organizationId (see src/lib/development/server/bank-account-actions.ts for the pattern), ` +
        `or — if intentional — add the entries to tests/fixtures/hf5-baseline.json with justification in the closure doc.`,
    );
  }

  // Soft signal on regressions cleaned up.
  if (fixedSinceBaseline.length > 0) {
    console.log(
      `\nHF-5: ${fixedSinceBaseline.length} baseline violation(s) appear to be fixed — consider shrinking tests/fixtures/hf5-baseline.json:`,
    );
    for (const k of fixedSinceBaseline) console.log(`  ${k}`);
  }
});

test("HF-5: scanner sanity check", () => {
  // The bank-account + cost-category actions exist and are
  // "use server" files. If not, scanner config is wrong.
  assert.ok(
    useServerFiles.some((f) => f.endsWith("/bank-account-actions.ts")),
    "expected bank-account-actions.ts in use-server set",
  );
  assert.ok(
    useServerFiles.some((f) => f.endsWith("/cost-category-actions.ts")),
    "expected cost-category-actions.ts in use-server set",
  );
});
