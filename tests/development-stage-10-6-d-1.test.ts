/**
 * Stage 10.6 / Phase 10.6.D.1 — AI agent UI polish.
 *
 * 10.6.B.3 already shipped the runtime work (per-org provider config
 * resolution at AI invocation time). 10.5.B already shipped the
 * encrypted-at-rest credential storage + test-connection flow. So
 * 10.6.D.1 is mostly visual: apply the 10.6.C token system to the
 * AI-agent settings + usage analytics surfaces.
 *
 * What this sub-phase delivers:
 *   - /dashboard/settings/ai-agents/[agent_key] — eligibility cards
 *     bumped from rounded (6px) + p-3 to rounded-2xl + p-5 +
 *     shadow-soft-card. Canonical-prompt panel rounded-2xl + p-5.
 *   - /development-os/settings/ai-usage — per-agent breakdown cards
 *     bumped from rounded-md to rounded-2xl + bg-surface +
 *     shadow-soft-card.
 *
 * What this sub-phase does NOT close:
 *   - Concierge AI per-org wiring — currently a guest-facing surface
 *     with its own AI invocation path. Threading orgAiAgentConfig
 *     through requires touching guest stay pages + concierge-chat.tsx.
 *     Deferred to 10.6.D.2 external integrations sub-phase where
 *     Anthropic/OpenAI/Gemini integrations get extended.
 *   - Per-agent activate/deactivate toggle — already shipped in
 *     prior stages via <ToggleAgentButton>. Existing.
 *   - Test connection — already shipped in 10.5.B
 *     (testAgentConnectionAction). Existing.
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

const AGENT_DETAIL =
  "src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx";
const AI_USAGE =
  "src/app/(development-app)/development-os/settings/ai-usage/page.tsx";

// ============================================================================
// Agent detail page polish
// ============================================================================

test("10.6.D.1 — agent detail eligibility cards use rounded-2xl + p-5 + shadow-soft-card", () => {
  const src = read(AGENT_DETAIL);
  // Tier / Plan / State cards — count occurrences of the new card class
  const matches = src.match(
    /rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card/g,
  );
  assert.ok(matches && matches.length >= 3, `expected 3 polished cards, got ${matches?.length ?? 0}`);
});

test("10.6.D.1 — agent detail canonical-prompt panel bumped to rounded-2xl + p-5", () => {
  const src = read(AGENT_DETAIL);
  assert.match(
    src,
    /rounded-2xl border border-line-soft bg-muted\/30 p-5 text-sm/,
  );
});

test("10.6.D.1 — agent detail no longer uses unrounded card frames", () => {
  const src = read(AGENT_DETAIL);
  // The legacy `rounded border ... px-4 py-3` frames are gone
  assert.doesNotMatch(src, /rounded border border-line-soft bg-surface px-4 py-3/);
});

test("10.6.D.1 — agent detail still renders ToggleAgentButton (existing per-agent activate)", () => {
  const src = read(AGENT_DETAIL);
  assert.match(src, /<ToggleAgentButton/);
});

test("10.6.D.1 — agent detail still renders ProviderConfigForm (existing per-org provider override)", () => {
  const src = read(AGENT_DETAIL);
  assert.match(src, /<ProviderConfigForm/);
});

test("10.6.D.1 — agent detail still renders CustomPromptForm where canonical prompt exists", () => {
  const src = read(AGENT_DETAIL);
  assert.match(src, /<CustomPromptForm/);
});

// ============================================================================
// AI usage page polish
// ============================================================================

test("10.6.D.1 — ai-usage breakdown cards use rounded-2xl + bg-surface + shadow-soft-card", () => {
  const src = read(AI_USAGE);
  assert.match(
    src,
    /rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card/,
  );
});

test("10.6.D.1 — ai-usage no longer uses bare rounded-md unbordered frames", () => {
  const src = read(AI_USAGE);
  // The specific legacy "rounded-md border border-line-soft p-4" inside
  // BreakdownCard is gone
  assert.doesNotMatch(
    src,
    /<div className="rounded-md border border-line-soft p-4">\s*<div className="text-label/,
  );
});
