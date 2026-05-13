/**
 * Stage 10.6 / Phase 10.6.F.2.deep — Risk-feed multi-axis filters.
 *
 * Operator-flagged gap from earlier ops review: risk feed had only
 * status filtering. With ~7 risk types × 4 severities × 4 statuses,
 * triage requires slicing by severity and type. This sub-phase wires
 * a 3-axis filter (status × severity × type) using the FilterPills
 * primitive from 10.6.C.2.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const PAGE = "src/app/(dashboard)/dashboard/maintenance-intelligence/risks/page.tsx";
const SERVICE = "src/features/maintenance-intelligence/services.ts";

// ============================================================================
// Service layer — listMaintenanceRiskEvents accepts riskType filter
// ============================================================================

test("10.6.F.2.deep — listMaintenanceRiskEvents accepts riskType filter", () => {
  const src = read(SERVICE);
  assert.match(src, /riskType\?: string;/);
  assert.match(
    src,
    /if \(opts\?\.riskType\)\s*filters\.push\(eq\(maintenanceRiskEvents\.riskType, opts\.riskType\)\)/,
  );
});

// ============================================================================
// Page — adopts FilterPills primitive (replaces ad-hoc Link pills)
// ============================================================================

test("10.6.F.2.deep — risks page imports FilterPills primitive", () => {
  const src = read(PAGE);
  assert.match(src, /import \{ FilterPills \} from "@\/components\/ui\/primitives"/);
});

test("10.6.F.2.deep — risks page renders 3 FilterPills (status, severity, risk type)", () => {
  const src = read(PAGE);
  const matches = src.match(/<FilterPills/g);
  assert.ok(
    matches && matches.length === 3,
    `expected 3 FilterPills, got ${matches?.length ?? 0}`,
  );
  // Verify each axis is labelled
  assert.match(src, /label="Status"/);
  assert.match(src, /label="Severity"/);
  assert.match(src, /label="Risk type"/);
});

test("10.6.F.2.deep — risks page reads severity + type from searchParams", () => {
  const src = read(PAGE);
  assert.match(
    src,
    /searchParams: Promise<\{ status\?: string; severity\?: string; type\?: string \}>/,
  );
});

test("10.6.F.2.deep — risks page passes severity + riskType to the loader", () => {
  const src = read(PAGE);
  assert.match(src, /severity: activeSeverity \|\| undefined/);
  assert.match(src, /riskType: activeType \|\| undefined/);
});

test("10.6.F.2.deep — risks page guards URL params against arbitrary values", () => {
  const src = read(PAGE);
  // The page validates severity + type against the known enum sets
  assert.match(src, /SEVERITIES\.includes\(sp\.severity as Severity\)/);
  assert.match(src, /RISK_TYPES\.includes\(sp\.type as RiskType\)/);
});

test("10.6.F.2.deep — severity + type pills include accurate counts (from status-filtered set)", () => {
  const src = read(PAGE);
  // The buildQuery + status-filtered count source means pill counts
  // reflect "of the X risks at this status, how many are at this severity/type"
  assert.match(src, /statusFilteredRows\.filter\(\(r\) => r\.severity === s\)\.length/);
  assert.match(src, /statusFilteredRows\.filter\(\(r\) => r\.riskType === t\)\.length/);
});

test("10.6.F.2.deep — filter changes preserve other axes via buildQuery helper", () => {
  const src = read(PAGE);
  // Changing one filter axis shouldn't drop the others
  assert.match(
    src,
    /function buildQuery\([\s\S]*?override: Partial<\{ status: string; severity: string; type: string \}>/,
  );
});
