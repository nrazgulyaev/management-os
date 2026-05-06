/**
 * Stage 2.2.A regression — contacts foundation, lead pipeline, AI Sales Assistant.
 *
 * Pure-function tests: schema shapes, AI parser, navigation invariants,
 * migration corpus checks. No DB or network required.
 *
 * Following the existing repo convention: tests do NOT import any module
 * that carries `import "server-only"`. The AI provider abstraction and the
 * sales-assistant agent are server-only modules and are exercised through
 * their pure helpers (sales-assistant-parser, leads-constants).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// -----------------------------------------------------------------------------
// Migration 0035 — schema sanity
// -----------------------------------------------------------------------------

test("0035 migration creates the five 2.2.A tables", () => {
  const path = resolve(
    process.cwd(),
    "drizzle/0035_development_os_stage_2_2_a.sql",
  );
  assert.ok(existsSync(path), "Migration 0035 must exist");
  const sql = readFileSync(path, "utf8");
  for (const tbl of [
    "contacts",
    "agents",
    "lead_sources",
    "contact_roles",
    "contact_interactions",
  ]) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS "${tbl}"`),
      `0035 must create table ${tbl}`,
    );
  }
});

test("0035 enables and forces RLS on every new table", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0035_development_os_stage_2_2_a.sql"),
    "utf8",
  );
  for (const tbl of [
    "contacts",
    "agents",
    "lead_sources",
    "contact_roles",
    "contact_interactions",
  ]) {
    assert.ok(sql.includes(`'${tbl}'`), `RLS loop must reference ${tbl}`);
  }
  assert.ok(
    sql.includes("ENABLE ROW LEVEL SECURITY"),
    "0035 must call ENABLE ROW LEVEL SECURITY",
  );
  assert.ok(
    sql.includes("FORCE ROW LEVEL SECURITY"),
    "0035 must call FORCE ROW LEVEL SECURITY",
  );
  assert.ok(
    sql.includes("public.is_internal_user()"),
    "0035 RLS policies must gate on public.is_internal_user()",
  );
});

test("0035 backfills land_plots.owner_contact_name into contacts", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0035_development_os_stage_2_2_a.sql"),
    "utf8",
  );
  assert.ok(
    sql.includes('ADD COLUMN IF NOT EXISTS "owner_contact_id"'),
    "Must add owner_contact_id column on land_plots",
  );
  assert.ok(
    sql.includes('INSERT INTO "contacts"'),
    "Must insert into contacts during backfill",
  );
  assert.ok(
    sql.includes('INSERT INTO "contact_roles"'),
    "Must insert landowner roles during backfill",
  );
  assert.ok(
    sql.includes("'landowner'"),
    "Backfill must use the landowner role kind",
  );
  assert.ok(
    sql.includes("DEPRECATED"),
    "owner_contact_name column must be marked deprecated via comment",
  );
});

test("0035 wraps everything in a single transaction", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/0035_development_os_stage_2_2_a.sql"),
    "utf8",
  );
  assert.ok(sql.includes("BEGIN;"), "Must wrap in BEGIN");
  assert.ok(sql.includes("COMMIT;"), "Must end with COMMIT");
});

// -----------------------------------------------------------------------------
// LEAD_STATUSES contract — pure module, safe to import in node:test
// -----------------------------------------------------------------------------

test("LEAD_STATUSES covers the documented pipeline", async () => {
  const { LEAD_STATUSES, LEAD_STATUS_LABEL } = await import(
    "../src/lib/development/server/leads-constants"
  );
  for (const expected of [
    "new",
    "contacted",
    "qualified",
    "viewing_scheduled",
    "viewing_completed",
    "negotiation",
    "reservation",
    "contract_pending",
    "contract_signed",
    "lost",
    "cold",
  ]) {
    assert.ok(
      (LEAD_STATUSES as readonly string[]).includes(expected),
      `LEAD_STATUSES must include ${expected}`,
    );
    assert.ok(
      typeof LEAD_STATUS_LABEL[expected as keyof typeof LEAD_STATUS_LABEL] === "string",
      `LEAD_STATUS_LABEL must label ${expected}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Sales Assistant parser — pure, no provider dependency
// -----------------------------------------------------------------------------

test("parseLeadWelcomeDraft accepts a clean JSON payload", async () => {
  const { parseLeadWelcomeDraft } = await import(
    "../src/lib/ai/agents/sales-assistant-parser"
  );
  const draft = parseLeadWelcomeDraft(
    JSON.stringify({
      subject: "Welcome to Eternal Villas",
      body:
        "Hello Wei, thank you for reaching out. We have a small selection of 4-bedroom oceanview residences and would love to share what's currently available.",
      qualification: "warm",
      qualificationReasoning:
        "Inbound from Meta carousel with explicit unit-type interest; no budget signal yet.",
      followUp: {
        channel: "whatsapp",
        etaHours: 6,
        reasoning: "Wei prefers WhatsApp; same-day response keeps momentum.",
      },
      language: "en",
    }),
  );
  assert.ok(draft, "Should parse a valid response");
  assert.equal(draft!.qualification, "warm");
  assert.equal(draft!.followUp.channel, "whatsapp");
  assert.equal(draft!.followUp.etaHours, 6);
});

test("parseLeadWelcomeDraft strips ```json fences", async () => {
  const { parseLeadWelcomeDraft } = await import(
    "../src/lib/ai/agents/sales-assistant-parser"
  );
  const fenced =
    "```json\n" +
    JSON.stringify({
      subject: "Hello",
      body: "Body",
      qualification: "cold",
      qualificationReasoning: "No signals.",
      followUp: { channel: "email", etaHours: 24, reasoning: "Slow." },
      language: "en",
    }) +
    "\n```";
  const draft = parseLeadWelcomeDraft(fenced);
  assert.ok(draft, "Should parse a fenced response");
  assert.equal(draft!.qualification, "cold");
});

test("parseLeadWelcomeDraft returns null on garbage", async () => {
  const { parseLeadWelcomeDraft } = await import(
    "../src/lib/ai/agents/sales-assistant-parser"
  );
  assert.equal(parseLeadWelcomeDraft("not json at all"), null);
  assert.equal(
    parseLeadWelcomeDraft(JSON.stringify({ subject: "x" })),
    null,
    "Missing required fields → null",
  );
  assert.equal(
    parseLeadWelcomeDraft(
      JSON.stringify({
        subject: "x",
        body: "y",
        qualification: "screaming-hot",
        qualificationReasoning: "z",
        followUp: { channel: "carrier-pigeon", etaHours: 1, reasoning: "" },
        language: "en",
      }),
    ),
    null,
    "Invalid enum values → null",
  );
});

// -----------------------------------------------------------------------------
// Sales Assistant + provider — static-source invariants
// -----------------------------------------------------------------------------

test("Sales Assistant calls only the AI provider — no direct fetch / SDK", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/ai/agents/sales-assistant.ts"),
    "utf8",
  );
  assert.ok(
    !src.includes("fetch("),
    "sales-assistant must call providers, not fetch directly",
  );
  assert.ok(
    !src.includes("@anthropic-ai/sdk"),
    "sales-assistant must not import the Anthropic SDK directly",
  );
  assert.ok(
    src.includes("getAIProvider"),
    "sales-assistant must obtain its provider via getAIProvider()",
  );
});

test("AnthropicProvider source reuses the existing fetch pattern, no SDK import", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/ai/providers/anthropic.ts"),
    "utf8",
  );
  // No actual import / require of the SDK package. Comments mentioning the
  // package name as part of explaining the design choice are fine.
  assert.ok(
    !/from\s+['"]@anthropic-ai\/sdk['"]/.test(src),
    "Anthropic provider must not import from @anthropic-ai/sdk",
  );
  assert.ok(
    !/require\(['"]@anthropic-ai\/sdk['"]\)/.test(src),
    "Anthropic provider must not require @anthropic-ai/sdk",
  );
  assert.ok(
    src.includes("api.anthropic.com/v1/messages"),
    "Anthropic provider must hit api.anthropic.com directly",
  );
  assert.ok(
    src.includes("isAiConfigured()") && src.includes("isAiDryRun()"),
    "Anthropic provider must respect existing AI env helpers",
  );
});

test("AI provider types module defines the abstract interface", async () => {
  // types.ts is pure — safe to import in node:test.
  const types = await import("../src/lib/ai/providers/types");
  assert.equal(typeof types.AIProviderError, "function");
  assert.equal(typeof types.AIProviderUnavailableError, "function");
});

test("Lead create action persists AI drafts as review_status='pending'", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/lead-actions.ts"),
    "utf8",
  );
  assert.ok(
    src.includes('reviewStatus: "pending"'),
    "AI draft inserts must use review_status='pending'",
  );
  assert.ok(
    !src.includes('reviewStatus: "sent"'),
    "Lead create path must never send (review_status='sent')",
  );
  assert.ok(
    !src.includes('reviewStatus: "approved"'),
    "Lead create path must never auto-approve",
  );
});

// -----------------------------------------------------------------------------
// Workspace separation — Stage 1 invariants must still hold after 2.2.A
// -----------------------------------------------------------------------------

test("dashboardNav still has zero /development-os/* routes after 2.2.A", async () => {
  const { dashboardNav } = await import("../src/config/navigation");
  for (const group of dashboardNav) {
    for (const item of group.items) {
      assert.ok(
        !item.href.startsWith("/development-os"),
        `Management OS sidebar leaked Development OS route after 2.2.A: ${item.href}`,
      );
    }
  }
});

test("developmentAppNav Sales entry no longer carries the 2.2 badge", async () => {
  const { developmentAppNav } = await import(
    "../src/lib/development/navigation"
  );
  const sales = developmentAppNav
    .flatMap((g) => g.items)
    .find((i) => i.href === "/development-os/sales");
  assert.ok(sales, "developmentAppNav must still have /development-os/sales");
  assert.equal(
    sales!.badge,
    undefined,
    "Sales is now live — should not carry the 2.2 stage badge",
  );
});

test("Sales workspace pages exist at the documented routes", () => {
  const root = resolve(
    process.cwd(),
    "src/app/(development-app)/development-os",
  );
  for (const p of ["sales/page.tsx", "sales/[contactRoleId]/page.tsx"]) {
    assert.ok(
      existsSync(resolve(root, p)),
      `Stage 2.2.A page must exist: ${p}`,
    );
  }
});

// -----------------------------------------------------------------------------
// No new dependency added
// -----------------------------------------------------------------------------

test("Stage 2.2.A added zero new top-level dependencies", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  );
  assert.equal(
    pkg.dependencies?.["@anthropic-ai/sdk"],
    undefined,
    "Stage 2.2.A must NOT add @anthropic-ai/sdk; we reuse the existing fetch-based Anthropic client.",
  );
  assert.equal(
    pkg.dependencies?.openai,
    undefined,
    "openai SDK must not be installed",
  );
});

test("Schema index re-exports Stage 2.2.A entities", async () => {
  const idx = await import("../src/lib/db/schema/contacts");
  for (const key of [
    "contacts",
    "agents",
    "leadSources",
    "contactRoles",
    "contactInteractions",
  ]) {
    assert.ok(key in idx, `Schema must export ${key}`);
  }
});
