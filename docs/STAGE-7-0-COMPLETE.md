# Stage 7.0 — AI Commerce Retrofit (Path C) — ACCEPTED 2026-05-07

## Summary

Stage 7.0 was **reconciled to Path C** before execution. The
originally-proposed plan called for an AI-isolated parallel schema
(`ai_subscription_plans`, `ai_org_subscriptions`, `ai_usage_aggregates_monthly`)
that would have duplicated the generic commerce backbone shipped in
Stage 7.B. Path C kept the generic tables as canonical and added only
the AI-specific routing metadata + breakdown columns.

| Path | Outcome |
|---|---|
| A — rollback Stage 7 + rebuild | Rejected — would discard ~3,000 LOC |
| B — parallel AI schema | Rejected — two plans tables, ongoing duplication |
| **C — additive retrofit** | **Chosen** |

## What landed

### Migration 0086 (additive only)

ALTER TABLE statements with `ADD COLUMN IF NOT EXISTS`, idempotent
re-runnable.

**On `subscription_plans`** (Stage 7.B canonical table):
- `markup_percent` INT 0..1000, default 0 — % over actual API cost.
- `max_tier` INT 1..3, default 1 — agent tier ceiling.
- `enabled_agent_codes` TEXT[], default `[]` — empty = all enabled.
- CHECKs on both numeric columns.

**On `ai_org_usage_monthly`** (Phase A.2 canonical table):
- `by_agent` JSONB default `{}` — per-agent breakdown.
- `by_provider` JSONB default `{}` — per-provider breakdown.
- `by_tier` JSONB default `{}` — per-tier breakdown.

Each JSONB bucket shape: `{runs: int, costUsd: number, promptTokens: int, completionTokens: int}`.

**Per-plan seed defaults** (only updated rows still on column-default):
| plan | markup_percent | max_tier |
|---|---|---|
| internal | 0 | 3 |
| trial | 0 | 1 |
| basic | 30 | 2 |
| standard | 40 | 2 |
| pro | 50 | 3 |
| enterprise | 0 | 3 |

**0075 lesson preservation (7th time)**: per-plan defaults applied via
`FOREACH pc IN ARRAY ARRAY[...]` block.

### Tier router (pure)

[src/lib/ai/router/tier-rules.ts](../src/lib/ai/router/tier-rules.ts):
- `AgentTier = 1 | 2 | 3`
- `ProviderName = 'anthropic' | 'openai' | 'gemini' | 'dry_run'`
- `AGENT_TIER_MAP` — 18 canonical agent codes mapped to tiers:
  - **Tier 1**: `inbox_triage`, `classifier`, `simple_summarizer`, `document_extraction`
  - **Tier 2**: `dev_os.sales_assistant`, `marketing_assistant`, `daily_digest`, `weekly_plan`, `memory`, `operations_copilot`, `photo_analyst`, `ai_memory_aggregator`, `content_publish_scheduler`, `whatsapp_inbound_processor`
  - **Tier 3**: `qs_cost_analyst`, `tax_assistant`, `executive_business`, `procurement_analyst`, `construction_supervisor`
- `agentCodeToTier(code)` — defaults to Tier 2 for unknown codes.
- `tierToModel(tier, provider)` — canonical model name lookup.
- `modelToTier(model)` — inverse lookup, defaults to Tier 2.

Models per tier:
| Tier | Anthropic | OpenAI | Gemini |
|---|---|---|---|
| 1 | claude-haiku-4-5 | gpt-4o-mini | gemini-1.5-flash |
| 2 | claude-sonnet-4-6 | gpt-4o | gemini-1.5-pro |
| 3 | claude-opus-4-7 | gpt-4o | gemini-1.5-pro |

### Router decisions

[src/lib/ai/router/route.ts](../src/lib/ai/router/route.ts):
`routeRequest({agentCode, plan, defaultProvider, providerOverride?})`
returns:
- `{ok: true, provider, model, tier}` — proceed
- `{ok: false, reason: 'tier_exceeded', blockedTier}` — agent's tier > plan.maxTier
- `{ok: false, reason: 'agent_disabled', blockedAgentCode}` — agent not in plan.enabledAgentCodes

`null` plan = legacy single-tenant fall-through (no gating).

### Markup helper (pure)

[src/lib/ai/markup.ts](../src/lib/ai/markup.ts):
- `applyMarkup(actualCostUsd, markupPercent)` →
  `{actualCostUsd, billedAmountUsd, markupAppliedUsd, markupPercent}`.
- Round-half-up to 4dp to match `NUMERIC(12,4)`.
- Throws on negative cost, fractional markup, out-of-range markup.
- `usdToMinor(usd)` — bigint USD-cents (for Stripe metered billing).

### `aiExecute()` integration

[src/lib/ai/execute.ts](../src/lib/ai/execute.ts) extended:

