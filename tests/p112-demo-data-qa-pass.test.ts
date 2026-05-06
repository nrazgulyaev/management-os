/**
 * Prompt 112 — Full Demo Data Rebuild + End-to-End QA Pass tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// 1) Demo seed source
// -----------------------------------------------------------------------------
test("seed.sql contains sections for all required modules", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  for (const marker of [
    "INSERT INTO projects",
    "INSERT INTO villas",
    "INSERT INTO owners",
    "INSERT INTO ownership_shares",
    "INSERT INTO direct_booking_holds",
    "INSERT INTO direct_booking_requests",
    "INSERT INTO direct_booking_finance_links",
    "INSERT INTO statement_source_groups",
    "INSERT INTO statement_explanation_snapshots",
    "INSERT INTO direct_booking_guest_status_snapshots",
    "INSERT INTO direct_booking_guest_notifications",
    "INSERT INTO auth_login_attempts",
    "INSERT INTO auth_security_events",
    "INSERT INTO job_locks",
    "INSERT INTO owner_booking_summaries",
    "INSERT INTO owner_revenue_source_monthly",
  ]) {
    assert.ok(
      sql.toLowerCase().includes(marker.toLowerCase()),
      `seed missing ${marker}`,
    );
  }
});

test("seed uses no real-looking phone numbers in owner-facing rows", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  // Owner-facing tables that go to /owner/* surfaces.
  const ownerFacingTables = [
    "owner_booking_summaries",
    "owner_booking_revenue_breakdowns",
    "owner_revenue_source_monthly",
    "statement_explanation_snapshots",
    "direct_booking_guest_status_snapshots",
    "direct_booking_guest_notifications",
  ];
  for (const t of ownerFacingTables) {
    // Find the INSERT block(s) for this table.
    const blockRe = new RegExp(`INSERT INTO ${t}[\\s\\S]*?;`, "gi");
    for (const m of sql.matchAll(blockRe)) {
      const body = m[0];
      // Allow phone-like fragments only inside SQL operators / casts —
      // owner-facing row literals must not contain `+<digits>` patterns
      // followed by space-digits.
      assert.equal(
        /'\+\d[\d\s\-().]{6,}\d'/.test(body),
        false,
        `owner-facing seed for ${t} contains a phone-shaped literal`,
      );
    }
  }
});

test("seed token-fixture comments document plaintext is never persisted", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  // Hold token + stay token comments both spell this out.
  assert.match(sql, /raw tokens? (?:are |is )?never persisted/i);
});

test("seed uses ON CONFLICT / IF NOT EXISTS guards across new sections", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  // Count idempotency markers for the major modules.
  const conflictCount = (sql.match(/ON CONFLICT/gi) ?? []).length;
  const existsGuardCount = (sql.match(/IF NOT EXISTS/gi) ?? []).length;
  assert.ok(
    conflictCount >= 30,
    `expected ≥ 30 ON CONFLICT clauses, found ${conflictCount}`,
  );
  assert.ok(
    existsGuardCount >= 10,
    `expected ≥ 10 IF NOT EXISTS guards, found ${existsGuardCount}`,
  );
});

// -----------------------------------------------------------------------------
// 2) Demo validation script
// -----------------------------------------------------------------------------
test("validate-demo-data.ts pure module exposes runValidation + report formatter", async () => {
  const mod = await import(
    "../src/features/demo-data/validate-demo-data"
  );
  assert.equal(typeof mod.runValidation, "function");
  assert.equal(typeof mod.formatValidationReport, "function");
});

test("runValidation flags banned tokens + real-looking PII", async () => {
  const { runValidation } = await import(
    "../src/features/demo-data/validate-demo-data"
  );
  const report = await runValidation({
    countRows: async () => 999, // count never the issue
    fetchProjections: async () => [
      {
        label: "owner_booking_summaries",
        columns: ["owner_label", "guest_label"],
        rows: [
          {
            owner_label: "Direct booking · revenue_line_id leak",
            guest_label: "Emma W.",
          },
          {
            owner_label: "Owner stay",
            guest_label: "real.email@gmail.com",
          },
          {
            owner_label: "Direct booking",
            guest_label: "+1 415 555 0199",
          },
        ],
      },
    ],
  });
  assert.equal(report.ok, false);
  const kinds = new Set(report.projectionFindings.map((f) => f.banned));
  assert.ok(kinds.has("revenue_line_id"));
  assert.ok(kinds.has("real-looking email"));
  assert.ok(kinds.has("real-looking phone"));
});

test("runValidation passes a clean projection set", async () => {
  const { runValidation } = await import(
    "../src/features/demo-data/validate-demo-data"
  );
  const report = await runValidation({
    countRows: async () => 999,
    fetchProjections: async () => [
      {
        label: "owner_booking_summaries",
        columns: ["owner_label", "guest_label"],
        rows: [
          { owner_label: "Direct booking · Confirmed", guest_label: "Emma W." },
          { owner_label: "Airbnb stay · Confirmed", guest_label: "Daniel K." },
        ],
      },
    ],
  });
  assert.equal(report.ok, true);
  assert.equal(report.projectionFindings.length, 0);
});

// -----------------------------------------------------------------------------
// 3) Dashboard resilience
// -----------------------------------------------------------------------------
const RESILIENT_DASHBOARDS = [
  "src/app/(dashboard)/dashboard/guest-stays/security/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/storage/page.tsx",
  "src/app/(dashboard)/dashboard/maintenance-intelligence/page.tsx",
  "src/app/(dashboard)/dashboard/utilities/page.tsx",
  "src/app/(dashboard)/dashboard/pricing/page.tsx",
  "src/app/(dashboard)/dashboard/jobs/page.tsx",
];

test("listed high-risk dashboards import safeCount or safeList", () => {
  for (const f of RESILIENT_DASHBOARDS) {
    const body = readFileSync(join(repoRoot, f), "utf-8");
    const usesSafe =
      body.includes("safeCount") || body.includes("safeList");
    assert.ok(
      usesSafe,
      `${f} should import safeCount or safeList from db-health`,
    );
  }
});

test("resilience components exist and export the documented contract", () => {
  for (const c of [
    "src/components/system/migration-pending-card.tsx",
    "src/components/system/empty-state-card.tsx",
    "src/components/system/query-warning-card.tsx",
  ]) {
    const body = readFileSync(join(repoRoot, c), "utf-8");
    assert.ok(body.includes("export function"));
  }
});

// -----------------------------------------------------------------------------
// 4) Demo walkthrough route
// -----------------------------------------------------------------------------
test("/dashboard/demo route exists and includes every category", async () => {
  const route = readFileSync(
    join(repoRoot, "src/app/(dashboard)/dashboard/demo/page.tsx"),
    "utf-8",
  );
  assert.ok(route.includes("listDemoScenarios"));
  const { listDemoScenarios } = await import(
    "../src/features/demo-data/demo-scenarios"
  );
  const cats = new Set(listDemoScenarios().map((s) => s.category));
  for (const expected of [
    "owner_portal",
    "guest_stay",
    "direct_booking",
    "field_app",
    "vendor_portal",
    "finance",
    "operations",
    "pricing",
    "security_jobs",
  ] as const) {
    assert.ok(cats.has(expected), `missing demo category ${expected}`);
  }
});

// -----------------------------------------------------------------------------
// 5) QA docs
// -----------------------------------------------------------------------------
test("QA-DEMO-WALKTHROUGH.md covers every required section", () => {
  const md = readFileSync(
    join(repoRoot, "docs/QA-DEMO-WALKTHROUGH.md"),
    "utf-8",
  );
  for (const heading of [
    "Local startup",
    "Admin smoke test",
    "Owner walkthrough",
    "Guest stay walkthrough",
    "Direct booking walkthrough",
    "Field walkthrough",
    "Vendor walkthrough",
    "Finance walkthrough",
    "Operations walkthrough",
    "Pricing walkthrough",
    "Security / system health walkthrough",
    "Expected limitations",
    "Expected validation outcomes",
  ]) {
    assert.ok(md.includes(heading), `QA doc missing section "${heading}"`);
  }
});

test("ADR-0035 exists with required sections", () => {
  const md = readFileSync(
    join(repoRoot, "docs/ADR-0035-FULL_DEMO_DATA_AND_QA_PASS.md"),
    "utf-8",
  );
  for (const heading of [
    "Demo-data architecture",
    "Demo data design principles",
    "Seed idempotency strategy",
    "Projection rebuild strategy",
    "Demo validation script",
    "Dashboard resilience strategy",
    "Demo walkthrough route",
    "QA walkthrough doc",
  ]) {
    assert.ok(md.includes(heading), `ADR missing "${heading}"`);
  }
});

// -----------------------------------------------------------------------------
// 6) Permissions / security
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

test("owner / guest / vendor / field route trees do not import demo-data validation server internals", () => {
  const restrictedRoots = [
    "src/app/(owner)",
    "src/app/(public)/book",
    "src/app/(public)/stay",
    "src/app/(public)/vendor",
    "src/app/(field)",
    "src/app/(vendor)",
  ];
  for (const r of restrictedRoots) {
    const files = readAllUnder(join(repoRoot, r));
    for (const f of files) {
      const body = readFileSync(f, "utf-8");
      assert.equal(
        body.includes("@/features/demo-data/validate-demo-data"),
        false,
        `${f} imports the demo validator (admin-only)`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// 7) Build safety — no node-only imports in client demo components.
// -----------------------------------------------------------------------------
test("client demo components do not import node-only modules", () => {
  const clientFiles = [
    "src/app/(dashboard)/dashboard/demo/page.tsx",
    "src/components/system/migration-pending-card.tsx",
    "src/components/system/empty-state-card.tsx",
    "src/components/system/query-warning-card.tsx",
  ];
  for (const f of clientFiles) {
    const body = readFileSync(join(repoRoot, f), "utf-8");
    for (const banned of [
      'from "node:',
      'from "fs"',
      'from "path"',
      'from "postgres"',
      "createCipheriv",
      "scryptSync",
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} contains node-only import "${banned}"`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// 8) Demo IDs + dates exports
// -----------------------------------------------------------------------------
test("demo-ids exposes stable UUIDs for projects + villas + owners + holds", async () => {
  const ids = await import("../src/features/demo-data/demo-ids");
  assert.equal(Object.keys(ids.DEMO_PROJECT_IDS).length, 3);
  assert.ok(Object.keys(ids.DEMO_VILLA_IDS).length >= 6);
  assert.ok(Object.keys(ids.DEMO_OWNER_IDS).length >= 3);
  assert.ok(Object.keys(ids.DEMO_DIRECT_BOOKING_IDS).length >= 9);
  // demoEmail produces example.test addresses only.
  assert.equal(ids.demoEmail("emma"), "emma@example.test");
});

// -----------------------------------------------------------------------------
// 9) npm scripts are wired.
// -----------------------------------------------------------------------------
test("package.json wires demo:rebuild + demo:validate", () => {
  const pkg = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8"),
  );
  const scripts = pkg.scripts as Record<string, string>;
  assert.ok(scripts["demo:rebuild"]);
  assert.ok(scripts["demo:validate"]);
  assert.match(scripts["demo:rebuild"], /scripts\/demo-rebuild\.ts/);
  assert.match(scripts["demo:validate"], /scripts\/validate-demo-data\.ts/);
});
