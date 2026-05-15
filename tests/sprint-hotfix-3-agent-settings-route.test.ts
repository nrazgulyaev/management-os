/**
 * Hotfix HF-3 — AI agent settings route regression.
 *
 * Background: production /dashboard/settings/ai-agents/<agent_key>
 * was 404'ing for the 5 new Sprint MD-5 agents (investor_copilot,
 * front_office_copilot, housekeeping_scheduler, concierge_handoff,
 * security_copilot). Root cause was the hardcoded CONFIGURABLE_AGENTS
 * allowlist in src/features/ai-agents/agent-config-keys.ts being
 * out of sync with the MD-5 migrations 0098–0102 that seeded those
 * agents into agent_configurations.
 *
 * These regression tests pin the invariant: every agent_key listed
 * in the org_ai_agent_config CHECK constraint (union of 0090 + later
 * widening migrations) MUST resolve through the settings detail
 * page without 404, and the page MUST handle truly unknown keys
 * gracefully (EmptyState, not notFound).
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

const MD5_AGENTS = [
  "investor_copilot",
  "front_office_copilot",
  "housekeeping_scheduler",
  "concierge_handoff",
  "security_copilot",
] as const;

test("HF-3: all 5 MD-5 cabinet agents present in CONFIGURABLE_AGENTS", () => {
  for (const k of MD5_AGENTS) {
    assert.ok(
      (CONFIGURABLE_AGENTS as readonly string[]).includes(k),
      `${k} missing from CONFIGURABLE_AGENTS — settings detail page will 404`,
    );
  }
});

test("HF-3: every MD-5 agent has a complete AGENT_CATALOG entry", () => {
  for (const k of MD5_AGENTS) {
    const desc = AGENT_CATALOG[k];
    assert.ok(desc, `AGENT_CATALOG missing entry for ${k}`);
    assert.ok(desc.label.length > 0, `${k}: label required`);
    assert.ok(
      desc.blurb.length > 30,
      `${k}: blurb too short — must be operator-meaningful`,
    );
    assert.ok(
      [1, 2, 3].includes(desc.tier),
      `${k}: tier must be 1, 2, or 3`,
    );
    assert.ok(
      ["agent", "system"].includes(desc.category),
      `${k}: category must be "agent" or "system"`,
    );
  }
});

test("HF-3: org_ai_agent_config CHECK constraint widened for MD-5 agents (migration 0103)", () => {
  const path = "drizzle/0103_md_5_org_agent_config_widen_check.sql";
  assert.ok(
    exists(path),
    "Hotfix HF-3 migration 0103 must exist to widen the agent_key CHECK constraint",
  );
  const src = read(path);
  // Drop + add pattern.
  assert.match(src, /DROP CONSTRAINT IF EXISTS "org_ai_agent_config_agent_key_check"/);
  assert.match(src, /ADD CONSTRAINT "org_ai_agent_config_agent_key_check"/);
  // BEGIN/COMMIT wrapper.
  assert.match(src, /^BEGIN;$/m);
  assert.match(src, /^COMMIT;$/m);
  // All 14 agents present in the new CHECK list.
  for (const k of CONFIGURABLE_AGENTS) {
    assert.ok(
      src.includes(`'${k}'`),
      `migration 0103 CHECK list must include ${k}`,
    );
  }
});

test("HF-3: settings detail page renders gracefully for unknown agent_key (no bare notFound)", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx",
  );
  // Must check the CONFIGURABLE_AGENTS allowlist.
  assert.match(src, /CONFIGURABLE_AGENTS\.includes/);
  // Must surface an EmptyState (not a bare 404) for unknown keys.
  assert.match(src, /EmptyState/);
  assert.match(src, /No agent registered with key/);
  // Must NOT import notFound — the page now renders an in-page
  // fallback instead.
  assert.doesNotMatch(src, /import\s+\{[^}]*\bnotFound\b[^}]*\}\s+from\s+"next\/navigation"/);
  // Must offer a back-link to the list page.
  assert.match(src, /\/dashboard\/settings\/ai-agents/);
});

test("HF-3: settings list page iterates CONFIGURABLE_AGENTS (auto-picks up new agents)", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/settings/ai-agents/page.tsx",
  );
  // Either iterates the const directly or pulls from AGENT_CATALOG.
  assert.ok(
    /CONFIGURABLE_AGENTS/.test(src) || /AGENT_CATALOG/.test(src),
    "list page must source agents from the canonical catalog so new entries appear automatically",
  );
});

test("HF-3: every agent_configurations seed migration matches an AGENT_CATALOG entry", () => {
  // MD-5 seeds: 0098–0102. Each row's `agent_type` value must
  // correspond to a key in CONFIGURABLE_AGENTS, otherwise enabling
  // it from the per-org UI would INSERT-fail against the widened
  // org_ai_agent_config.agent_key CHECK.
  const seeds: Array<[string, (typeof MD5_AGENTS)[number]]> = [
    ["drizzle/0098_md_5_investor_copilot.sql", "investor_copilot"],
    ["drizzle/0099_md_5_front_office_copilot.sql", "front_office_copilot"],
    ["drizzle/0100_md_5_housekeeping_scheduler.sql", "housekeeping_scheduler"],
    ["drizzle/0101_md_5_concierge_handoff.sql", "concierge_handoff"],
    ["drizzle/0102_md_5_security_copilot.sql", "security_copilot"],
  ];
  for (const [path, agentKey] of seeds) {
    assert.ok(exists(path), `seed migration missing: ${path}`);
    const src = read(path);
    assert.ok(
      src.includes(`'${agentKey}'`),
      `${path} must seed agent_type='${agentKey}'`,
    );
    assert.ok(
      (CONFIGURABLE_AGENTS as readonly string[]).includes(agentKey),
      `${agentKey} seeded by ${path} but missing from CONFIGURABLE_AGENTS`,
    );
  }
});
