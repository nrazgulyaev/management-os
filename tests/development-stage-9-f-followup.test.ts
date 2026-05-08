/**
 * Stage 9.F follow-up — runAgentAction now consults per-tenant config.
 *
 * Two pieces of the Phase 9.F machinery were persisted but not yet
 * consumed at run time:
 *   1. `getAgentEligibility(orgId, agentKey)` — returned a useful
 *      reason but `runAgentAction` skipped past it straight to
 *      `aiExecute`, surfacing only the generic billing error.
 *   2. `org_ai_agent_config.custom_prompt` — operators could write
 *      an override but the runtime ignored it.
 *
 * This follow-up wires both. Static tests guard the call shape; the
 * existing 9.F invariants + dryrun cover the DB side.
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

const RUN_AGENT = "src/features/ai-agents/run-agent-action.ts";

// ============================================================================
// Eligibility wiring
// ============================================================================

test("9.F-followup: runAgentAction calls getAgentEligibility before aiExecute", () => {
  const src = read(RUN_AGENT);
  // Imports the helper.
  assert.match(src, /from\s+["']\.\/agent-config-actions["']/);
  assert.match(src, /import\s*\{[^}]*getAgentEligibility[^}]*\}/);
  // The CALL sites (not the JSDoc mentions) must appear in the right
  // order: eligibility gate → aiExecute. We match `await xxx(` to skip
  // any prose like " * a small aiExecute() call ..." in the file
  // header comment.
  const eligibilityIdx = src.indexOf("await getAgentEligibility(");
  const aiExecuteIdx = src.indexOf("await aiExecute(");
  assert.ok(eligibilityIdx > 0, "getAgentEligibility must be awaited");
  assert.ok(aiExecuteIdx > 0, "aiExecute must still be awaited");
  assert.ok(
    eligibilityIdx < aiExecuteIdx,
    "getAgentEligibility must be called BEFORE aiExecute (gate before billing)",
  );
});

test("9.F-followup: runAgentAction surfaces distinct error messages per ineligibility reason", () => {
  const src = read(RUN_AGENT);
  // Each of the 4 cases produces a different message — operators get
  // an actionable prompt instead of a generic 'AI not available'.
  for (const re of [
    /no_subscription[\s\S]{0,200}no active subscription/,
    /plan_excludes_agent[\s\S]{0,200}not included in your current plan/,
    /disabled_by_org[\s\S]{0,300}\/dashboard\/settings\/ai-agents/,
  ]) {
    assert.match(src, re);
  }
});

// ============================================================================
// Custom prompt override wiring
// ============================================================================

test("9.F-followup: runAgentAction loads the org's custom_prompt override before firing", () => {
  const src = read(RUN_AGENT);
  // Import.
  assert.match(src, /import\s*\{[^}]*orgAiAgentConfig[^}]*\}/);
  // SELECT customPrompt FROM org_ai_agent_config WHERE org + agent.
  assert.match(src, /\.from\(orgAiAgentConfig\)/);
  assert.match(
    src,
    /eq\(orgAiAgentConfig\.organizationId,\s*org\.id\)/,
  );
  assert.match(
    src,
    /eq\(orgAiAgentConfig\.agentKey,\s*agentKey\)/,
  );
});

test("9.F-followup: runAgentAction falls back to canonical prompt when override is null/empty", () => {
  const src = read(RUN_AGENT);
  // The fallback is implemented as: if override is non-null AND non-whitespace, use it; else use config.kickoffPrompt.
  assert.match(
    src,
    /promptOverride\?\.customPrompt[\s\S]{0,80}trim\(\)\.length\s*>\s*0[\s\S]{0,80}config\.kickoffPrompt/,
  );
});

test("9.F-followup: aiExecute receives the effective (possibly overridden) prompt", () => {
  const src = read(RUN_AGENT);
  // The user-message content is now the variable, not the static config field.
  assert.match(
    src,
    /content:\s*effectivePrompt/,
  );
});

test("9.F-followup: agent_outputs row records whether the override was used", () => {
  const src = read(RUN_AGENT);
  // detailedOutput carries the actual prompt + a boolean flag + the
  // canonical prompt (when an override is in effect) so the audit
  // trail makes the diff legible.
  assert.match(src, /promptIsCustomOverride/);
  assert.match(src, /canonicalPrompt:\s*usingOverride/);
  // reasoningSummary mentions the override on positive case.
  assert.match(
    src,
    /Used per-org custom prompt override\./,
  );
});

// ============================================================================
// Closure
// ============================================================================

test("9.F-followup: no new migrations (this is a runtime wiring change only)", () => {
  const fs = require("fs") as typeof import("fs");
  assert.ok(
    !fs.existsSync(
      resolve(ROOT, "drizzle/0091_development_os_stage_9_f_followup.sql"),
    ),
  );
});
