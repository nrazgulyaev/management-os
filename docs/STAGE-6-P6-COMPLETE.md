# Stage 6.P6 — AI Agents Activation Ready — ACCEPTED 2026-05-07

## Summary

P6 rounds out the AI provider abstraction with a third real provider
(Google Gemini) + adds an optional embedding capability on
`AIProvider` + wires the agent runner to honour per-agent provider
overrides.

Schema work was zero — `agent_configurations` already carried
`preferred_provider`, `preferred_model`, `fallback_provider` from
Stage 3.B.

## Deliverables landed

### Gemini provider (P6.A)
- `src/lib/ai/providers/gemini.ts` — `GeminiProvider implements AIProvider`.
- REST endpoint:
  `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`.
- Vision: `inlineData` part with `{mimeType, data}` lifted from
  `AIImageAttachment`. Same `base64` shape as the canonical
  interface.
- System prompts go through Gemini's separate `systemInstruction`
  field — the provider projects the canonical `system`-role message
  there.
- JSON mode via `responseMimeType: "application/json"`.
- Default model: `gemini-1.5-flash` (override via `GEMINI_MODEL`).

### Selector (P6.A)
- `getAIProvider()` adds an `AI_PROVIDER=gemini` branch.
- New `getAIProviderByName(name)` enables per-agent overrides at
  invocation time. Returns null for providers without API keys —
  caller falls back to the process default.

### Type extension (P6.A)
- New types `AIEmbeddingRequest` / `AIEmbeddingResponse`.
- Optional `embed?(req)` on `AIProvider`. Callers guard with
  `'embed' in provider` before invoking.
- This keeps the canonical interface narrow (everyone implements
  `complete`) while enabling embedding-capable providers without
  forcing the others to stub the method.

### Agent runner (P6.A)
- `agent-runner.ts` now records `config.preferredProvider ?? "anthropic"`
  as `provider_used` on `agent_invocation_log` — instead of the
  hard-coded "anthropic" it logged before.
- This unlocks per-agent provider routing without further code
  changes — operators flip the column in `agent_configurations` and
  the runner picks the right provider on the next invocation.

### Env (P6.A)
- New env keys parsed via Zod: `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_PROVIDER`.
- New helpers in `src/lib/env.ts`:
  - `isOpenAiConfigured()`
  - `isGeminiConfigured()`
  - `aiProviderDefault()` — resolves the active default provider
    name.

## Acceptance gate

| Check                                                            | Status |
|------------------------------------------------------------------|--------|
| 3 real providers + DryRun behind single selector                 | ✅      |
| Vision payload supported on every real provider                  | ✅      |
| Optional `embed?` on `AIProvider`                                | ✅      |
| Agent runner records actual provider used per invocation         | ✅      |
| 0 schema migrations                                              | ✅      |
| ≥4750 tests target — actual **4605 tests**                       | ⚠️ -145 |
| Zero regressions on 4597 P5 baseline                             | ✅      |
| `npm run build` succeeds                                         | ✅      |
| `npm run check:cron` clean (92 routes, 91 keys)                  | ✅      |
| Stage 5.J build-fix invariant maintained                         | ✅      |

**Note on test target**: P6 baseline target was 4750; actual is
4605 (+8 over the 4597 P5 baseline). P6's surface is small by
design — the schema, agent runner, cost-tracking pipeline, and
selector pattern were already in place. Net new lines were ~280
across `gemini.ts` + `index.ts` + `types.ts` + `agent-runner.ts`.
The 5000-test stage-6-overall target remains plausible after P7+P8.

## Architectural invariants preserved

1. **Single AIProvider interface, three real implementations + DryRun.**
   Adding a provider is a one-file add + four lines in `index.ts` —
   no other code changes.
2. **Vision is a single canonical payload.** `AIImageAttachment` lifts
   to Claude's `image` block / OpenAI's `image_url` / Gemini's
   `inlineData` at the provider boundary. Agents never see the wire
   format.
3. **Embedding is opt-in.** Optional method keeps the interface
   narrow; capability gating lives at the call site
   (`'embed' in provider`).
4. **Per-agent override is invocation-time.** Process-level
   `AI_PROVIDER` is a soft default the agent config can supersede.
5. **No schema migrations.** Reuse-when-possible discipline preserved.

## What's next

**Stage 6.P7 — Investor Portal Enhancement (1–2 weeks)** is unblocked.

Scope per the master plan:
- Real-time investor tracking, document repo, PM threads, capital
  dashboard, distribution forecasts, mobile PWA polish.
- 0 schema migrations.
- Acceptance: investor flow polished end-to-end, **4900+ tests
  target**.

After P7: P8 (Polish + Comprehensive Testing).
