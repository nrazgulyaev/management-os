# Sprint MD-4 + MD-5 · Aggregator KPIs + 5 new AI agents closure

**Started:** 2026-05-15
**Closed:** 2026-05-15
**Scope:** Close out the mega-sprint's MD-4 (5 aggregator deferrals) + MD-5 (5 new AI agents seeded with default `preferred_provider='anthropic'`, gated per-org until operator wires a BYO key).
**Baseline:** 6149 / 6149 tests passing on `main` after Sprint MD-2+MD-3 closure.
**Final:** **6149 / 6149 tests passing** (all phases additive — no test churn).

## Per-phase commits

| Phase | Commit | What shipped |
| --- | --- | --- |
| 1 — Project Manager | `feat(pm): subcontractor TeamRowList + project-completion DonutRatioCard` | `loadActiveSubcontractors` + `loadProjectCompletion` + apex Section between AI grid and Portfolio kanban |
| 2 — Marketing | `feat(marketing): attribution KPI + channel-split donut` | `loadTopAttributedSource` + `loadChannelSplit` + KpiRowMixed swap + new Channel-split Section |
| 3 — Investor Portal | `feat(investor): forecast AreaChartCard + investor-copilot agent seed` | `loadForecastCashflow` + AreaChartCard section + `investor_copilot` agent seed + `isAgentEnabledForOrg` helper + AreaChartCard re-exported through `@/components/award/` |
| 4 — Front Office | `feat(front-office): front-office-copilot agent seed + apex integration` | `front_office_copilot` agent + 3-way branched AI Section |
| 5 — Housekeeping | `feat(housekeeping): housekeeping-scheduler agent seed` | `housekeeping_scheduler` agent + 3-way branched AI Section |
| 6 — Concierge | `feat(concierge): concierge-handoff agent seed` | `concierge_handoff` agent + 3-way branched AI Section |
| 7 — Security | `feat(security): security-copilot agent seed` | `security_copilot` agent + 3-way branched AI Section |

Full per-phase quality-gate log + scope-cuts live in [`docs/audits/2026-05-15-md-4-5-progress.md`](./2026-05-15-md-4-5-progress.md).

---

## 5 new aggregator helpers (MD-4)

| Helper | Path | Returns |
| --- | --- | --- |
| `loadActiveSubcontractors(projectIds?, limit=8)` | `src/lib/development/server/pm/pm-subcontractor-queries.ts` | Vendors with active `work_packages`, deduped to their highest-priority row (in_progress > ready_to_start > on_hold). |
| `loadProjectCompletion(projectIds?)` | (same) | Per-project actual-% averaged across `work_packages.progress_percentage`; `actualFinish IS NOT NULL` short-circuits to 100. |
| `loadTopAttributedSource({ managerId?, periodStart?, periodEnd? })` | `src/lib/development/server/marketing/attribution-queries.ts` | Lead-source with the most conversions (`lifecycleStatus IN 'reservation'|'contract'`), tie-broken on lead volume; joined to `marketing_lead_sources` for the display label + channel type. |
| `loadChannelSplit({ periodStart?, periodEnd? })` | (same) | Top-5 publish channels from `content_variants.platformTarget` on published `content_pieces`. Each channel carries a design-system tone (Instagram=coral, Email=gold, WhatsApp=emerald, …). |
| `loadForecastCashflow(investorId, quarterCount=4)` | `src/lib/development/server/investor/forecast-cashflow-queries.ts` | 4-quarter projection of LP-owed outflows (pending capital drawdowns) + LP-share inflows (declared/executing distributions, pro-rated by commitment share). Cumulative balance running from "today". |

## 5 new AI agents (MD-5)

All five seeded with `preferred_provider='anthropic'`, `preferred_model='claude-haiku-4-5'`, `requires_operator_review=TRUE`, `is_active=TRUE`. **Per-org enablement** is gated by `org_ai_agent_config.is_enabled` + an encrypted API key — operator opts in via the existing per-agent BYO surface at `/dashboard/settings/ai-agents/[agent_key]`. Cabinet apexes render the "Coming soon · Configure key" CTA until both flags are set.

