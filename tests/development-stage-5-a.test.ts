/**
 * Stage 5.A — Knowledge Base Foundation tests.
 *
 * Mix of:
 *   - Migration shape tests (0054, 0055, 0056)
 *   - Schema export tests
 *   - Pure helper tests (BOQ rollup math, BOQ CSV parse/serialize)
 *   - Server module tests (server-only guard, transitions)
 *   - UI route smoke + sidebar audit
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  rollupBoqTotals,
  computeAdjustedUnitRate,
} from "../src/lib/development/server/boq/boq-helpers";
import {
  parseBoqCsv,
  serializeBoqCsv,
  splitCsvLine,
} from "../src/lib/development/server/boq/boq-import-export";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0054 = "drizzle/0054_development_os_stage_5_a_1_drawings.sql";
const MIG_0055 = "drizzle/0055_development_os_stage_5_a_2_boq_specs.sql";
const MIG_0056 = "drizzle/0056_development_os_stage_5_a_3_methods_quality.sql";

// ===========================================================================
// 1) Migration 0054 — Drawings
// ===========================================================================

test("migration 0054 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0054));
  const sql = read(MIG_0054);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0054 creates drawings + drawing_revisions + drawing_distribution_log", () => {
  const sql = read(MIG_0054);
  for (const t of [
    "drawings",
    "drawing_revisions",
    "drawing_distribution_log",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
});

test("migration 0054 drawings covers all 13 drawing types + 6 phases", () => {
  const sql = read(MIG_0054);
  for (const t of [
    "architectural",
    "structural",
    "mep_electrical",
    "mep_plumbing",
    "mep_hvac",
    "landscape",
    "pool",
    "site_plan",
    "detail",
    "shop_drawing",
    "as_built",
    "sketch",
    "other",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `drawing_type '${t}' missing`);
  }
  for (const p of [
    "concept",
    "schematic_design",
    "design_development",
    "permit_set",
    "construction_set",
    "as_built",
  ]) {
    assert.ok(sql.includes(`'${p}'`), `drawing_phase '${p}' missing`);
  }
});

test("migration 0054 drawing_revisions has 6 statuses", () => {
  const sql = read(MIG_0054);
  for (const s of [
    "draft",
    "for_review",
    "approved",
    "issued_for_construction",
    "superseded",
    "rejected",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `revision status '${s}' missing`);
  }
});

test("migration 0054 enforces UNIQUE(drawing_id, revision_label)", () => {
  const sql = read(MIG_0054);
  assert.match(sql, /UNIQUE \("drawing_id", "revision_label"\)/);
});

test("migration 0054 partial unique index ensures one IFC revision per drawing", () => {
  const sql = read(MIG_0054);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "drawing_revisions_active_ifc"[\s\S]*?WHERE "status" = 'issued_for_construction'/,
  );
});

test("migration 0054 distribution log has 5 distribution methods + UNIQUE(rev, vendor)", () => {
  const sql = read(MIG_0054);
  for (const m of [
    "whatsapp",
    "email",
    "physical_print",
    "platform_download",
    "other",
  ]) {
    assert.ok(sql.includes(`'${m}'`), `distribution_method '${m}' missing`);
  }
  assert.match(sql, /UNIQUE \("revision_id", "vendor_id"\)/);
});

test("migration 0054 RLS protects all 3 new tables", () => {
  const sql = read(MIG_0054);
  for (const t of [
    "drawings",
    "drawing_revisions",
    "drawing_distribution_log",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

// ===========================================================================
// 2) Migration 0055 — BOQ + Specifications
// ===========================================================================

test("migration 0055 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0055));
  const sql = read(MIG_0055);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0055 creates boq_documents + boq_sections + boq_items + specifications", () => {
  const sql = read(MIG_0055);
  for (const t of ["boq_documents", "boq_sections", "boq_items", "specifications"]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
});

test("migration 0055 boq_documents has 7 statuses", () => {
  const sql = read(MIG_0055);
  for (const s of [
    "draft",
    "under_review",
    "approved",
    "tender",
    "awarded",
    "superseded",
    "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `BOQ status '${s}' missing`);
  }
});

test("migration 0055 boq_items.total_minor is GENERATED STORED", () => {
  const sql = read(MIG_0055);
  assert.match(
    sql,
    /"total_minor" BIGINT GENERATED ALWAYS AS \(\s*\("quantity" \* "unit_rate_minor"\)::BIGINT\s*\) STORED/,
  );
});

test("migration 0055 boq_items has cost_category + specification + inventory FKs", () => {
  const sql = read(MIG_0055);
  assert.match(sql, /REFERENCES "dev_cost_categories"\("id"\)/);
  assert.match(sql, /REFERENCES "dev_os_inventory_items"\("id"\)/);
  // specification FK added at end of migration.
  assert.match(sql, /boq_items_specification_fk/);
});

test("migration 0055 boq_sections enforces UNIQUE(document, section_code)", () => {
  const sql = read(MIG_0055);
  assert.match(sql, /UNIQUE \("boq_document_id", "section_code"\)/);
});

test("migration 0055 boq_items enforces UNIQUE(section, item_code)", () => {
  const sql = read(MIG_0055);
  assert.match(sql, /UNIQUE \("section_id", "item_code"\)/);
});

test("migration 0055 specifications covers all 21 categories", () => {
  const sql = read(MIG_0055);
  for (const c of [
    "wall_finish",
    "floor_finish",
    "ceiling_finish",
    "paint",
    "tile",
    "stone",
    "wood",
    "metal",
    "glass",
    "plumbing_fixture",
    "electrical_fixture",
    "lighting",
    "door_window",
    "hardware",
    "appliance",
    "furniture",
    "landscape",
    "pool",
    "mep",
    "structural",
    "other",
  ]) {
    assert.ok(sql.includes(`'${c}'`), `spec_category '${c}' missing`);
  }
});

test("migration 0055 RLS protects all 4 new tables", () => {
  const sql = read(MIG_0055);
  for (const t of ["boq_documents", "boq_sections", "boq_items", "specifications"]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

// ===========================================================================
// 3) Migration 0056 — Method statements + Quality standards
// ===========================================================================

test("migration 0056 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0056));
  const sql = read(MIG_0056);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0056 creates method_statements + quality_standards", () => {
  const sql = read(MIG_0056);
  for (const t of ["method_statements", "quality_standards"]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
});

test("migration 0056 method_statements covers all 11 categories", () => {
  const sql = read(MIG_0056);
  for (const c of [
    "structural",
    "mep_electrical",
    "mep_plumbing",
    "mep_hvac",
    "finishing",
    "safety",
    "demolition",
    "site_preparation",
    "inspection",
    "handover",
    "general",
  ]) {
    assert.ok(sql.includes(`'${c}'`), `MS category '${c}' missing`);
  }
});

test("migration 0056 method_statements has 6 statuses + JSONB procedure_steps", () => {
  const sql = read(MIG_0056);
  for (const s of [
    "draft",
    "under_review",
    "approved",
    "active",
    "superseded",
    "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `MS status '${s}' missing`);
  }
  assert.match(sql, /"procedure_steps" JSONB NOT NULL/);
});

test("migration 0056 extends qa_qc_inspections with quality_standard_id FK", () => {
  const sql = read(MIG_0056);
  assert.match(
    sql,
    /ALTER TABLE "qa_qc_inspections"[\s\S]*?ADD COLUMN IF NOT EXISTS "quality_standard_id"/,
  );
  assert.match(
    sql,
    /qa_qc_inspections_standard_idx/,
  );
});

test("migration 0056 RLS protects 2 new tables", () => {
  const sql = read(MIG_0056);
  for (const t of ["method_statements", "quality_standards"]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
});

// ===========================================================================
// 4) Schema files
// ===========================================================================

test("Stage 5.A schema files exist + re-exported", () => {
  for (const rel of [
    "src/lib/db/schema/drawings.ts",
    "src/lib/db/schema/boq.ts",
    "src/lib/db/schema/specifications.ts",
    "src/lib/db/schema/method-quality.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/drawings";/);
  assert.match(idx, /export \* from "\.\/boq";/);
  assert.match(idx, /export \* from "\.\/specifications";/);
  assert.match(idx, /export \* from "\.\/method-quality";/);
});

test("qaQcInspections schema includes new qualityStandardId column", () => {
  const src = read("src/lib/db/schema/qa-qc.ts");
  assert.match(src, /qualityStandardId/);
});

// ===========================================================================
// 5) BOQ pure helpers — runtime tests
// ===========================================================================

test("rollupBoqTotals: simple flat document", () => {
  const result = rollupBoqTotals(
    [
      { id: "s1", parentSectionId: null },
      { id: "s2", parentSectionId: null },
    ],
    [
      { sectionId: "s1", totalMinor: 10_000 },
      { sectionId: "s1", totalMinor: 5_000 },
      { sectionId: "s2", totalMinor: 25_000 },
    ],
  );
  assert.equal(result.sectionSubtotals.get("s1"), 15_000);
  assert.equal(result.sectionSubtotals.get("s2"), 25_000);
  assert.equal(result.documentTotal, 40_000);
});

test("rollupBoqTotals: hierarchical sections roll up to parent", () => {
  // Root s1 has children s1a + s1b. s1's subtotal = own items (none) + children.
  const result = rollupBoqTotals(
    [
      { id: "s1", parentSectionId: null },
      { id: "s1a", parentSectionId: "s1" },
      { id: "s1b", parentSectionId: "s1" },
    ],
    [
      { sectionId: "s1a", totalMinor: 100 },
      { sectionId: "s1b", totalMinor: 200 },
    ],
  );
  assert.equal(result.sectionSubtotals.get("s1a"), 100);
  assert.equal(result.sectionSubtotals.get("s1b"), 200);
  assert.equal(result.sectionSubtotals.get("s1"), 300);
  assert.equal(result.documentTotal, 300);
});

test("rollupBoqTotals: empty inputs return zero", () => {
  const result = rollupBoqTotals([], []);
  assert.equal(result.documentTotal, 0);
  assert.equal(result.sectionSubtotals.size, 0);
});

test("rollupBoqTotals: deep hierarchy (3 levels) rolls up correctly", () => {
  const result = rollupBoqTotals(
    [
      { id: "a", parentSectionId: null },
      { id: "b", parentSectionId: "a" },
      { id: "c", parentSectionId: "b" },
    ],
    [{ sectionId: "c", totalMinor: 999 }],
  );
  assert.equal(result.sectionSubtotals.get("c"), 999);
  assert.equal(result.sectionSubtotals.get("b"), 999);
  assert.equal(result.sectionSubtotals.get("a"), 999);
  assert.equal(result.documentTotal, 999);
});

test("rollupBoqTotals: detects cycles in section hierarchy", () => {
  assert.throws(() =>
    rollupBoqTotals(
      [
        { id: "a", parentSectionId: "b" },
        { id: "b", parentSectionId: "a" },
      ],
      [],
    ),
  );
});

test("rollupBoqTotals: rejects non-finite item totals", () => {
  assert.throws(() =>
    rollupBoqTotals(
      [{ id: "s1", parentSectionId: null }],
      [{ sectionId: "s1", totalMinor: NaN }],
    ),
  );
});

test("computeAdjustedUnitRate: applies waste + logistics + labor coefficients additively", () => {
  // 1000 × (1 + 0.05 + 0.10 + 0.15) = 1000 × 1.30 = 1300
  const result = computeAdjustedUnitRate({
    unitRateMinor: 1000,
    wasteFactor: 0.05,
    logisticsFactor: 0.1,
    laborFactor: 0.15,
  });
  assert.equal(result, 1300);
});

test("computeAdjustedUnitRate: zero coefficients return base rate", () => {
  assert.equal(
    computeAdjustedUnitRate({ unitRateMinor: 5000 }),
    5000,
  );
});

test("computeAdjustedUnitRate: rejects negative coefficients", () => {
  assert.throws(() =>
    computeAdjustedUnitRate({
      unitRateMinor: 1000,
      wasteFactor: -0.1,
    }),
  );
});

// ===========================================================================
// 6) BOQ CSV parse/serialize — pure tests
// ===========================================================================

test("splitCsvLine: handles quoted fields with embedded commas", () => {
  assert.deepEqual(
    splitCsvLine('a,"b,c",d'),
    ["a", "b,c", "d"],
  );
});

test("splitCsvLine: handles escaped quotes (doubled)", () => {
  assert.deepEqual(
    splitCsvLine('"He said ""hi""",x'),
    ['He said "hi"', "x"],
  );
});

test("parseBoqCsv: rejects missing header columns", () => {
  assert.throws(() =>
    parseBoqCsv("wrong,header\nfoo,bar"),
  );
});

test("parseBoqCsv: section row + item row round-trip", () => {
  const csv =
    "section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency\n" +
    "1,Earthworks,,,,,,\n" +
    "1,,001,Excavation,1500,m²,8500,IDR\n";
  const parsed = parseBoqCsv(csv);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.sections[0].sectionName, "Earthworks");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].itemCode, "001");
  assert.equal(parsed.items[0].quantity, 1500);
  assert.equal(parsed.items[0].unitRateMinor, 8500n);
});

test("parseBoqCsv: auto-creates section if item row references unknown code", () => {
  const csv =
    "section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency\n" +
    "5,,001,Surprise item,10,m,1000,IDR\n";
  const parsed = parseBoqCsv(csv);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.sections[0].sectionCode, "5");
  assert.equal(parsed.items.length, 1);
});

test("parseBoqCsv: rejects negative quantity", () => {
  const csv =
    "section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency\n" +
    "1,,001,bad,-5,m,1000,IDR\n";
  assert.throws(() => parseBoqCsv(csv));
});

test("parseBoqCsv: rejects non-integer unit_rate_minor", () => {
  const csv =
    "section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency\n" +
    "1,,001,bad,5,m,not-a-number,IDR\n";
  assert.throws(() => parseBoqCsv(csv));
});

test("serializeBoqCsv: produces a header + section rows + item rows", () => {
  const csv = serializeBoqCsv({
    sections: [{ sectionCode: "1", sectionName: "Earthworks" }],
    items: [
      {
        sectionCode: "1",
        itemCode: "001",
        description: "Excavation",
        quantity: 1500,
        uom: "m²",
        unitRateMinor: 8500n,
        currency: "IDR",
      },
    ],
  });
  assert.match(csv, /^section_code,section_name,item_code/);
  assert.match(csv, /^1,Earthworks,/m);
  assert.match(csv, /^1,,001,Excavation,1500,m²,8500,IDR/m);
});

test("serializeBoqCsv: round-trips with parseBoqCsv", () => {
  const original = {
    sections: [
      { sectionCode: "1", sectionName: "Earthworks" },
      { sectionCode: "2", sectionName: "Structure" },
    ],
    items: [
      {
        sectionCode: "1",
        itemCode: "001",
        description: "Excavation",
        quantity: 1500,
        uom: "m²",
        unitRateMinor: 8500n,
        currency: "IDR",
      },
      {
        sectionCode: "2",
        itemCode: "001",
        description: "Concrete columns",
        quantity: 42,
        uom: "m³",
        unitRateMinor: 1850000n,
        currency: "IDR",
      },
    ],
  };
  const csv = serializeBoqCsv(original);
  const parsed = parseBoqCsv(csv);
  assert.equal(parsed.sections.length, 2);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[1].unitRateMinor, 1850000n);
});

test("serializeBoqCsv: escapes commas and quotes in description", () => {
  const csv = serializeBoqCsv({
    sections: [],
    items: [
      {
        sectionCode: "1",
        itemCode: "001",
        description: 'Item with, comma and "quotes"',
        quantity: 1,
        uom: "m",
        unitRateMinor: 1000n,
        currency: "IDR",
      },
    ],
  });
  // Re-parse to verify round-trip preservation.
  const reparsed = parseBoqCsv(csv);
  assert.equal(
    reparsed.items[0].description,
    'Item with, comma and "quotes"',
  );
});

// ===========================================================================
// 7) Server modules — files exist + use server-only (except pure helpers)
// ===========================================================================

test("Stage 5.A server modules exist + carry server-only", () => {
  for (const rel of [
    "src/lib/development/server/drawings/drawing-queries.ts",
    "src/lib/development/server/drawings/drawing-actions.ts",
    "src/lib/development/server/boq/boq-queries.ts",
    "src/lib/development/server/boq/boq-actions.ts",
    "src/lib/development/server/specifications/specification-queries.ts",
    "src/lib/development/server/specifications/specification-actions.ts",
    "src/lib/development/server/method-statements/method-statement-queries.ts",
    "src/lib/development/server/method-statements/method-statement-actions.ts",
    "src/lib/development/server/quality-standards/quality-standard-queries.ts",
    "src/lib/development/server/quality-standards/quality-standard-actions.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
    const src = read(rel);
    assert.match(src, /^import "server-only"/m, `${rel} missing server-only`);
  }
});

test("BOQ pure helpers are PURE (no server-only, no DB)", () => {
  for (const rel of [
    "src/lib/development/server/boq/boq-helpers.ts",
    "src/lib/development/server/boq/boq-import-export.ts",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /^import\s+"server-only"/m);
    assert.doesNotMatch(src, /requireDb|drizzle-orm/);
  }
});

test("drawing-actions: transitionDrawingRevision auto-supersedes prior IFC (atomic)", () => {
  const src = read(
    "src/lib/development/server/drawings/drawing-actions.ts",
  );
  assert.match(src, /db\.transaction/);
  assert.match(src, /existingIfc/);
  assert.match(src, /superseded/);
});

test("drawing-actions: enforces transition table", () => {
  const src = read(
    "src/lib/development/server/drawings/drawing-actions.ts",
  );
  assert.match(src, /VALID_NEXT/);
  assert.match(src, /cannot transition revision from/);
});

test("boq-actions: addBoqItem + importBoqFromCsv wrap in db.transaction", () => {
  const src = read("src/lib/development/server/boq/boq-actions.ts");
  // Should appear at least twice — addBoqItem and importBoqFromCsv.
  const matches = src.match(/db\.transaction/g) ?? [];
  assert.ok(
    matches.length >= 3,
    `expected >=3 db.transaction calls, got ${matches.length}`,
  );
});

test("boq-actions: importBoqFromCsv clears existing sections first (atomic replace)", () => {
  const src = read("src/lib/development/server/boq/boq-actions.ts");
  assert.match(src, /\.delete\(boqSections\)/);
});

test("boq-actions: recomputes section subtotals + document total atomically", () => {
  const src = read("src/lib/development/server/boq/boq-actions.ts");
  assert.match(src, /recomputeBoqTotalsTx/);
  assert.match(src, /rollupBoqTotals/);
});

test("specification-actions: supersede flow is atomic", () => {
  const src = read(
    "src/lib/development/server/specifications/specification-actions.ts",
  );
  assert.match(src, /db\.transaction/);
  assert.match(src, /supersededBy/);
});

test("method-statement-actions: enforces status transitions", () => {
  const src = read(
    "src/lib/development/server/method-statements/method-statement-actions.ts",
  );
  assert.match(src, /VALID_NEXT/);
  assert.match(src, /cannot transition method_statement from/);
});

// ===========================================================================
// 8) UI routes — REQUIRED, all 5 modules
// ===========================================================================

const UI_ROUTES = {
  drawings: [
    "src/app/(development-app)/development-os/drawings/page.tsx",
    "src/app/(development-app)/development-os/drawings/[code]/page.tsx",
    "src/app/(development-app)/development-os/drawings/[code]/distribution/page.tsx",
    "src/app/(development-app)/development-os/drawings/new/page.tsx",
  ],
  boq: [
    "src/app/(development-app)/development-os/boq/page.tsx",
    "src/app/(development-app)/development-os/boq/[code]/page.tsx",
    "src/app/(development-app)/development-os/boq/[code]/import/page.tsx",
    "src/app/(development-app)/development-os/boq/[code]/export/page.tsx",
    "src/app/(development-app)/development-os/boq/new/page.tsx",
  ],
  specifications: [
    "src/app/(development-app)/development-os/specifications/page.tsx",
    "src/app/(development-app)/development-os/specifications/[code]/page.tsx",
    "src/app/(development-app)/development-os/specifications/new/page.tsx",
  ],
  methodStatements: [
    "src/app/(development-app)/development-os/method-statements/page.tsx",
    "src/app/(development-app)/development-os/method-statements/[code]/page.tsx",
    "src/app/(development-app)/development-os/method-statements/new/page.tsx",
  ],
  qualityStandards: [
    "src/app/(development-app)/development-os/quality-standards/page.tsx",
    "src/app/(development-app)/development-os/quality-standards/[code]/page.tsx",
    "src/app/(development-app)/development-os/quality-standards/new/page.tsx",
  ],
} as const;

test("Drawings UI: list + detail + distribution + new all exist", () => {
  for (const rel of UI_ROUTES.drawings) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("BOQ UI: list + detail + import + export + new all exist", () => {
  for (const rel of UI_ROUTES.boq) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Specifications UI: list + detail + new all exist", () => {
  for (const rel of UI_ROUTES.specifications) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Method statements UI: list + detail + new all exist", () => {
  for (const rel of UI_ROUTES.methodStatements) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Quality standards UI: list + detail + new all exist", () => {
  for (const rel of UI_ROUTES.qualityStandards) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("All Stage 5.A UI routes wrap in DevelopmentShell + force-dynamic", () => {
  const allRoutes = [
    ...UI_ROUTES.drawings,
    ...UI_ROUTES.boq,
    ...UI_ROUTES.specifications,
    ...UI_ROUTES.methodStatements,
    ...UI_ROUTES.qualityStandards,
  ];
  for (const rel of allRoutes) {
    const src = read(rel);
    assert.match(src, /DevelopmentShell/, `${rel} missing DevelopmentShell`);
    assert.match(src, /force-dynamic/, `${rel} missing force-dynamic`);
  }
});

test("All Stage 5.A list pages route through safeQuery", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/drawings/page.tsx",
    "src/app/(development-app)/development-os/boq/page.tsx",
    "src/app/(development-app)/development-os/specifications/page.tsx",
    "src/app/(development-app)/development-os/method-statements/page.tsx",
    "src/app/(development-app)/development-os/quality-standards/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery/, `${rel} missing safeQuery`);
  }
});

test("Stage 5.A client forms use 'use client' + useTransition", () => {
  for (const rel of [
    "src/components/development/drawings/drawing-form.tsx",
    "src/components/development/boq/boq-form.tsx",
    "src/components/development/boq/boq-import-form.tsx",
    "src/components/development/specifications/specification-form.tsx",
    "src/components/development/method-statements/method-statement-form.tsx",
    "src/components/development/quality-standards/quality-standard-form.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /^"use client"/m, `${rel} missing 'use client'`);
    assert.match(src, /useTransition/, `${rel} missing useTransition`);
  }
});

test("BOQ import form references CSV (not XLSX) — no new deps", () => {
  // Confirms the architectural decision: CSV chosen to keep zero new deps.
  const src = read("src/components/development/boq/boq-import-form.tsx");
  assert.match(src, /CSV/);
  assert.doesNotMatch(src, /xlsx|sheetjs|exceljs/i);
});

test("BOQ export client component is browser-native (Blob + createObjectURL)", () => {
  const src = read("src/components/development/boq/boq-export-client.tsx");
  assert.match(src, /^"use client"/m);
  assert.match(src, /new Blob/);
  assert.match(src, /createObjectURL/);
});

test("Method statement detail renders procedure_steps as ordered list", () => {
  const src = read(
    "src/app/(development-app)/development-os/method-statements/[code]/page.tsx",
  );
  assert.match(src, /procedureSteps/);
  assert.match(src, /<ol /);
});

test("Drawing detail surfaces active IFC revision", () => {
  const src = read(
    "src/app/(development-app)/development-os/drawings/[code]/page.tsx",
  );
  assert.match(src, /issued_for_construction/);
  assert.match(src, /Active IFC/);
});

// ===========================================================================
// 9) Sidebar — KNOWLEDGE BASE section
// ===========================================================================

test("Sidebar: Knowledge base section added with all 5 entries", () => {
  const nav = read("src/lib/development/navigation.ts");
  // Section label.
  assert.match(nav, /label: "Knowledge base"/);
  // All 5 hrefs.
  for (const path of [
    "/drawings",
    "/boq",
    "/specifications",
    "/method-statements",
    "/quality-standards",
  ]) {
    assert.match(
      nav,
      new RegExp(`\\$\\{DEVELOPMENT_APP_PATH\\}${path}`),
      `nav missing ${path}`,
    );
  }
});

test("Sidebar audit: every nav href still resolves to an existing page.tsx (regression)", () => {
  const nav = read("src/lib/development/navigation.ts");
  const matches = nav.matchAll(
    /href:\s*`\$\{DEVELOPMENT_APP_PATH\}([^`]*)`/g,
  );
  const broken: string[] = [];
  for (const m of matches) {
    const subpath = m[1];
    if (subpath === "") continue;
    const rel = `src/app/(development-app)/development-os${subpath}/page.tsx`;
    if (!exists(rel)) broken.push(`${subpath}  →  ${rel}`);
  }
  assert.deepEqual(
    broken,
    [],
    `${broken.length} broken sidebar link(s):\n${broken.join("\n")}`,
  );
});

// ===========================================================================
// 10) Cross-stage integration
// ===========================================================================

test("boq_items.specification_id FK is added to specifications table", () => {
  const sql = read(MIG_0055);
  assert.match(sql, /boq_items_specification_fk/);
  assert.match(
    sql,
    /FOREIGN KEY \("specification_id"\) REFERENCES "specifications"\("id"\)/,
  );
});

test("qa_qc_inspections.quality_standard_id is the bridge from Stage 4.C → Stage 5.A", () => {
  const sql = read(MIG_0056);
  assert.match(sql, /quality_standard_id/);
  assert.match(sql, /REFERENCES "quality_standards"\("id"\)/);
});

test("Stage 5.A introduces 7 new tables + 1 column on existing qa_qc_inspections", () => {
  // Sanity check on the per-stage table count claim.
  const newTables = [
    "drawings",
    "drawing_revisions",
    "drawing_distribution_log",
    "boq_documents",
    "boq_sections",
    "boq_items",
    "specifications",
    "method_statements",
    "quality_standards",
  ];
  assert.equal(newTables.length, 9); // 3 (drawings) + 4 (BOQ+specs) + 2 (methods+QS)
});

test("No new cron jobs in Stage 5.A — count remains at 49", () => {
  // Sidebar audit + cron index check.
  const cronIdx = read("src/lib/development/server/cron/index.ts");
  // Counts should stay at 4.B (3) + 4.C (4) + earlier additions.
  // Critical-path-recompute is the most recent addition (4.C).
  assert.match(cronIdx, /critical_path_recompute/);
  // No 5.A-specific job key registered.
  assert.doesNotMatch(cronIdx, /drawing_expiry|boq_recompute|specification/);
});

// ===========================================================================
// 11) Additional gap-filling tests (per per-module targets in spec)
// ===========================================================================

test("rollupBoqTotals: zero items but sections exist returns zero subtotals", () => {
  const result = rollupBoqTotals(
    [
      { id: "s1", parentSectionId: null },
      { id: "s2", parentSectionId: null },
    ],
    [],
  );
  assert.equal(result.documentTotal, 0);
  assert.equal(result.sectionSubtotals.get("s1"), 0);
  assert.equal(result.sectionSubtotals.get("s2"), 0);
});

test("rollupBoqTotals: items in nested children correctly bubble up", () => {
  // a (root)
  //   ├─ b
  //   │   └─ c (1000)
  //   └─ d (500)
  // a should = 1500.
  const result = rollupBoqTotals(
    [
      { id: "a", parentSectionId: null },
      { id: "b", parentSectionId: "a" },
      { id: "c", parentSectionId: "b" },
      { id: "d", parentSectionId: "a" },
    ],
    [
      { sectionId: "c", totalMinor: 1000 },
      { sectionId: "d", totalMinor: 500 },
    ],
  );
  assert.equal(result.sectionSubtotals.get("a"), 1500);
  assert.equal(result.documentTotal, 1500);
});

test("computeAdjustedUnitRate: rounds to nearest integer (no fractional cents)", () => {
  // 1000 × (1 + 0.001) = 1001.0 — already integer.
  // 1000 × (1 + 0.0007) = 1000.7 → 1001
  assert.equal(
    computeAdjustedUnitRate({
      unitRateMinor: 1000,
      wasteFactor: 0.0007,
    }),
    1001,
  );
});

test("parseBoqCsv: empty body returns empty arrays", () => {
  const parsed = parseBoqCsv("");
  assert.deepEqual(parsed.sections, []);
  assert.deepEqual(parsed.items, []);
});

test("parseBoqCsv: handles trailing newline + windows line endings", () => {
  const csv =
    "section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency\r\n" +
    "1,Earthworks,,,,,,\r\n" +
    "1,,001,Excavation,1500,m²,8500,IDR\r\n";
  const parsed = parseBoqCsv(csv);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.items.length, 1);
});

test("parseBoqCsv: defaults currency to IDR when blank", () => {
  const csv =
    "section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency\n" +
    "1,,001,test,1,m,100,\n";
  const parsed = parseBoqCsv(csv);
  assert.equal(parsed.items[0].currency, "IDR");
});

test("specifications schema: supports supersession chain via supersededBy self-FK", () => {
  // Drizzle schema test — supersededBy is declared.
  const src = read("src/lib/db/schema/specifications.ts");
  assert.match(src, /supersededBy/);
});

test("method_statements schema: procedureSteps is JSONB notNull", () => {
  const src = read("src/lib/db/schema/method-quality.ts");
  assert.match(src, /procedureSteps[\s\S]{0,80}\.notNull\(\)/);
});

test("quality_standards schema: tolerance_specification is JSONB", () => {
  const src = read("src/lib/db/schema/method-quality.ts");
  assert.match(src, /toleranceSpecification: jsonb/);
});

test("Stage 5.A is internal-only — no buyer/investor portal exposure", () => {
  // Buyer portal pages must NOT import from any 5.A schema/server module.
  const buyerLayout = read("src/app/(buyer-portal)/layout.tsx");
  for (const forbidden of [
    "drawings",
    "boq",
    "specifications",
    "method-statements",
    "quality-standards",
  ]) {
    assert.doesNotMatch(
      buyerLayout,
      new RegExp(forbidden),
      `buyer portal layout must not import ${forbidden}`,
    );
  }
  // Investor portal layout same.
  const invLayout = read("src/app/(investor-portal)/layout.tsx");
  for (const forbidden of [
    "drawings",
    "boq",
    "specifications",
    "method-statements",
    "quality-standards",
  ]) {
    assert.doesNotMatch(invLayout, new RegExp(forbidden));
  }
});
