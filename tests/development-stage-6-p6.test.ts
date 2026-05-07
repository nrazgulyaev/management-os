/**
 * Stage 6.P6 — AI Agents activation-readiness tests.
 *
 * Covers:
 *   - Gemini provider source + selector wiring
 *   - Embedding interface added to AIProvider
 *   - Agent runner uses `config.preferredProvider`
 *   - Env helpers + arch-doc bookkeeping
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 1) Gemini provider source presence + shape
// ===========================================================================

test("P6.A: GeminiProvider file exists", () => {
  assert.ok(fileExists("src/lib/ai/providers/gemini.ts"));
});

test("P6.A: GeminiProvider implements AIProvider + uses GEMINI_API_KEY", () => {
  const src = readFile("src/lib/ai/providers/gemini.ts");
  assert.match(src, /class\s+GeminiProvider\s+implements\s+AIProvider/);
  assert.match(src, /GEMINI_API_KEY/);
  assert.match(src, /generativelanguage\.googleapis\.com/);
  // System prompts go through systemInstruction (Gemini-specific).
  assert.match(src, /systemInstruction/);
  // Vision: inlineData carries base64 + mimeType.
  assert.match(src, /inlineData/);
});

// ===========================================================================
// 2) Selector wiring
// ===========================================================================

test("P6.A: index.ts wires Gemini in getAIProvider", () => {
  const src = readFile("src/lib/ai/providers/index.ts");
  assert.match(src, /import\s*\{\s*GeminiProvider\s*\}\s*from/);
  assert.match(src, /AI_PROVIDER\s*===\s*"gemini"/);
  assert.match(src, /new\s+GeminiProvider\(\)/);
  assert.match(src, /GEMINI_API_KEY/);
});

test("P6.A: getAIProviderByName supports all 4 names", () => {
  const src = readFile("src/lib/ai/providers/index.ts");
  assert.match(src, /export\s+function\s+getAIProviderByName/);
  for (const name of ["anthropic", "openai", "gemini", "dry_run"]) {
    assert.match(src, new RegExp(`case\\s+"${name}":`));
  }
});

// ===========================================================================
// 3) Embedding interface
// ===========================================================================

test("P6.A: AIProvider type adds AIEmbeddingRequest + AIEmbeddingResponse", () => {
  const src = readFile("src/lib/ai/providers/types.ts");
  assert.match(src, /interface\s+AIEmbeddingRequest/);
  assert.match(src, /interface\s+AIEmbeddingResponse/);
  // Optional method on AIProvider — caller guards with `'embed' in provider`.
  assert.match(src, /embed\?\(/);
});

// ===========================================================================
// 4) Agent runner uses preferredProvider
// ===========================================================================

test("P6.A: agent-runner records config.preferredProvider as providerUsed", () => {
  const src = readFile("src/lib/development/server/ai/agent-runner.ts");
  assert.match(src, /config\.preferredProvider/);
  // The literal "anthropic" should still appear as the fallback default.
  assert.match(src, /preferredProvider\s*\?\?\s*"anthropic"/);
});

// ===========================================================================
// 5) Env helpers
// ===========================================================================

test("P6: env.ts exposes provider helpers", () => {
  const src = readFile("src/lib/env.ts");
  for (const fn of [
    "isOpenAiConfigured",
    "isGeminiConfigured",
    "aiProviderDefault",
  ]) {
    assert.match(src, new RegExp(`export\\s+function\\s+${fn}\\b`));
  }
  // The 4 new env keys must be parsed.
  assert.match(src, /OPENAI_API_KEY:\s*z\.string/);
  assert.match(src, /GEMINI_API_KEY:\s*z\.string/);
  assert.match(src, /AI_PROVIDER:\s*z\.string/);
});

// ===========================================================================
// 6) Architecture doc
// ===========================================================================

test("architecture doc: Stage 6.P6 marker present", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P6/);
});
