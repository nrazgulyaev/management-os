/**
 * Stage 10.6 / Phase 10.6.B.3 — AI runner per-org wire-up.
 *
 * Pre-flight clarified the architecture: `aiExecute()` (not `runAgent()`)
 * is the unified entrypoint. The Run-now button (run-agent-action.ts)
 * + Concierge AI + every per-cabinet agent invocation flows through
 * aiExecute. `runAgent()` is legacy/stub from Stage 5.D.
 *
 * The fix: aiExecute consults loadOrgAgentRuntimeConfig (Stage 10.5.B
 * helper) and prefers org-supplied provider+apiKey over the env-default.
 * Per-org isEnabled wins as defense-in-depth.
 *
 * Tests assert wiring contracts. Live verification (operator pastes
 * Anthropic key + clicks "Run now" + sees output) is operator-side.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const EXECUTE = "src/lib/ai/execute.ts";

// ============================================================================
// aiExecute imports the right helpers
// ============================================================================

test("10.6.B.3 — aiExecute imports loadOrgAgentRuntimeConfig (Stage 10.5.B helper)", () => {
  const src = read(EXECUTE);
  assert.match(
    src,
    /from\s+["']@\/features\/ai-agents\/agent-runtime-config["']/,
  );
  assert.match(src, /loadOrgAgentRuntimeConfig/);
});

test("10.6.B.3 — aiExecute imports getAIProviderForCredentials (Stage 10.5.B factory)", () => {
  const src = read(EXECUTE);
  assert.match(src, /getAIProviderForCredentials/);
});

// ============================================================================
// Per-org runtime check inserted at the right point
// ============================================================================

test("10.6.B.3 — aiExecute calls loadOrgAgentRuntimeConfig with (orgId, assistantKey)", () => {
  const src = read(EXECUTE);
  assert.match(
    src,
    /loadOrgAgentRuntimeConfig\(\s*input\.organizationId,\s*input\.assistantKey,?\s*\)/,
  );
});

test("10.6.B.3 — aiExecute returns agent_disabled when org has explicitly disabled the agent", () => {
  const src = read(EXECUTE);
  // The "disabled by your organization" message must appear.
  assert.match(src, /disabled by your organization/i);
  // It must be returned as the structured agent_disabled reason (not just a string).
  assert.match(
    src,
    /reason:\s*["']agent_disabled["'][\s\S]*disabled by your organization/,
  );
});

// ============================================================================
// Org-supplied creds beat platform defaults
// ============================================================================

test("10.6.B.3 — when orgRuntime.provider + apiKey are set, aiExecute uses getAIProviderForCredentials", () => {
  const src = read(EXECUTE);
  // The branch checks both provider AND apiKey.
  assert.match(
    src,
    /orgRuntime\.provider\s*&&\s*orgRuntime\.apiKey/,
  );
  // Inside that branch, the factory is invoked with the right shape.
  assert.match(
    src,
    /getAIProviderForCredentials\(\s*\{[\s\S]*?provider:\s*orgRuntime\.provider/,
  );
  // apiKey is forwarded.
  assert.match(src, /apiKey:\s*orgRuntime\.apiKey/);
});

test("10.6.B.3 — per-org model overrides router-resolved model when set", () => {
  const src = read(EXECUTE);
  // The const-resolvedModel ternary chains:
  //   input.model ?? (org.provider && org.apiKey && org.model
  //                   ? org.model
  //                   : route.model)
  // so the per-org model wins over router.model when configured.
  assert.match(
    src,
    /orgRuntime\.provider\s*&&\s*orgRuntime\.apiKey\s*&&\s*orgRuntime\.model/,
  );
});

test("10.6.B.3 — when orgRuntime has no key, falls back to platform resolveProvider(route.provider)", () => {
  const src = read(EXECUTE);
  // The else branch must call the existing resolveProvider helper.
  assert.match(
    src,
    /\}\s*else\s*\{\s*provider\s*=\s*resolveProvider\(route\.provider\)/,
  );
});

// ============================================================================
// Helpful error when org configured a provider but didn't paste a key
// ============================================================================

test("10.6.B.3 — provider_unavailable message points operator to /dashboard/settings/ai-agents/<key> when half-configured", () => {
  const src = read(EXECUTE);
  // The unavailable-provider error includes a settings link path that
  // includes the agent key — surfacing the fix path inline.
  assert.match(
    src,
    /\/dashboard\/settings\/ai-agents\/\$\{input\.assistantKey\}/,
  );
});

// ============================================================================
// runAgent legacy path note
// ============================================================================

test("10.6.B.3 — runAgent (legacy Stage 5.D) is unchanged; aiExecute is the wire-up surface", () => {
  // runAgent.ts still has its original Stage 5.D shape — no organizationId
  // added. The 7 runAgent callsites in src/lib/development/server/ai/*
  // and src/lib/development/server/cron/* don't actually invoke a provider
  // (they only persist a buildOutput payload), so they need no fix for
  // per-org credential wiring.
  const runner = readFileSync(
    resolve(ROOT, "src/lib/development/server/ai/agent-runner.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    runner,
    /loadOrgAgentRuntimeConfig/,
    "runAgent.ts should NOT import loadOrgAgentRuntimeConfig — it's a legacy path; aiExecute is where per-org wiring lives",
  );
});

// ============================================================================
// Decisions doc
// ============================================================================

test("10.6.B.3 — decisions doc shipped + acceptance gate present", () => {
  const path = "tmp/stage-10-6-b-3-decisions.md";
  assert.ok(existsSync(resolve(ROOT, path)));
  const doc = readFileSync(resolve(ROOT, path), "utf8");
  assert.match(doc, /STAGE 10\.6 \/ PHASE 10\.6\.B\.3 ACCEPTED/);
  // Documents the architecture-correction discovery.
  assert.match(doc, /aiExecute|aiExecute\(\)/);
});
