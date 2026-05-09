/**
 * Stage 10.5.B — AI integration polish acceptance tests.
 *
 * 10.5.B.1 — Migration 0095 + Drizzle schema: extends
 *            org_ai_agent_config with provider, model,
 *            api_key_encrypted (JSONB), api_key_set_at,
 *            last_test_status, last_test_at, last_test_error.
 * 10.5.B.2 — Provider refactor: Anthropic / OpenAI / Gemini accept
 *            an optional per-instance {apiKey, model}; new
 *            getAIProviderForCredentials() factory builds a fresh
 *            provider for caller-supplied credentials.
 *            Server actions: setAgentProviderConfigAction +
 *            clearAgentApiKeyAction (encrypts API key with the
 *            existing AES-256-GCM helper).
 * 10.5.B.3 — testAgentConnectionAction: instantiates the chosen
 *            provider, runs a 1-token completion, persists
 *            last_test_status/at/error.
 * 10.5.B.4 — loadOrgAgentRuntimeConfig() helper resolves
 *            isEnabled + provider + model + decrypted apiKey for
 *            an org/agent pair. Agent-runner integration is a
 *            documented carry-over.
 *
 * UI: per-agent settings page mounts <ProviderConfigForm>.
 *
 * Tests assert wiring contracts (file presence, schema shape,
 * imports, call signatures). Live API round-trips stay out of
 * scope (operator-side env vars + real provider keys gate that).
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
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const MIGRATION = "drizzle/0095_org_ai_agent_config_provider.sql";
const SCHEMA = "src/lib/db/schema/org-ai-agent-config.ts";
const PROVIDER_INDEX = "src/lib/ai/providers/index.ts";
const ANTHROPIC = "src/lib/ai/providers/anthropic.ts";
const OPENAI = "src/lib/ai/providers/openai.ts";
const GEMINI = "src/lib/ai/providers/gemini.ts";
const ACTIONS = "src/features/ai-agents/agent-provider-actions.ts";
const RUNTIME_CONFIG = "src/features/ai-agents/agent-runtime-config.ts";
const FORM = "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/provider-config-form.tsx";
const PAGE = "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx";
const DECISIONS = "tmp/stage-10-5-b-decisions.md";

// ============================================================================
// 10.5.B.1 — Migration + Drizzle schema
// ============================================================================

test("10.5.B.1 — migration 0095 ships with the right ALTER + CHECK constraints", () => {
  assert.ok(exists(MIGRATION));
  const src = read(MIGRATION);
  assert.match(src, /ADD COLUMN provider text/);
  assert.match(src, /ADD COLUMN model text/);
  assert.match(src, /ADD COLUMN api_key_encrypted jsonb/);
  assert.match(src, /ADD COLUMN api_key_set_at timestamptz/);
  assert.match(src, /ADD COLUMN last_test_status text/);
  assert.match(src, /ADD COLUMN last_test_at timestamptz/);
  assert.match(src, /ADD COLUMN last_test_error text/);
  // Provider check constraint
  assert.match(
    src,
    /CHECK \(provider IS NULL OR provider IN \('anthropic', 'openai', 'gemini'\)\)/,
  );
  // Test status check constraint
  assert.match(
    src,
    /CHECK \(last_test_status IS NULL OR last_test_status IN \('ok', 'failed'\)\)/,
  );
  // Documented rollback
  assert.match(src, /Rollback:/);
  assert.match(src, /DROP COLUMN provider/);
});

test("10.5.B.1 — Drizzle schema gains all 7 new columns", () => {
  const src = read(SCHEMA);
  assert.match(src, /provider:\s*text\("provider"\)/);
  assert.match(src, /model:\s*text\("model"\)/);
  assert.match(src, /apiKeyEncrypted:\s*jsonb\("api_key_encrypted"\)/);
  assert.match(
    src,
    /apiKeySetAt:\s*timestamp\("api_key_set_at",\s*\{\s*withTimezone:\s*true/,
  );
  assert.match(src, /lastTestStatus:\s*text\("last_test_status"\)/);
  assert.match(
    src,
    /lastTestAt:\s*timestamp\("last_test_at",\s*\{\s*withTimezone:\s*true/,
  );
  assert.match(src, /lastTestError:\s*text\("last_test_error"\)/);
  assert.match(src, /Stage 10\.5\.B/);
});

// ============================================================================
// 10.5.B.2 — Provider refactor + factory
// ============================================================================

test("10.5.B.2 — AnthropicProvider accepts an optional {apiKey, model} opts (with legacy string compat)", () => {
  const src = read(ANTHROPIC);
  // New constructor signature: opts object union with the legacy string.
  assert.match(
    src,
    /constructor\(opts\?:\s*\{\s*apiKey\?:\s*string;\s*model\?:\s*string\s*\}\s*\|\s*string\)/,
  );
  // Per-instance apiKey field stored.
  assert.match(src, /apiKeyOverride/);
  // Backwards compat: positional model string still tolerated.
  assert.match(src, /typeof opts === "string"/);
  // complete() prefers the per-instance key over env.
  assert.match(
    src,
    /this\.apiKeyOverride \?\? env\.server\.ANTHROPIC_API_KEY/,
  );
});

test("10.5.B.2 — OpenAIProvider accepts an optional {apiKey, model} opts", () => {
  const src = read(OPENAI);
  assert.match(
    src,
    /constructor\(opts\?:\s*\{\s*apiKey\?:\s*string;\s*model\?:\s*string\s*\}\s*\|\s*string\)/,
  );
  assert.match(src, /apiKeyOverride/);
  assert.match(
    src,
    /this\.apiKeyOverride \?\? process\.env\.OPENAI_API_KEY/,
  );
});

test("10.5.B.2 — GeminiProvider accepts an optional {apiKey, model} opts", () => {
  const src = read(GEMINI);
  assert.match(
    src,
    /constructor\(opts\?:\s*\{\s*apiKey\?:\s*string;\s*model\?:\s*string\s*\}\s*\|\s*string\)/,
  );
  assert.match(src, /apiKeyOverride/);
  assert.match(
    src,
    /this\.apiKeyOverride \?\? process\.env\.GEMINI_API_KEY/,
  );
});

test("10.5.B.2 — getAIProviderForCredentials factory routes to all 3 providers + rejects empty keys", () => {
  const src = read(PROVIDER_INDEX);
  // Factory exported.
  assert.match(src, /export function getAIProviderForCredentials/);
  // Routes to each provider with {apiKey, model}.
  assert.match(src, /new AnthropicProvider\(\{\s*apiKey:\s*opts\.apiKey,\s*model:\s*opts\.model\s*\}\)/);
  assert.match(src, /new OpenAIProvider\(\{\s*apiKey:\s*opts\.apiKey,\s*model:\s*opts\.model\s*\}\)/);
  assert.match(src, /new GeminiProvider\(\{\s*apiKey:\s*opts\.apiKey,\s*model:\s*opts\.model\s*\}\)/);
  // Empty key → null.
  assert.match(src, /!opts\.apiKey \|\| opts\.apiKey\.length === 0.*return null/s);
});

test("10.5.B.2 — getAIProviderForCredentials documented in the providers barrel", () => {
  const src = read(PROVIDER_INDEX);
  assert.match(src, /export function getAIProviderForCredentials/);
  // Doesn't cache (every call returns a fresh instance because creds may differ).
  assert.doesNotMatch(
    src,
    /cached = new AnthropicProvider\(\{ apiKey/,
    "factory must not cache instances built from caller creds",
  );
});

// ============================================================================
// 10.5.B.2+.3 — Server actions
// ============================================================================

test("10.5.B.2 — setAgentProviderConfigAction exists and is server-only", () => {
  assert.ok(exists(ACTIONS));
  const src = read(ACTIONS);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function setAgentProviderConfigAction/);
});

test("10.5.B.2 — provider config action encrypts the API key via credentials-crypto", () => {
  const src = read(ACTIONS);
  assert.match(
    src,
    /from "@\/lib\/channel-manager\/credentials-crypto"/,
  );
  assert.match(src, /encryptCredentials\(/);
  // Encrypts the apiKey when supplied
  assert.match(src, /JSON\.stringify\(\{ apiKey \}\)/);
  // Stamps api_key_set_at when a fresh key is supplied
  assert.match(src, /apiKeySetAt:\s*envelope\s*\?\s*now/);
});

test("10.5.B.2 — provider config action requires KMS secret to be configured", () => {
  const src = read(ACTIONS);
  assert.match(src, /stayLinkKmsSecret\(\)/);
  // Refuses to save when secret unset (no plaintext storage).
  assert.match(src, /STAY_LINK_KMS_SECRET.*not configured|Encryption secret/i);
});

test("10.5.B.2 — clearAgentApiKeyAction wipes the encrypted blob + test status", () => {
  const src = read(ACTIONS);
  assert.match(src, /export async function clearAgentApiKeyAction/);
  // Sets apiKeyEncrypted + apiKeySetAt + lastTest* to null on clear.
  assert.match(src, /apiKeyEncrypted:\s*null/);
  assert.match(src, /apiKeySetAt:\s*null/);
});

test("10.5.B.3 — testAgentConnectionAction calls provider.complete with a minimal request", () => {
  const src = read(ACTIONS);
  assert.match(src, /export async function testAgentConnectionAction/);
  // 1-token completion (cheap probe; minimum viable round-trip).
  assert.match(src, /maxTokens:\s*[1-9]/);
  // Persists last_test_status + last_test_at + (on failure) last_test_error.
  assert.match(src, /lastTestStatus:.*ok.*failed/s);
  assert.match(src, /lastTestAt:\s*now/);
  assert.match(src, /lastTestError:/);
});

test("10.5.B.3 — testAgentConnectionAction redacts the API key from any echoed error", () => {
  const src = read(ACTIONS);
  assert.match(src, /redactSecrets/);
  // Splits-and-joins the message on the apiKey so any echoed copy is replaced.
  assert.match(src, /message\.split\(apiKey\)\.join\("<redacted>"\)/);
});

test("10.5.B.3 — test action accepts caller-supplied apiKey OR falls back to saved encrypted key", () => {
  const src = read(ACTIONS);
  // The schema marks apiKey as optional.
  assert.match(src, /apiKey:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\)\.optional/);
  // The action decrypts the saved blob when no fresh key supplied.
  assert.match(src, /decryptCredentials\(/);
});

test("10.5.B.2+.3 — actions write audit events for save / clear / test", () => {
  const src = read(ACTIONS);
  // 4 audit actions total (save, clear, test ok, test failed).
  for (const action of [
    "ai.agent.provider_configured",
    "ai.agent.api_key_cleared",
    "ai.agent.test_connection_ok",
    "ai.agent.test_connection_failed",
  ]) {
    assert.ok(
      src.includes(action),
      `expected audit action "${action}" in agent-provider-actions.ts`,
    );
  }
});

// ============================================================================
// 10.5.B UI — settings page wires the form
// ============================================================================

test("10.5.B UI — ProviderConfigForm component exists + is a client component", () => {
  assert.ok(exists(FORM));
  const src = read(FORM);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function ProviderConfigForm/);
});

test("10.5.B UI — form imports all 3 server actions", () => {
  const src = read(FORM);
  assert.match(src, /setAgentProviderConfigAction/);
  assert.match(src, /testAgentConnectionAction/);
  assert.match(src, /clearAgentApiKeyAction/);
});

test("10.5.B UI — form surfaces a provider dropdown with all 3 named providers", () => {
  const src = read(FORM);
  assert.match(src, /Anthropic.*Claude/);
  assert.match(src, /OpenAI.*GPT/);
  assert.match(src, /Gemini/);
  // Plus the "use system default" option (empty value).
  assert.match(src, /Use system default/);
});

test("10.5.B UI — API key input is type=password and has no autocomplete", () => {
  const src = read(FORM);
  assert.match(src, /type="password"/);
  assert.match(src, /autoComplete="off"/);
});

test("10.5.B UI — settings page mounts the new ProviderConfigForm section", () => {
  const src = read(PAGE);
  assert.match(src, /import \{ ProviderConfigForm \}/);
  assert.match(src, /<ProviderConfigForm/);
  // Section title surfaces the "API key + provider override" copy.
  assert.match(src, /API key \+ provider override/);
});

// ============================================================================
// 10.5.B.4 — Runtime config helper
// ============================================================================

test("10.5.B.4 — loadOrgAgentRuntimeConfig helper exists and is server-only", () => {
  assert.ok(exists(RUNTIME_CONFIG));
  const src = read(RUNTIME_CONFIG);
  assert.match(src, /^import "server-only"/m);
  assert.match(src, /export async function loadOrgAgentRuntimeConfig/);
});

test("10.5.B.4 — runtime config helper decrypts the saved key + returns the resolved triple", () => {
  const src = read(RUNTIME_CONFIG);
  assert.match(src, /decryptCredentials\(/);
  // Returns the documented shape.
  assert.match(src, /isEnabled:/);
  assert.match(src, /provider:/);
  assert.match(src, /model:/);
  assert.match(src, /apiKey:/);
});

test("10.5.B.4 — runtime config helper degrades gracefully on bad cipher / no row / missing secret", () => {
  const src = read(RUNTIME_CONFIG);
  // No row: returns DEFAULT_CONFIG (isEnabled: true, no overrides).
  assert.match(src, /DEFAULT_CONFIG/);
  // Sets apiKeyDecryptError flag instead of throwing.
  assert.match(src, /apiKeyDecryptError/);
});

// ============================================================================
// Decisions doc
// ============================================================================

test("10.5.B — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS));
  const doc = read(DECISIONS);
  assert.match(doc, /STAGE 10\.5 \/ PHASE 10\.5\.B ACCEPTED/i);
  // Carry-over (agent-runner integration) flagged.
  assert.match(doc, /agent.runner|runner integration/i);
  // PG18 dryrun status documented (operator-side per 0094 pattern).
  assert.match(doc, /PG18|dryrun/i);
});
