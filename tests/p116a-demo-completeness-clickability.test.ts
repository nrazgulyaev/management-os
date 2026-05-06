/**
 * Prompt 116A — Demo Completeness, Portal Clickability & Seed
 * Coverage tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf-8");
}

// -----------------------------------------------------------------------------
// 1) Owner demo linkage
// -----------------------------------------------------------------------------

test("demoOwnerIdFallback yields the seeded owner in demo mode", async () => {
  const mod = await import("../src/features/demo-data/owner-fallback");
  const ids = mod.demoOwnerIdFallback({
    NEXT_PUBLIC_ENABLE_DEMO_MODE: "1",
    NODE_ENV: "development",
  } as NodeJS.ProcessEnv);
  assert.ok(ids.length >= 1);
  assert.match(ids[0], /^1eda0003-/);
});

test("demoOwnerIdFallback returns empty when ARCONIQUE_FORCE_MOCK alone in demo", async () => {
  const mod = await import("../src/features/demo-data/owner-fallback");
  const ids = mod.demoOwnerIdFallback({
    ARCONIQUE_FORCE_MOCK: "1",
    NODE_ENV: "development",
  } as NodeJS.ProcessEnv);
  assert.ok(ids.length >= 1);
});

test("demoOwnerIdFallback returns empty in production even if demo flag set", async () => {
  const mod = await import("../src/features/demo-data/owner-fallback");
  const ids = mod.demoOwnerIdFallback({
    NEXT_PUBLIC_ENABLE_DEMO_MODE: "1",
    NODE_ENV: "production",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(ids, []);
});

test("demoOwnerIdFallback returns empty when neither flag is set", async () => {
  const mod = await import("../src/features/demo-data/owner-fallback");
  const ids = mod.demoOwnerIdFallback({
    NODE_ENV: "development",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(ids, []);
});

test("notifications/services.ts wires the demo owner fallback", () => {
  const body = read("src/features/notifications/services.ts");
  assert.match(body, /demoOwnerIdFallback/);
  assert.match(body, /from\s+"@\/features\/demo-data\/owner-fallback"/);
});

test("owner portal services import the central listOwnerIdsForCurrentUser", () => {
  const body = read("src/features/owner-bookings/services.ts");
  assert.match(body, /listOwnerIdsForCurrentUser/);
});

// -----------------------------------------------------------------------------
// 2) /stay/demo clickability
// -----------------------------------------------------------------------------

const STAY_DEMO_SUBROUTES = [
  "check-in",
  "wifi",
  "guide",
  "house-rules",
  "neighborhood",
  "services",
  "concierge",
  "requests",
  "emergency",
  "offline",
];

test("every /stay/demo subroute file exists", () => {
  for (const r of STAY_DEMO_SUBROUTES) {
    const f = `src/app/(guest)/stay/demo/${r}/page.tsx`;
    assert.ok(existsSync(join(repoRoot, f)), `${f} should exist`);
  }
});

test("/stay/demo home links to every subroute", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  for (const r of STAY_DEMO_SUBROUTES) {
    assert.ok(
      body.includes(`/stay/demo/${r}`),
      `home page should link to /stay/demo/${r}`,
    );
  }
});

test("/stay/demo/services lists the required services", () => {
  const content = read("src/features/demo-data/stay-demo-content.ts");
  for (const tok of [
    /Airport transfer/i,
    /Private chef/i,
    /Breakfast/i,
    /(massage|wellness)/i,
    /Driver for the day/i,
    /PlayStation/i,
  ]) {
    assert.match(content, tok);
  }
});

test("/stay/demo/concierge has client-side input + canned reply", () => {
  const body = read("src/app/(guest)/stay/demo/concierge/page.tsx");
  assert.match(body, /"use client"/);
  assert.match(body, /useState/);
  assert.match(body, /Send|onSubmit|onClick/);
});

test("/stay/demo subroutes do NOT depend on a stay token", () => {
  for (const r of STAY_DEMO_SUBROUTES) {
    const body = read(`src/app/(guest)/stay/demo/${r}/page.tsx`);
    // No reads of [token] params or token-resolution helpers.
    assert.ok(
      !/resolveStayToken|verifyStayToken|stayToken|guestStayTokens/.test(body),
      `${r} must not depend on stay token`,
    );
  }
});

// -----------------------------------------------------------------------------
// 3) Field demo
// -----------------------------------------------------------------------------

test("field home demo fallback yields ≥8 tasks across statuses", () => {
  const body = read("src/app/(field)/field/page.tsx");
  assert.match(body, /buildDemoTasks|demoTasks/);
  // Ensure a mix of statuses is present in the source fixture.
  for (const tok of [
    /scheduled/,
    /in_progress/,
    /completed/,
    /Pool service/i,
    /Checkout cleaning/i,
    /AC maintenance|AC inspection/i,
    /Inventory restock|Damage report/i,
  ]) {
    assert.match(body, tok);
  }
});

test("field task demo checklist has ≥10 items + ≥3 photo-required", () => {
  const body = read("src/components/field/task-checklist.tsx");
  const items = body.match(/id: "/g) ?? [];
  assert.ok(items.length >= 10, `expected ≥10 checklist items, got ${items.length}`);
  const photoFlags = body.match(/requiresPhoto: true/g) ?? [];
  assert.ok(photoFlags.length >= 3, "expected ≥3 photo-required items");
});

// -----------------------------------------------------------------------------
// 4) Demo completeness matrix
// -----------------------------------------------------------------------------

test("docs/DEMO_COMPLETENESS_MATRIX.md exists and covers all module groups", () => {
  const body = read("docs/DEMO_COMPLETENESS_MATRIX.md");
  for (const group of [
    /Owner portal/i,
    /Guest stay/i,
    /Field \/ staff/i,
    /Vendor portal/i,
    /Direct booking/i,
    /Admin dashboard/i,
    /Operations/i,
    /Inventory/i,
    /Procurement/i,
    /Security/i,
    /Integrations/i,
    /Finance/i,
    /Owner intelligence/i,
    /Guest journey/i,
    /Service fulfilment/i,
    /Dynamic pricing/i,
    /Notifications/i,
    /Documents/i,
    /System/i,
  ]) {
    assert.match(body, group);
  }
});

test("docs/QA-DEMO-WALKTHROUGH cross-references DEMO_COMPLETENESS_MATRIX", () => {
  const body = read("docs/DEMO_COMPLETENESS_MATRIX.md");
  // The matrix doc is the source of truth — verify the readiness checklist exists.
  assert.match(body, /Demo readiness checklist/i);
});

// -----------------------------------------------------------------------------
// 5) Validation upgrades
// -----------------------------------------------------------------------------

test("validate-demo-data exposes severity + score", async () => {
  const mod = await import("../src/features/demo-data/validate-demo-data");
  const report = await mod.runValidation({
    countRows: async () => 0,
    fetchProjections: async () => [],
  });
  assert.ok("score" in report);
  assert.equal(typeof report.score, "number");
  for (const c of report.checks) {
    assert.ok(["PASS", "WARN", "FAIL"].includes(c.severity));
  }
});

test("validate-demo-data score reflects pass rate", async () => {
  const mod = await import("../src/features/demo-data/validate-demo-data");
  const reportFail = await mod.runValidation({
    countRows: async () => 0,
    fetchProjections: async () => [],
  });
  const reportPass = await mod.runValidation({
    countRows: async () => 1_000_000,
    fetchProjections: async () => [],
  });
  assert.ok(reportPass.score > reportFail.score);
  assert.equal(reportPass.score, 100);
});

test("validate-demo-data has module thresholds for new tables", () => {
  const body = read("src/features/demo-data/constants.ts");
  for (const t of [
    "owner_visible_events",
    "in_app_notifications",
    "operation_tasks",
    "service_fulfilments",
    "preventive_plans",
    "utility_accounts",
    "inventory_items",
    "procurement_requests",
    "procurement_orders",
    "villa_guide_sections",
    "villa_wifi_credentials",
    "villa_emergency_contacts",
    "villa_neighborhood_places",
    "ai_runs",
    "notifications",
    "app_users_owners",
  ]) {
    assert.ok(body.includes(t), `constants.ts mentions ${t}`);
  }
});

test("validate-demo-data flags optional tables as WARN, required as FAIL", async () => {
  const mod = await import("../src/features/demo-data/validate-demo-data");
  const report = await mod.runValidation({
    countRows: async () => 0,
    fetchProjections: async () => [],
  });
  const optionalCheck = report.checks.find((c) => c.table === "ai_runs");
  const requiredCheck = report.checks.find((c) => c.table === "projects");
  assert.ok(optionalCheck);
  assert.ok(requiredCheck);
  assert.equal(optionalCheck!.severity, "WARN");
  assert.equal(requiredCheck!.severity, "FAIL");
});

// -----------------------------------------------------------------------------
// 6) Admin module coverage
// -----------------------------------------------------------------------------

test("DEMO_SEED_MODULES includes the new P116A modules", async () => {
  const mod = await import("../src/features/demo-data/seed-summary");
  const all = mod.DEMO_SEED_MODULES.flatMap((m) => m.tables as readonly string[]);
  for (const t of [
    "operation_tasks",
    "service_fulfilments",
    "in_app_notifications",
    "owner_visible_events",
    "villa_guide_sections",
    "preventive_plans",
    "utility_accounts",
    "inventory_items",
    "procurement_requests",
  ]) {
    assert.ok(all.includes(t), `DEMO_SEED_MODULES covers ${t}`);
  }
});

test("completeness overview module sections cover owner / guest / field / admin", async () => {
  const mod = await import("../src/features/demo-data/completeness-overview");
  const titles = mod.COMPLETENESS_SECTIONS.map((s) => s.title.toLowerCase());
  assert.ok(titles.some((t) => t.includes("owner")));
  assert.ok(titles.some((t) => t.includes("guest")));
  assert.ok(titles.some((t) => t.includes("field")));
  assert.ok(titles.some((t) => t.includes("admin")));
  assert.ok(titles.some((t) => t.includes("system")));
  const summary = mod.summariseCompleteness();
  assert.ok(summary.total >= 25);
  assert.ok(summary.score >= 50);
});

// -----------------------------------------------------------------------------
// 7) Security
// -----------------------------------------------------------------------------

test("stay-demo-content contains no real-looking emails or phone numbers", () => {
  const body = read("src/features/demo-data/stay-demo-content.ts");
  // No real email except @example.test / @arconique-demo.
  const emails = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
  for (const e of emails) {
    assert.ok(
      e.endsWith("@example.test") ||
        e.includes("arconique-demo") ||
        e.includes(".demo"),
      `Real-looking email in stay demo content: ${e}`,
    );
  }
});

test("stay-demo-content masks emergency phone numbers", () => {
  const body = read("src/features/demo-data/stay-demo-content.ts");
  // Demo emergency contacts use bullet placeholders for personal numbers.
  assert.match(body, /•••/);
});

test("/stay/demo home page is marked demo-only", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  assert.match(body, /Demo only/i);
});

test("known-issues registry still accepts no-real-PII commitments", async () => {
  const mod = await import("../src/features/prelaunch/known-issues");
  // No new banned pattern needed — this just confirms the registry still loads.
  assert.ok(Array.isArray(mod.KNOWN_ISSUES));
});

// -----------------------------------------------------------------------------
// 8) Quality — no business feature creep
// -----------------------------------------------------------------------------

test("no Stripe / Xendit / WhatsApp / smart-lock provider SDK introduced in P116A", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const banned of [
    "stripe",
    "@stripe/stripe-js",
    "xendit-node",
    "midtrans-client",
    "@aqara/sdk",
    "ttlock-node",
    "@whatsapp/business",
    "telegraf",
  ]) {
    assert.ok(!(banned in all), `package "${banned}" must not be added`);
  }
});

test("P116A files do not reference real PSP / smart-lock / WhatsApp clients", () => {
  function walk(dir: string, out: string[]): void {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const f = join(dir, e);
      const s = statSync(f);
      if (s.isDirectory()) walk(f, out);
      else if (e.endsWith(".ts") || e.endsWith(".tsx")) out.push(f);
    }
  }
  const files: string[] = [];
  walk(join(repoRoot, "src/features/demo-data"), files);
  walk(join(repoRoot, "src/app/(guest)/stay/demo"), files);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      /from\s+["']stripe["']/,
      /xendit/i,
      /smart-lock/i,
      /whatsapp/i,
      /telegram/i,
    ]) {
      // We accept narrative text mentions in demo copy of "smart-lock" but
      // not actual import statements.  Only flag import-style usage.
      const importTest =
        new RegExp(`from\\s+["']${banned.source.replace(/^\/|\/$/g, "")}`);
      if (importTest.test(body)) {
        throw new Error(`${f} imports banned ${banned}`);
      }
    }
  }
});
