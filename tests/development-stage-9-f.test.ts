/**
 * Stage 9.F — Per-tenant AI agent configuration UI acceptance tests.
 *
 * Static / file-presence tests cover the migration shape, schema TS,
 * server actions, page surfaces, and the cross-links. The DB-bound
 * invariants for org_ai_agent_config are at
 * `tests/invariants/org-ai-agent-config.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENT_CATALOG,
  CONFIGURABLE_AGENTS,
} from "../src/features/ai-agents/agent-config-keys";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ============================================================================
// Migration + schema
// ============================================================================

test("9.F migration 0090 ships org_ai_agent_config table + RLS policies", () => {
  const path = "drizzle/0090_org_ai_agent_config.sql";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /CREATE TABLE IF NOT EXISTS "org_ai_agent_config"/);
  assert.match(
    src,
    /"agent_key"\s+text\s+NOT\s+NULL\s+CHECK\s+\(agent_key\s+IN\s+\(/i,
  );
  // Every CONFIGURABLE_AGENTS key must appear in the latest agent_key
  // CHECK constraint. Sprint MD-5 added 5 new agents via Hotfix HF-3
  // migration 0103 (DROP + ADD CONSTRAINT), so union the SQL from
  // 0090's initial CHECK with any later widening migrations.
  const widening = "drizzle/0103_md_5_org_agent_config_widen_check.sql";
  const combined = src + (exists(widening) ? "\n" + read(widening) : "");
  for (const k of CONFIGURABLE_AGENTS) {
    assert.ok(
      combined.includes(`'${k}'`),
      `agent_key CHECK constraint (0090 + later wideners) must include ${k}`,
    );
  }
  // Unique (org, agent_key).
  assert.match(src, /UNIQUE\s*\("organization_id",\s*"agent_key"\)/i);
  // RLS enabled + forced + two policies.
  assert.match(src, /ENABLE ROW LEVEL SECURITY/);
  assert.match(src, /FORCE ROW LEVEL SECURITY/);
  assert.match(src, /org_ai_agent_config_org_isolation/);
  assert.match(src, /org_ai_agent_config_internal_bypass/);
  // BEGIN/COMMIT wrapper.
  assert.match(src, /^BEGIN;$/m);
  assert.match(src, /^COMMIT;$/m);
});

test("9.F Drizzle schema mirrors the migration shape", () => {
  const path = "src/lib/db/schema/org-ai-agent-config.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export const orgAiAgentConfig = pgTable\(\s*"org_ai_agent_config"/);
  assert.match(src, /unique\("org_ai_agent_config_org_agent_uniq"\)/);
});

// ============================================================================
// Constants + catalog
// ============================================================================

test("9.F: CONFIGURABLE_AGENTS exports the expected agent keys (matches migration CHECK)", () => {
  // 9 Stage-9.F originals + 5 Sprint MD-5 cabinet co-pilots
  // (widened by Hotfix HF-3 migration 0103).
  const expected = [
    "qs_cost_analyst",
    "procurement_analyst",
    "tax_assistant",
    "marketing_assistant",
    "executive_business",
    "daily_digest",
    "weekly_plan",
    "inbox",
    "memory",
    "investor_copilot",
    "front_office_copilot",
    "housekeeping_scheduler",
    "concierge_handoff",
    "security_copilot",
  ].sort();
  assert.strictEqual(
    CONFIGURABLE_AGENTS.length,
    expected.length,
    `Expected ${expected.length} configurable agents, got ${CONFIGURABLE_AGENTS.length}`,
  );
  assert.deepStrictEqual([...CONFIGURABLE_AGENTS].sort(), expected);
});

test("9.F: AGENT_CATALOG covers every key with tier 1/2/3 + a meaningful blurb", () => {
  for (const k of CONFIGURABLE_AGENTS) {
    const desc = AGENT_CATALOG[k];
    assert.ok(desc, `missing description for ${k}`);
    assert.ok(
      [1, 2, 3].includes(desc.tier),
      `${k}: tier must be 1, 2, or 3 (got ${desc.tier})`,
    );
    assert.ok(desc.label.length > 0, `${k}: label required`);
    assert.ok(
      desc.blurb.length > 30,
      `${k}: blurb too short — must be operator-meaningful`,
    );
    assert.ok(
      ["agent", "system"].includes(desc.category),
      `${k}: category must be "agent" or "system"`,
    );
  }
});

test("9.F: agent tier classification matches tier-rules.ts AGENT_TIER_MAP", () => {
  const tierRulesSrc = read("src/lib/ai/router/tier-rules.ts");
  // Spot-check a few high-tier agents — if a future commit drifts the
  // tier-rules table without updating AGENT_CATALOG, this catches it.
  for (const k of ["qs_cost_analyst", "tax_assistant", "executive_business", "procurement_analyst"]) {
    assert.match(
      tierRulesSrc,
      new RegExp(`${k}:\\s*3\\b`),
      `${k} should be Tier 3 in tier-rules.ts`,
    );
    assert.strictEqual(AGENT_CATALOG[k as keyof typeof AGENT_CATALOG].tier, 3);
  }
  for (const k of ["daily_digest", "weekly_plan", "marketing_assistant"]) {
    assert.match(
      tierRulesSrc,
      new RegExp(`${k}:\\s*2\\b`),
      `${k} should be Tier 2 in tier-rules.ts`,
    );
    assert.strictEqual(AGENT_CATALOG[k as keyof typeof AGENT_CATALOG].tier, 2);
  }
});

// ============================================================================
// Server actions
// ============================================================================

test("9.F: agent-config-actions.ts exports the three required actions", () => {
  const path = "src/features/ai-agents/agent-config-actions.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function getAgentEligibility\b/);
  assert.match(src, /export async function setAgentEnabledAction\b/);
  assert.match(src, /export async function setAgentCustomPromptAction\b/);
});

test("9.F: setAgentEnabledAction + setAgentCustomPromptAction require users.write", () => {
  const src = read("src/features/ai-agents/agent-config-actions.ts");
  const matches = src.match(/requirePermission\("users\.write"\)/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected at least 2 requirePermission gates, found ${matches.length}`,
  );
});

test("9.F: setAgentEnabledAction is idempotent via onConflictDoUpdate", () => {
  const src = read("src/features/ai-agents/agent-config-actions.ts");
  assert.match(src, /\.onConflictDoUpdate\(\{/);
  // Audit-logs both enable + disable distinctly.
  assert.match(src, /"ai\.agent\.enabled"/);
  assert.match(src, /"ai\.agent\.disabled"/);
});

test("9.F: getAgentEligibility composes plan-tier + per-org override", () => {
  const src = read("src/features/ai-agents/agent-config-actions.ts");
  // Plan-tier flag check.
  assert.match(src, /getFeatureForOrg\(/);
  assert.match(src, /'ai\.agents_full'|"ai\.agents_full"/);
  assert.match(src, /'ai\.agents_basic'|"ai\.agents_basic"/);
  // Per-org override read.
  assert.match(src, /\.from\(orgAiAgentConfig\)/);
  // 4 distinct ineligibility reasons + the eligible reason.
  for (const reason of [
    "no_subscription",
    "plan_excludes_agent",
    "disabled_by_org",
    "unknown_agent",
    "plan_allows_and_enabled",
  ]) {
    assert.ok(src.includes(`"${reason}"`), `must surface reason "${reason}"`);
  }
});

test("9.F: setAgentCustomPromptAction normalizes empty string to NULL (clear override)", () => {
  const src = read("src/features/ai-agents/agent-config-actions.ts");
  // Trim + ternary: empty / whitespace-only → null.
  assert.match(
    src,
    /trim\(\)\.length\s*>\s*0\s*\?\s*[\s\S]{0,80}\.trim\(\)\s*:\s*null/,
  );
  // Audit-logs override + reset distinctly.
  assert.match(src, /"ai\.agent\.prompt_overridden"/);
  assert.match(src, /"ai\.agent\.prompt_reset"/);
});

// ============================================================================
// UI surfaces
// ============================================================================

test("9.F: /dashboard/settings/ai-agents list page + toggle button shipped", () => {
  for (const path of [
    "src/app/(dashboard)/dashboard/settings/ai-agents/page.tsx",
    "src/app/(dashboard)/dashboard/settings/ai-agents/toggle-agent-button.tsx",
  ]) {
    assert.ok(exists(path), `missing: ${path}`);
  }
});

test("9.F: list page shows tier + plan eligibility + cross-links to WhatsApp + Memory", () => {
  const src = read("src/app/(dashboard)/dashboard/settings/ai-agents/page.tsx");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  // Reads per-org overrides.
  assert.match(src, /\.from\(orgAiAgentConfig\)/);
  // Surfaces tier badges.
  assert.match(src, /Tier \$\{desc\.tier\}|Tier 1|Tier 2|Tier 3/);
  // Cross-links to existing surfaces.
  assert.match(src, /\/development-os\/settings\/whatsapp/);
  assert.match(src, /\/development-os\/ai-agents\/memory/);
  // Per-agent detail link uses the agent_key segment.
  assert.match(src, /\/dashboard\/settings\/ai-agents\/\$\{r\.agentKey\}/);
});

test("9.F: toggle-agent-button is a client component + posts to setAgentEnabledAction", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/settings/ai-agents/toggle-agent-button.tsx",
  );
  assert.match(src, /^"use client"/m);
  assert.match(src, /setAgentEnabledAction\(/);
});

test("9.F: detail page + custom-prompt form shipped", () => {
  for (const path of [
    "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx",
    "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/custom-prompt-form.tsx",
  ]) {
    assert.ok(exists(path), `missing: ${path}`);
  }
});

test("9.F: detail page surfaces canonical prompt + eligibility + run-link", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx",
  );
  assert.match(src, /Canonical prompt/);
  // Hotfix HF-3 replaced the bare notFound() with a graceful
  // EmptyState fallback for unknown agent_key values.
  assert.match(src, /CONFIGURABLE_AGENTS\.includes/);
  assert.match(src, /No agent registered with key/);
  // Pulls canonical prompt from RUN_NOW_AGENTS.
  assert.match(src, /RUN_NOW_AGENTS/);
  // Reads override row.
  assert.match(src, /\.from\(orgAiAgentConfig\)/);
});

test("9.F: custom-prompt-form posts to setAgentCustomPromptAction + supports reset", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/custom-prompt-form.tsx",
  );
  assert.match(src, /^"use client"/m);
  assert.match(src, /setAgentCustomPromptAction\(/);
  // Reset clears the override (sends customPrompt: null).
  assert.match(src, /customPrompt:\s*null/);
});

// ============================================================================
// Phase 9.F closure
// ============================================================================

test("Phase 9.F: invariant test file shipped", () => {
  assert.ok(exists("tests/invariants/org-ai-agent-config.test.ts"));
});