| Agent key | Migration | Daily budget (USD minor) | Cabinet apex |
| --- | --- | ---: | --- |
| `investor_copilot` | `drizzle/0098_md_5_investor_copilot.sql` | 500 | `/investor-portal/dashboard` |
| `front_office_copilot` | `drizzle/0099_md_5_front_office_copilot.sql` | 1000 | `/dashboard/front-office` |
| `housekeeping_scheduler` | `drizzle/0100_md_5_housekeeping_scheduler.sql` | 800 | `/dashboard/housekeeping` |
| `concierge_handoff` | `drizzle/0101_md_5_concierge_handoff.sql` | 1200 | `/dashboard/concierge` |
| `security_copilot` | `drizzle/0102_md_5_security_copilot.sql` | 600 | `/dashboard/security` |

Migration `0098` widens the `agent_configurations.agent_type` CHECK constraint to accept the 5 new types in one atomic constraint swap; migrations `0099–0102` are pure INSERTs.

### Per-org liveness helper

`src/features/ai-agents/is-agent-enabled-for-org.ts` ships two exports:

- `isAgentEnabledForOrg(orgId, agentKey)` — wraps `loadOrgAgentRuntimeConfig` and returns `true` only when `is_enabled=true` AND a decryptable API key exists.
- `isAgentEnabledForCurrentOrg(agentKey)` — resolves the default org and delegates. Fails closed (returns false) on any DB / cipher error.

Cabinet apexes call `isAgentEnabledForCurrentOrg(agentKey)` to drive the 3-way branch:
- **not enabled** → Link to `/dashboard/settings/ai-agents/<agentKey>` ("Configure key" CTA)
- **enabled, no outputs** → Link to `/dashboard/ai/jobs?agent=<agentKey>` ("Run …" CTA)
- **enabled + outputs** → inline 3-card grid of recent agent_outputs

---

## Consolidated scope-cuts

| Scope-cut | Phase | Reason |
| --- | --- | --- |
| Vendors as subcontractor proxy | 1 | No `subcontractor_assignments` pivot table exists. |
| Donut `plannedPercent` always = 100 | 1 | No S-curve roll-up of planned work; donut reads `actualPercent / 100`. |
| Attribution by lifecycle, not by event | 2 | No first-party attribution-event table; treats lifecycleStatus `'reservation'/'contract'` as the conversion signal. |
| InvestorHeroGreetingAI askHref wiring | 3 | InvestorSession carries no organizationId; per-org enablement check is deferred. Existing "Coming soon" badge persists. |
| Forecast pro-rated by commitment share | 3 | `distribution_allocations` rows don't exist for declared-but-not-executed distributions. |

Five scope-cuts total, all documented per-phase. No phase exceeded the 3-deferral halt threshold.

---

## Quality gates (Task 8 final)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | no errors on touched files; pre-existing repo-wide warnings unchanged |
| `npm test` | **6149 / 6149 passing** (no churn — all phases additive) |
| `npm run build` | succeeds; all 7 cabinet apexes prerender or render dynamically without console errors |
| 5 agent migrations present | verified — `drizzle/0098–0102_md_5_*.sql` |
| 5 cabinet apexes branch 3 ways | verified — Front Office · Housekeeping · Concierge · Security all check `isAgentEnabledForCurrentOrg`; Investor portal keeps the existing "Coming soon" badge (scope-cut docu'd) |
| 5 aggregators OR scope-cut documented | verified — see scope-cut table above |

---

## Operator handoff

The 5 new agents are **registered but dormant** per the dry-run-default spec. To bring any one live:

1. Visit `/dashboard/settings/ai-agents/<agent_key>` (e.g. `front_office_copilot`).
2. Paste an Anthropic / OpenAI / Gemini API key into the encrypted field.
3. Toggle `is_enabled` on.
4. The corresponding cabinet apex flips from "Coming soon · Configure key" to "Run …" on the next request; once an output lands, the inline 3-card grid replaces the empty-state.

No cron schedules ship — all 5 agents are user-invoked via `/dashboard/ai/jobs?agent=<agent_key>`. Operator can wire a cron via the existing scheduler UI when ready.

---

## Halt

Sprint MD-4 + MD-5 closed. Awaiting owner review before any follow-up.
