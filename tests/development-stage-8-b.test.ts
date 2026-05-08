/**
 * Stage 8.B — AI Agent UX completion acceptance tests.
 *
 * Items covered:
 *   8.B.1 — runAgentAction server action + 7 agent kickoff prompts
 *   8.B.1 — <RunAgentButton> client component
 *   8.B.1 — 7 agent pages wire <RunAgentButton agentKey="..." />
 *   8.B.2 — /ai-agents/inbox empty state has Pick-agent + View-runs CTAs
 *   8.B.3 — /ai-agents/memory empty state has Pick-agent + Configure-job CTAs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RUN_NOW_AGENTS } from "../src/features/ai-agents/run-agent-config";

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

// ===========================================================================
// 8.B.1 — server action + button
// ===========================================================================

test("8.B.1: runAgentAction is exported from server action module", () => {
  const path = "src/features/ai-agents/run-agent-action.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export\s+async\s+function\s+runAgentAction\b/);
  // Validates input via Zod.
  assert.match(src, /z\.object\(/);
  // Goes through the unified aiExecute pipeline.
  assert.match(src, /aiExecute\(/);
  // Persists to agent_outputs so the agent page lists the new run.
  assert.match(src, /\.insert\(agentOutputs\)/);
  // Honors per-org gating + audit.
  assert.match(src, /getCurrentAppUser\(/);
  assert.match(src, /getOrganizationByCode\("ARCONIQUE_DEFAULT"\)/);
});

const EXPECTED_AGENTS = [
  "qs_cost_analyst",
  "procurement_analyst",
  "tax_assistant",
  "marketing_assistant",
  "executive_business",
  "daily_digest",
  "weekly_plan",
];

test("8.B.1: RUN_NOW_AGENTS exports all 7 manual agents with kickoff prompts", () => {
  for (const k of EXPECTED_AGENTS) {
    assert.ok(k in RUN_NOW_AGENTS, `agent ${k} must be in RUN_NOW_AGENTS`);
    const cfg = RUN_NOW_AGENTS[k as keyof typeof RUN_NOW_AGENTS];
    assert.ok(cfg.slug, `${k} must have a slug`);
    assert.ok(cfg.label, `${k} must have a label`);
    assert.ok(cfg.kickoffPrompt.length > 30, `${k} must have a real prompt`);
  }
});

test("8.B.1: <RunAgentButton> client component exists + posts to runAgentAction", () => {
  const path = "src/components/ai-agents/run-agent-button.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export\s+function\s+RunAgentButton\b/);
  assert.match(src, /runAgentAction\(/);
  // Pending + error UX.
  assert.match(src, /useTransition/);
  assert.match(src, /role="alert"/);
});

test("8.B.1: every agent page imports + renders <RunAgentButton>", () => {
  for (const k of EXPECTED_AGENTS) {
    const cfg = RUN_NOW_AGENTS[k as keyof typeof RUN_NOW_AGENTS];
    const path = `src/app/(development-app)/development-os/ai-agents/${cfg.slug}/page.tsx`;
    const src = read(path);
    assert.match(
      src,
      /from\s+["']@\/components\/ai-agents\/run-agent-button["']/,
      `${cfg.slug}: must import RunAgentButton`,
    );
    assert.match(
      src,
      new RegExp(`<RunAgentButton\\s+agentKey="${k}"`),
      `${cfg.slug}: must render <RunAgentButton agentKey="${k}"`,
    );
  }
});

// ===========================================================================
// 8.B.2 — inbox empty-state CTAs
// ===========================================================================

test("8.B.2: /ai-agents/inbox empty state offers Pick-agent + View-runs CTAs", () => {
  const src = read(
    "src/app/(development-app)/development-os/ai-agents/inbox/page.tsx",
  );
  // EmptyState carries an `action` prop (no longer the bare text-only variant).
  assert.match(src, /action=\{/);
  assert.match(src, /Pick an agent to run/);
  assert.match(src, /View past runs/);
  assert.match(src, /\/development-os\/ai-agents\b/);
  assert.match(src, /\/dashboard\/ai\/runs/);
});

// ===========================================================================
// 8.B.3 — memory empty-state CTAs
// ===========================================================================

test("8.B.3: /ai-agents/memory empty state offers Pick-agent + Configure-job CTAs", () => {
  const src = read(
    "src/app/(development-app)/development-os/ai-agents/memory/page.tsx",
  );
  assert.match(src, /action=\{/);
  assert.match(src, /Pick an agent to run/);
  assert.match(src, /Configure aggregator job/);
  assert.match(src, /\/dashboard\/jobs\b/);
});

// ===========================================================================
// Phase 8.B closure invariants
// ===========================================================================

test("Phase 8.B: no new migrations", () => {
  // Latest migration remains 0086. Audit script + decisions doc don't add SQL.
  assert.ok(
    !exists("drizzle/0087_development_os_stage_8_b.sql"),
    "Phase 8.B is UI-only — no migration expected",
  );
});
