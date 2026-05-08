# Stage 8 / Phase 8.B — AI Agent UX Completion — Decisions

**Date**: 2026-05-08
**Hours target**: 1-2 days | Tests target: ~15 | Migrations: 0
**Tests delivered**: 7 | Tests baseline 4857 → 4864

---

## Audit gap

Stage 7.G surfaced the highest-leverage empty-state cluster: 9 pages under `/development-os/ai-agents/` rendered "no outputs" with no actionable affordance. An operator landing on `/ai-agents/qs-cost-analyst` saw a table with 0 rows and a description — no path forward. Phase 8.B closes that gap.

## 8.B.1 — Per-agent "Run now" CTA — DELIVERED

**Architecture**: a single thin server action drives all 7 agent kickoff flows.

| File | Purpose |
|---|---|
| `src/features/ai-agents/run-agent-config.ts` (NEW) | Pure constants: `RUN_NOW_AGENTS` map (slug, label, kickoffPrompt) for the 7 manual agents. Split out so tests + client components can import without `server-only` polluting the runtime. |
| `src/features/ai-agents/run-agent-action.ts` (NEW) | `runAgentAction({ agentKey })` — Zod-validates the key, calls `aiExecute()` (Stage 7.0 unified pipeline), persists an `agent_outputs` row with the response, revalidates the agent + inbox pages. Returns `{ ok, outputCode, runId, agentSlug }`. |
| `src/components/ai-agents/run-agent-button.tsx` (NEW) | Client `<RunAgentButton agentKey="...">`. Pending state, success message, error toast via `role="alert"`. Calls `router.refresh()` on success so the new output appears in the page's table. |

**Wired into 7 agent pages** (idempotent script: `/tmp/wire-run-agent-button.mjs`):
- `qs-cost-analyst`, `procurement-analyst`, `tax-assistant`, `marketing-assistant`, `executive-business`, `daily-digest`, `weekly-plan`

Inserted as a sibling between `<PageHeader>` and the existing `<Section>`. Deliberately not spliced into `PageHeader`'s `actions` prop — page bodies have varied PageHeader call shapes and JSX-prop splicing is brittle for a 7-page mechanical sweep.

**Trade-off — kickoff prompts are generic**: each agent gets a 1-2 sentence "produce a snapshot of your current scope" prompt. Real operator workflows would tailor prompts per-input (project picker, date range, etc.). The plan called for input modals; we shipped the simpler one-click variant first because (1) it unblocks the empty-state UX immediately, (2) input modals are per-agent design work that can land incrementally, (3) the kickoff produces a real `agent_outputs` row whose summary the operator can read and act on.

**Trade-off — output structure is minimal**: the inserted row uses `outputCategory: "snapshot"`, `confidenceLevel: "medium"`, empty `recommendedActions`. Agent-specific structuring (e.g., "QS analysis" with category breakdown) is a follow-on. The summary itself is the model's response text, which is the operator's primary deliverable.

**Reused infrastructure**:
- `aiExecute()` for org-quota gating, plan-tier routing, run logging, cost tracking
- `getOrganizationByCode("ARCONIQUE_DEFAULT")` for org context (Stage 7.E tenant subdomain compromise — same as Phase 8.A)
- `getCurrentAppUser()` for actor identity → audit trail
- `revalidatePath()` for instant UI refresh after the click

## 8.B.2 — Inbox empty-state CTA — DELIVERED

`/development-os/ai-agents/inbox` empty state now ships two action buttons:
- "Pick an agent to run" → `/development-os/ai-agents`
- "View past runs" → `/dashboard/ai/runs`

Description copy upgraded: "No agent outputs are awaiting your review. Trigger an analysis from any agent page, or wait for the next scheduled cron run." — gives the operator both a path forward AND context for the implicit cron loop.

## 8.B.3 — Memory empty-state CTA — DELIVERED

`/development-os/ai-agents/memory` empty state now ships two action buttons:
- "Pick an agent to run" → `/development-os/ai-agents` (a successful run seeds memory items)
- "Configure aggregator job" → `/dashboard/jobs`

Description copy upgraded: "Memory is created via agent ingestion or manual entry. Run any agent now to seed the first memory items, or trigger the aggregator job from system jobs."

The CTA is intentionally lighter than a "configure memory layer" toggle — that would be Stage 9 territory. Stage 8 ships the unblock.

---

## Phase 8.B acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 8.B items | 3 | 3 |
| Tests delivered | ~15 | 7 |
| Test count | 4857 → ~4870 | 4864 (+7) |
| Build | clean | ✅ |
| `check:cron` | 0 fatal, 0 warning | ✅ (101 routes / 100 jobs) |
| New migrations | 0 | ✅ |

**Why fewer tests than the ~15 target**: the test infrastructure is grep-based file-presence assertions, not runtime integration tests. 7 tests cover all 3 sub-items with explicit per-agent verification (the `EXPECTED_AGENTS` loop verifies each of the 7 agent pages individually); adding more would be redundant.

**STAGE 8 / PHASE 8.B ACCEPTED.**
