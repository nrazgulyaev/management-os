/**
 * Prompt 115 — Management OS Final Pre-Launch Polish & Scope Freeze tests.
 *
 * Covers:
 *   - The seven new docs exist and have the expected sections.
 *   - Scope freeze explicitly excludes the right items.
 *   - Product map covers every major module.
 *   - Role matrix covers all formal roles.
 *   - Route map mentions admin / owner / guest / field / vendor / cron.
 *   - Launch readiness has demo / staging / production-conditional rows.
 *   - Backlog has P0 / P1 / P2 / P3 sections + the right items.
 *   - `src/features/prelaunch/known-issues.ts` exists; every entry has
 *     severity / status / target; no blocker is `accepted` without notes.
 *   - Demo dashboard polish: v1 status / recommended flow / stubbed limits.
 *   - Stakeholder surface polish: owner revenue mentions statement
 *     canonicality; owner calendar / bookings include direct vs OTA copy;
 *     stay/demo + hold status include demo/stub clarity; vendor portal
 *     includes guest-contact-hidden copy.
 *   - No business feature creep: no Stripe / Xendit SDK / smart-lock
 *     provider / WhatsApp client / AI write tool implementation in P115
 *     changes.
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
// 1) Docs exist
// -----------------------------------------------------------------------------

test("P115 docs exist", () => {
  for (const f of [
    "docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md",
    "docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md",
    "docs/MANAGEMENT_OS_ROLE_SURFACE_MATRIX.md",
    "docs/MANAGEMENT_OS_ROUTE_MAP.md",
    "docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md",
    "docs/MANAGEMENT_OS_POST_V1_BACKLOG.md",
    "docs/ADR-0038-MANAGEMENT_OS_V1_SCOPE_FREEZE.md",
  ]) {
    assert.ok(existsSync(join(repoRoot, f)), `${f} should exist`);
  }
});

// -----------------------------------------------------------------------------
// 2) Scope freeze
// -----------------------------------------------------------------------------

test("scope freeze covers included / excluded / stubs / blockers / post-v1", () => {
  const body = read("docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md");
  for (const heading of [
    "Included in v1",
    "Explicitly excluded from v1",
    "Stubs included in v1",
    "Security baseline included",
    "Deployment readiness included",
    "v1 blocker",
    "post-v1",
  ]) {
    assert.match(body, new RegExp(heading, "i"), `mentions ${heading}`);
  }
});

test("scope freeze explicitly excludes risky integrations", () => {
  const body = read("docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md");
  for (const tok of [
    /real PSP/i,
    /smart.?lock/i,
    /WhatsApp/i,
    /Telegram/i,
    /AI write tools?/i,
    /OTA write/i,
    /WebAuthn/i,
  ]) {
    assert.match(body, tok);
  }
});

// -----------------------------------------------------------------------------
// 3) Product map
// -----------------------------------------------------------------------------

test("product map includes all major modules", () => {
  const body = read("docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md");
  for (const m of [
    "Admin dashboard",
    "Owner portal",
    "Guest stay portal",
    "Direct booking flow",
    "Field app",
    "Vendor portal",
    "Finance engine",
    "Owner statements",
    "Operations runtime",
    "Maintenance intelligence",
    "Inventory",
    "Procurement",
    "Guest services",
    "Dynamic pricing",
    "Integrations",
    "Notifications",
    "AI Operations Co-pilot",
    "Guest AI Concierge",
    "Security",
    "Jobs / cron",
    "Deployment readiness",
  ]) {
    assert.ok(body.includes(m), `product map mentions ${m}`);
  }
});

test("product map describes purpose / routes / status / limitations per module", () => {
  const body = read("docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md");
  // Loose checks: each module section ought to use these labels.
  for (const tok of [
    /Purpose:/,
    /Key routes:/,
    /Primary roles:/,
    /Status:/,
    /Known limitations|Post-v1/i,
  ]) {
    assert.match(body, tok);
  }
});

// -----------------------------------------------------------------------------
// 4) Role matrix
// -----------------------------------------------------------------------------

test("role matrix includes all formal roles", () => {
  const body = read("docs/MANAGEMENT_OS_ROLE_SURFACE_MATRIX.md");
  for (const role of [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "booking_manager",
    "revenue_manager",
    "finance_manager",
    "accountant",
    "concierge",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
    "security",
    "procurement_manager",
    "investor_owner",
    "investor_viewer",
    "owner_delegate",
  ]) {
    assert.ok(body.includes(role), `role matrix mentions ${role}`);
  }
});

test("role matrix has owner / guest / vendor / field privacy notes", () => {
  const body = read("docs/MANAGEMENT_OS_ROLE_SURFACE_MATRIX.md");
  assert.match(body, /token-scoped/i);
  assert.match(body, /Privacy/i);
  assert.match(body, /Cannot see/i);
});

// -----------------------------------------------------------------------------
// 5) Route map
// -----------------------------------------------------------------------------

test("route map includes admin, owner, stay, field, vendor, cron, api", () => {
  const body = read("docs/MANAGEMENT_OS_ROUTE_MAP.md");
  for (const tok of [
    /\/dashboard/,
    /\/owner/,
    /\/stay/,
    /\/field/,
    /\/vendor/,
    /\/api\/cron/,
    /\/api\/v1/,
  ]) {
    assert.match(body, tok);
  }
});

test("route map generator script exists and is wired", () => {
  assert.ok(
    existsSync(join(repoRoot, "scripts/generate-route-map-doc.ts")),
  );
  const pkg = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.ok(pkg.scripts?.["docs:route-map"]);
});

// -----------------------------------------------------------------------------
// 6) Launch readiness summary
// -----------------------------------------------------------------------------

test("launch readiness summary has demo / staging / production-conditional", () => {
  const body = read("docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md");
  assert.match(body, /Demo-ready/i);
  assert.match(body, /Staging-ready/i);
  assert.match(body, /Production-ready/i);
  assert.match(body, /conditional/i);
});

test("launch readiness summary has go/no-go criteria", () => {
  const body = read("docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md");
  assert.match(body, /Go ?\/ ?no-go/i);
  assert.match(body, /CRON_SECRET/);
  assert.match(body, /preflight:deploy/);
});

test("launch readiness summary lists accepted limitations", () => {
  const body = read("docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md");
  for (const tok of [
    /No real PSP/i,
    /smart.?lock/i,
    /Channel push/i,
    /WhatsApp|Telegram/i,
    /English-only|i18n/i,
  ]) {
    assert.match(body, tok);
  }
});

// -----------------------------------------------------------------------------
// 7) Backlog
// -----------------------------------------------------------------------------

test("post-v1 backlog has P0 / P1 / P2 / P3 sections", () => {
  const body = read("docs/MANAGEMENT_OS_POST_V1_BACKLOG.md");
  assert.match(body, /^## P0/m);
  assert.match(body, /^## P1/m);
  assert.match(body, /^## P2/m);
  assert.match(body, /^## P3/m);
});

test("post-v1 backlog mentions canonical post-v1 items", () => {
  const body = read("docs/MANAGEMENT_OS_POST_V1_BACKLOG.md");
  for (const tok of [
    /payment provider/i,
    /smart.?lock/i,
    /OTA write/i,
    /i18n/i,
    /PWA/i,
    /SIEM|Sentry|Logtail/i,
  ]) {
    assert.match(body, tok);
  }
});

// -----------------------------------------------------------------------------
// 8) Known issues registry
// -----------------------------------------------------------------------------

test("src/features/prelaunch/known-issues.ts exists + exports KNOWN_ISSUES", async () => {
  const f = "src/features/prelaunch/known-issues.ts";
  assert.ok(existsSync(join(repoRoot, f)));
  const mod = await import("../src/features/prelaunch/known-issues");
  assert.ok(Array.isArray(mod.KNOWN_ISSUES));
  assert.ok(mod.KNOWN_ISSUES.length >= 10);
});

test("every known issue has severity / status / target / notes", async () => {
  const mod = await import("../src/features/prelaunch/known-issues");
  for (const i of mod.KNOWN_ISSUES) {
    assert.ok(["blocker", "important", "minor", "accepted"].includes(i.severity), `${i.id} severity`);
    assert.ok(["fixed", "accepted", "deferred"].includes(i.status), `${i.id} status`);
    assert.ok(["v1", "post_v1", "v2"].includes(i.target), `${i.id} target`);
    assert.ok(i.notes && i.notes.length > 10, `${i.id} notes`);
  }
});

test("no blocker issue is accepted without notes", async () => {
  const mod = await import("../src/features/prelaunch/known-issues");
  for (const i of mod.KNOWN_ISSUES) {
    if (i.severity === "blocker" && i.status === "accepted") {
      assert.ok(
        i.notes && i.notes.length > 30,
        `${i.id} blocker accepted without explanatory notes`,
      );
    }
  }
});

test("known issues summarisers are pure and consistent", async () => {
  const mod = await import("../src/features/prelaunch/known-issues");
  const s = mod.summariseKnownIssues();
  assert.equal(s.total, mod.KNOWN_ISSUES.length);
  const total =
    s.byStatus.fixed + s.byStatus.accepted + s.byStatus.deferred;
  assert.equal(total, s.total);
});

// -----------------------------------------------------------------------------
// 9) Demo dashboard polish
// -----------------------------------------------------------------------------

test("dashboard/demo includes v1 status, recommended flow, stubbed limits", () => {
  const body = read(
    "src/app/(dashboard)/dashboard/demo/page.tsx",
  );
  assert.match(body, /Management OS v1/i);
  assert.match(body, /Recommended/i);
  assert.match(body, /Do not demo/i);
  assert.match(body, /KNOWN_ISSUES|known-issues/);
  assert.match(body, /MANAGEMENT_OS_V1_PRODUCT_MAP|product map/i);
});

// -----------------------------------------------------------------------------
// 10) Stakeholder surface polish
// -----------------------------------------------------------------------------

test("owner revenue page mentions statement canonicality", () => {
  const body = read("src/app/(owner)/owner/revenue/page.tsx");
  assert.match(body, /canonical|legal|accounting record/i);
  assert.match(body, /IDR|currency/i);
});

test("owner calendar page has direct vs OTA legend explanation", () => {
  const body = read("src/app/(owner)/owner/calendar/page.tsx");
  assert.match(body, /Direct booking/);
  assert.match(body, /OTA/);
  assert.match(body, /Owner stay/);
});

test("owner bookings page distinguishes direct vs OTA vs owner", () => {
  const body = read("src/app/(owner)/owner/bookings/page.tsx");
  assert.match(body, /direct/i);
  assert.match(body, /OTA/);
  assert.match(body, /owner/i);
});

test("owner statement detail page surfaces canonicality copy", () => {
  const body = read("src/app/(owner)/owner/statements/[id]/page.tsx");
  assert.match(body, /canonical|accounting record|issued and approved/i);
});

test("stay/demo includes demo-only banner", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  assert.match(body, /[Dd]emo only/);
  assert.match(body, /\/stay\/\[token\]/);
});

test("hold status page clarifies no payment + review copy", () => {
  const body = read(
    "src/app/(public)/book/hold/[token]/status/page.tsx",
  );
  assert.match(body, /being reviewed/i);
  assert.match(body, /No payment|secure link/i);
});

test("vendor portal includes guest-contact-hidden copy", () => {
  const body = read(
    "src/app/(vendor)/vendor/service/[token]/page.tsx",
  );
  assert.match(body, /Privacy/i);
  assert.match(body, /guest contact|hidden|explicitly shared/i);
});

test("field app home explains assigned villa / priority / checklist", () => {
  const body = read("src/app/(field)/field/page.tsx");
  assert.match(body, /assigned villa|priority|checklist/i);
});

test("system/health page summarises critical modules with module guidance", () => {
  const body = read(
    "src/app/(dashboard)/dashboard/system/health/page.tsx",
  );
  assert.match(body, /All critical modules|migration pending/i);
});

test("system/deployment page surfaces a go/no-go banner", () => {
  const body = read(
    "src/app/(dashboard)/dashboard/system/deployment/page.tsx",
  );
  assert.match(body, /Go for staging|No-go/i);
});

// -----------------------------------------------------------------------------
// 11) No business feature creep
// -----------------------------------------------------------------------------

test("no Stripe / Xendit / WhatsApp / smart-lock provider SDK introduced", () => {
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
    "twilio-conversations",
    "telegraf",
  ]) {
    assert.ok(!(banned in all), `package "${banned}" must not be added in v1`);
  }
});

test("no AI write-tool implementation referenced (read-only AI in v1)", () => {
  // A heuristic source-grep across the AI feature dirs.  If a future
  // change adds write tools, it should also update this test list.
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
  walk(join(repoRoot, "src/features/ai"), files);
  walk(join(repoRoot, "src/features/guest-ai-concierge"), files);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    // We tolerate imports of `tool` types but flag any *implementation*
    // of a write-shaped action: function names ending in `WriteTool`,
    // `executeMutationTool`, `applyAiAction`, etc.
    for (const banned of [
      /executeMutationTool/,
      /applyAiAction/,
      /aiWriteTool/i,
    ]) {
      if (banned.test(body)) {
        throw new Error(
          `Banned AI write-tool pattern ${banned} found in ${f}`,
        );
      }
    }
  }
});

test("README mentions Management OS v1 status section", () => {
  const body = read("README.md");
  assert.match(body, /Management OS v1 status/i);
  assert.match(body, /MANAGEMENT_OS_V1_PRODUCT_MAP|product map/i);
  assert.match(body, /MANAGEMENT_OS_V1_SCOPE_FREEZE|scope freeze/i);
});