Pipeline now:
1. **Org quota** check (existing — Phase A.2).
2. **Legacy budget** check (existing — `checkBudget(assistantKey)`).
3. **Plan snapshot + router** (NEW Stage 7.0):
   - `snapshotPlanForOrg(orgId)` — joins org_subscriptions × subscription_plans.
   - `routeRequest()` enforces `max_tier` + `enabled_agent_codes`.
   - Returns `tier_exceeded` / `agent_disabled` reasons.
4. **Provider resolution** uses router's chosen provider (caller's
   `input.model` still wins for explicit overrides).
5. **Run persistence + bumpOrgUsage** (existing).
6. **Markup applied** (NEW Stage 7.0): result includes `tier` +
   `billedAmountUsd`.

`AiExecuteResult` success type now carries `tier` and `billedAmountUsd`.
Failure type adds `tier_exceeded` and `agent_disabled` reasons.

### `ai_aggregate_daily` cron extension

[src/lib/development/server/cron/ai-aggregate-daily-job.ts](../src/lib/development/server/cron/ai-aggregate-daily-job.ts):

After the existing today_* roll-forward + active-org touch, the cron now:
1. Pulls month-to-date `ai_assistant_runs` (status='completed').
2. Buckets by `(assistantKey, inferProvider(model), modelToTier(model))`.
3. UPSERTs `byAgent` / `byProvider` / `byTier` JSONB columns on every
   active org's current-month `ai_org_usage_monthly` row.

Bucket shape (per key):
```json
{ "runs": 42, "costUsd": 12.3456, "promptTokens": 100000, "completionTokens": 30000 }
```

Idempotent — re-runs produce the same final JSONB.

### Dashboard extension

[/development-os/settings/ai-usage](../src/app/(development-app)/development-os/settings/ai-usage/page.tsx) gained a Stage 7.0 section above the runs table:

- **Plan** card — display name + tier ceiling + markup %.
- **Daily cap** card — limit + today's spend.
- **Monthly cap** card — limit + month-to-date spend.
- **Quota state** card — ok / blocked / disabled + threshold lines.
- **3 breakdown cards** — by tier / by provider / by agent. Each lists
  rows sorted by cost desc with `runs / cost`.

`BreakdownCard` is a small inline component that handles the empty case
gracefully.

## Acceptance gate (passed)

| Check | Status |
|---|---|
| Migration 0086 idempotent (ADD COLUMN IF NOT EXISTS) | ✅ |
| 0075 FOREACH IN ARRAY preserved (7th preservation) | ✅ |
| Tier router + markup helper are PURE (no `server-only`) | ✅ |
| `aiExecute()` wires router + applies markup | ✅ |
| Aggregate cron populates 3 JSONB columns | ✅ |
| Dashboard renders org-quota + breakdowns | ✅ |
| Existing `checkBudget()` UNCHANGED (backward compat) | ✅ |
| Existing `cost.ts` UNCHANGED (canonical rate table) | ✅ |
| **+33 tests** (target ~35; tighter because no new crons) | ✅ |
| 4765 tests passing (4732 → 4765) | ✅ |
| Zero regressions | ✅ |
| `npm run build` clean | ✅ |
| `npm run check:cron` clean (101 routes, unchanged) | ✅ |
| Stage 5.J build-fix invariant maintained | ✅ |

## Architectural invariants preserved

1. **Generic > AI-isolated**: `subscription_plans` stays the single
   source of truth for plan metadata. AI-routing columns are tagged but
   live alongside the existing fields. Future surfaces (Stripe sync,
   feature gating) only need to query one table.
2. **Pure helpers when possible**: tier rules + markup + route
   decisions are all pure modules — testable without DB.
3. **Backward compat**: every existing `checkBudget()` caller continues
   to work. Single-tenant Arconique flow (no plan row) gracefully
   skips router gating.
4. **Idempotency**: migration ALTER TABLE statements are
   `IF NOT EXISTS`; per-plan UPDATEs are guarded by WHERE clauses to
   prevent re-overwriting tuned values.
5. **0075 FOREACH IN ARRAY** preserved across all 7 Stage 6 + Stage 7
   migrations that need it.

## What's next

Stage 7.0 closes the AI-commerce retrofit. The original plan's "next
step" was Stage 7.A (RBAC + Cabinets) — already shipped in the prior
turn. The full Stage 7 surface is now:

| Stage | Status |
|---|---|
| 7.0 — AI commerce retrofit (Path C) | ✅ ACCEPTED |
| 7.A — Cabinet definitions | ✅ ACCEPTED |
| 7.B — Subscription plans + feature gating | ✅ ACCEPTED |
| 7.C — Lifecycle FSM + 5 cron jobs | ✅ ACCEPTED |
| 7.D — Stripe subscription bridge | ✅ ACCEPTED |
| 7.E — Tenant subdomain + /pricing + /sign-up | ✅ ACCEPTED |

Suggested follow-ups (deferred from earlier closures):
- Live Stripe products + prices (env-config only).
- Multi-step onboarding wizard.
- Customer Portal embed at `/dashboard/billing/portal`.
- Per-cabinet `pageGate(orgId, 'cabinet.<slug>')` integration.
- Custom-domain support for Pro/Enterprise tenants.
