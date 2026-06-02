# Arconique design ↔ code reconciliation report (2026-05-29)

> **Scope:** analysis + plan only — no feature code written this pass. Verified against `management-os@main`, migrations head `0115`. Evidence base: [`_current-app-routes.md`](_current-app-routes.md); per-row verdicts in [`filled/01`](filled/01-management-os.md)–[`04`](filled/04-platform-and-auth.md).
>
> **One-line finding:** the product is ~built. Across ~330 inventory rows, **~268 ✅ Have / ~30 🟡 Partial / ~32 🔴 Missing**. The Missing column is *not* "build the cabinet" — it's (a) a handful of phase-2 tables that shipped but whose **UI/agent/job hasn't caught up**, (b) the one genuinely-absent capability (**cross-cabinet attention feed**), and (c) **design-only storage models** for already-built P2 cabinets (product decisions, not clean builds).

---

## 1 · Headline counts per product

| Product | ✅ Have | 🟡 Partial | 🔴 Missing | of which `[design-only]` (decision) | App-only extras |
|---|---|---|---|---|---|
| **Management OS** (154 rows) | 133 | 11 | 10 | 6 (`rate_cells` grid, `pricing_pins/runs`+comp-set, `comp_offered`, `concierge_escalations`, attention-feed, op-health tiles) | 8 surfaces |
| **Development OS** (99 rows) | 86 | 8 | 5 | 2 (`sales_pipeline_cards*`, `weekly_reports`+`site_frames`) | ~9 surfaces |
| **Owner Portal** (32 rows) | 20 | 4 | 8 | 1 (payout-2FA) | 3 surfaces |
| **Platform + Auth** (49 rows) | 29 | 7 | 9 | 4 (users / feature-flags / support-inbox / Stripe billing) | 4 surfaces |
| **TOTAL** | **~268** | **~30** | **~32** | **~13** | **~24** |

*Counts are row-level and indicative — granularity varies (some rows are whole sub-clusters). The shape is what matters: Have dominates; Missing is concentrated in owner write-surfaces, agent wiring, and design-only storage models.*

**How `[design-only]` rows resolved** (the task's special-attention items): the ones the design *proposed under different names* are **all shipped under the team's names** and marked ✅ — `sla_breaches` (0112), `capital_calls`/`capital_call_allocations` (0113, = design's `capital_call_notices`), `boq_revisions`/`boq_actuals`/`variance_reviews` + `vendor_scores` (0113), `owner_threads`/`owner_messages`/`owner_notification_prefs` (0114), `villa_photos`/`owner_activity_log` (0115), `owner_statements` owner-state ALTER (0112). The ones that **truly don't exist** (verified by grep across all 117 migrations) all belong to already-built cabinets and are the §4 product decisions.

---

## 2 · Top gaps to build (genuinely-wanted 🔴/🟡 — design-only fiction excluded)

Ordered by user value. Effort: **S** ≤1d · **M** 1–3d · **L** 3–6d (senior).

### Management OS
1. **Cross-cabinet attention/triage feed** (Overview) — *the single genuinely-absent product capability.* A unified actionable queue on `/dashboard` (overdue statements, SLA-breached tickets, owner-stay requests awaiting decision, channel conflicts, unpaid capital calls). **Reuse:** existing `operations`, `owner-stays`, `channels/conflict-resolver`, `finance` queries + `sla_breaches`/`owner_insights`. No new core tables (optionally one denormalized `attention_items` view). Cite design [`cabinets/new/mgmt-workspace.html`](cabinets/new/mgmt-workspace.html). **Effort: M.**
2. **Wire Overview stubbed tiles + statement-nudge band** — `getCurrentStatementNudge()` returns `null` ([dashboard-cabinet-queries.ts:406](src/features/dashboard/dashboard-cabinet-queries.ts#L406)); op-health tiles (open-maintenance / housekeeping / owner-stay-requests) render `—`. **Reuse:** the ops/owner-stay queries already exist; just connect them. **Effort: S.**
3. **SLA breach-scan job + severity-vocab reconciliation** (Operations) — `sla_breaches` table (0112) and `computeSlaStatus()` ([maintenance/sla.ts](src/features/maintenance/sla.ts), already wired into the queue UI) both exist, but **nothing writes the table**. Add a scan cron + a canonical mapping between the DB column `low/normal/high/urgent` ([drizzle/0005:193](drizzle/0005_operations_runtime.sql#L193)) and the `P0–P3` `TicketPriority` the SLA layer + design use. **Reuse:** `sla.ts`, `jobs/runner.ts`. **Effort: M.**
4. **Statement-anomaly agent wiring** (Finance) — `statement_anomalies` table (0112) + [statement-anomaly.ts](src/features/ai-agents/statements/statement-anomaly.ts) stub exist; run it post-statement-prepare and surface flags. **Reuse:** `statement-preparer-job.ts`. **Effort: S.**

### Owner Portal (the densest cluster of real gaps — phase-2 tables shipped, UI didn't)
5. **Owner inbox: threads/messages UI + owner-concierge trigger** — `owner_threads`/`owner_messages` (0114) exist but `/owner/inbox` only lists notifications; no `[threadId]` page; [owner-concierge.ts](src/features/ai-agents/owners/owner-concierge.ts) returns `"human"` always with no trigger on message insert. **Reuse:** tables shipped; mirror the mgmt thread UI pattern. **Effort: M.**
6. **Owner notification-prefs UI + payout/profile editing** — `owner_notification_prefs` (0114, 6 toggles) has no UI; only `/owner/preferences/calendar` exists. Add `/owner/preferences` (notifications + profile + 2FA-gated payout edit). **Effort: M.**
7. **Statement dispute flow wiring** — [`dispute-modal.tsx`](src/components/owner-portal/dispute-modal.tsx) exists but isn't called from statement detail; wire it → `owner_threads`. **Effort: S.**
8. **Owner "what needs you" insights on home + villa gallery** — `owner_insights` (0112) and `villa_photos` (0115) tables shipped but unused by the owner UI. Surface insights on `/owner` home; add a gallery to `/owner/villas`. **Effort: S–M.**

### Cross-cutting / Auth
9. **Auth: forgot/reset-password routes + wire SSO + Layer B re-skin** — highest user-facing visibility; `/login` has no SSO button wired and there's no `/forgot-password` or `/reset-password` route. Re-skin is **blocked on design** (no auth design file exists — see §5). **Effort: S** (reset routes + SSO) **/ M** (re-skin after design).
10. **Agent stub→real impl + seed missing configs** (batched, dev-heavy) — code files exist as stubs and aren't seeded/triggered: `arrival-prep`, `channel-listing-matcher`, `incident-classifier`, `weekly-composer`, sales `offer-drafter`/`lead-scorer`/`stage-stale-watcher`, `cashflow-forecaster` wiring. **Reuse:** `registry.ts` codes + cron infra. **Effort: L** (split into 2 PRs).

---

## 3 · Visual / UX deltas (cabinet IS built — design is a better layout → re-skin, not new feature)

| Surface | Built today | Design improves | Cite |
|---|---|---|---|
| **Mgmt Overview** | KPI tiles + scattered modules | Greeting + structured 5-KPI strip + attention band + op-health grid | [`cabinets/new/mgmt-workspace.html`](cabinets/new/mgmt-workspace.html) |
| **Channels** | Flat list (`channels/page.tsx`) | Per-villa × channel **cell grid** w/ 6-state coloring | [`cabinets/mgmt-p2/channels.html`](cabinets/mgmt-p2/channels.html) |
| **Concierge** | Inbox list | Attention-ranked unified inbox w/ comp ladder visualization | [`cabinets/mgmt-p2/concierge.html`](cabinets/mgmt-p2/concierge.html) |
| **Sales (dev)** | Kanban board exists | Polished pipeline + offer modal + payment-ladder visual | [`cabinets/dev-p2/sales.html`](cabinets/dev-p2/sales.html) |
| **Site supervisor** | Capture form (19kb) | Camera-first capture + frame spotlight + weekly composer view | [`cabinets/dev-p2/site-supervisor.html`](cabinets/dev-p2/site-supervisor.html) |
| **Owner portal (all)** | Functional, dense | Narrative tone + bigger type + gallery hero | [`cabinets/owner-p1/*.html`](cabinets/owner-p1/) |
| **Auth (all)** | Pre-Layer-B forms | Layer B re-skin + per-platform bespoke themes | (no design yet — §5) |
| **Mobile parity** | Responsive | Verify against `mobile-pass-*.html` (mgmt-p1/p3, dev-p1/p3, owner-p1) | `mobile-pass-*.html` |

These are **re-skin tasks** — UI-only, no schema/data work.

---

## 4 · Design-only items needing a product decision (build vs drop)

Each is 🔴 *only* because the design proposes a storage model the team didn't build — but the **cabinet is already shipped on a different model**. The question is always *"re-platform onto design's richer model, or keep what shipped and adjust the design?"* — not a blind migration.

| # | Design wants | Cabinet shipped on | Question to answer |
|---|---|---|---|
| 1 | `rate_cells` + `channel_listing_matches` | `channel_connections` (0076) + `channel_reservations` (0077) | Build the per-cell grid storage (enables the design's grid UI + listing-matcher agent), or keep the connection/reservation model and drop the grid? |
| 2 | `pricing_pins` + `pricing_runs` + `comp_villas` + `comp_set_observations` | `pricing_rules` (0036) + `dynamic_pricing_availability_rules` (0026) | Add pin/run audit + comp-set scraping, or keep the rule-engine-only model? |
| 3 | `comp_offered` + `concierge_escalations` | `guest_ai_concierge*` / `service_requests` + computed escalation | Persist comp-ledger + escalation events as audit rows, or keep them computed/ephemeral? |
| 4 | `sales_pipeline_cards` + `sales_stage_events` + `sales_offers` | `sales_schemes` (0036) + `sales_conversation_threads` (0065) + lead/contract/buyer tables + kanban board | Adopt the card/stage-event model, or keep the existing pipeline that already renders a kanban? |
| 5 | `weekly_reports` + `site_frames` view | `site_reports` + `site_report_photos` (0040) | Add the weekly-report aggregate + frame view (enables weekly-composer agent), or keep daily reports only? |
| 6 | Owner payout-edit behind 2FA | `owner_notification_prefs` (0114) only | Is owner self-service payout editing in scope, or stays operator-only? |
| 7 | Platform: users mgmt · feature-flags · support-inbox | none (support-inbox = external by decision) | Build users + flags consoles, or defer? (support-inbox already decided external — Plain/Linear/Intercom) |
| 8 | Platform: per-org Stripe billing collection | blocked on Stripe Connect | Sequencing — after Stripe Connect lands. |

**Variant locks still open** (from rollup §open-questions, still valid): channels (3 variants), pricing (2), concierge (2), site-supervisor (2), sales (2), investors (2) — pick one before any §4 migration.

---

## 5 · App-only extras (app has it, design doesn't — send back to design)

**Highest priority (most-seen / most-divergent):**
- 🔴 **Auth suite** — fully built (`/login`, `/sign-up`, `/setup/admin-bootstrap`, `/setup/mfa`+verify+recovery, portal logins) but **zero design files exist**. Single highest-visibility design gap. *Design this first.*
- **Platform agents `[id]` console** — config + live test-chat + KB upload (pgvector) + Vault key rotation + per-org subscriptions. **Build is richer than design's `09-ai-overview`** → design should catch up.

**Management OS:** maintenance-intelligence cabinet (8 pages) · villa-guides authoring editor · owner-intelligence sub-pages (health/[villaId], reviews, preferences) · guest-AI handoff metrics · notifications deliveries/preferences · security login-attempts/mfa/events · responsibility-scopes · system deployment/storage.

**Development OS:** reports hub (8 analytical reports) · QA/QC + quality-standards + quantity-surveying · schedule resourcing (calendars/resources) · safety · strategic · risk-radar · residual-inventory · revenue-streams · role cabinets (`/cabinets/*`) · deep dev-finance (bank-review/budget/doc-extractions/fx/period-close/reconciliation/rules/tax-reports/transactions) · WhatsApp ops · dev-OS-local platform views.

**Owner Portal:** `/owner/bookings` (+[id]) · `/owner/stays` (+new) · standalone `/owner/revenue`.

---

## 6 · Corrections applied to the prior design-side audit (so they don't recur)

The earlier audit assumed-from-absence against a partial `_repo` mirror. Verified corrections:
- **"Fictional agents" are mostly real.** `statement-preparer` (job + `cron/statements-monthly`), `arrival-prep`, `turnover-allocator` (code file exists), `conflict-investigator`, `visa-watcher`, `owner-concierge` are all in `registry.ts` + have code files. Only `maintenance-triage` is registry-code-only (no agent file). They're **stubs needing impl/trigger**, not absent.
- **Phase-2 tables shipped under team names** (0112–0115) — do not re-create `capital_call_notices`, `sla_breaches`, etc.
- **An earlier verification pass mis-claimed `sales_pipeline_cards` and `weekly_reports` "exist in db schema"** — re-grep across all 117 migrations confirms **they do not** (this report trusts the grep).
- **Dev OS is 269 pages, not "58 roots"** — the prior count was top-level dirs only.

---

## 7 · Proposed PR slicing (dependency-ordered, corrected to current `main`)

> Mirrors the rollup's schema→agents→data-fn→UI ordering, **but corrected**: the rollup's "PR 1 = create 13 tables" is wrong — most of those tables shipped (0112–0115). So the corrected sequence **front-loads data/UI wiring of already-shipped tables**, gates the design-only schema behind a product decision, and treats "build the cabinet/route" as done. Each PR is ~1 reviewable unit. Effort in senior-eng days.

### PR 0 · Decision gate (no code) — ~0.5d
Resolve the §4 product decisions (6 storage-model questions + variant locks) **and** the §5 auth/platform design scope. **Blocks** PR 8 (schema) and the design-dependent re-skins. Output: a one-page decision doc. *Touches: nothing — meeting + `_reconciliation-report.md` §4 answers.*

### PR 1 · `overview-wire(tiles+nudge)` — ~1d · **no schema**
Wire the Overview stubs: implement `getCurrentStatementNudge()`, connect open-maintenance / housekeeping / owner-stay-request tiles to existing queries.
*Touches:* [`src/features/dashboard/dashboard-cabinet-queries.ts`](src/features/dashboard/dashboard-cabinet-queries.ts), `src/app/(dashboard)/dashboard/page.tsx`. Cabinets: Overview.

### PR 2 · `overview-attention-feed` — ~2d · **optional 1 view**
The cross-cabinet attention/triage queue (the one net-new capability). Aggregate overdue statements, SLA breaches, owner-stay requests, channel conflicts, unpaid capital calls into one ranked module. Optionally a denormalized `attention_items` view (read-only) if joins get heavy.
*Touches:* new `src/features/dashboard/attention-feed.ts`, `dashboard/page.tsx`, reads from `operations`/`owner-stays`/`channels`/`finance`/`investors` query layers + `sla_breaches`/`owner_insights`. Cabinets: Overview. **Depends on PR 3** (for SLA-breach rows).

### PR 3 · `ops-sla(scan+vocab)` — ~2d · **no schema** (table exists)
Canonical `low/normal/high/urgent ↔ P0–P3` mapping; breach-scan cron writing `sla_breaches` using `computeSlaStatus()`.
*Touches:* [`src/features/maintenance/sla.ts`](src/features/maintenance/sla.ts), new `src/app/api/cron/maintenance-sla-scan/route.ts` + `src/features/jobs/`, `operations` queries. Cabinets: Operations.

### PR 4 · `owner-write-wave-1(prefs+dispute+insights+gallery)` — ~2.5d · **no schema** (tables exist)
Owner notification-prefs UI + profile edit (`owner_notification_prefs`), wire dispute-modal → `owner_threads`, surface `owner_insights` on home, add `villa_photos` gallery.
*Touches:* `src/app/(owner)/owner/{preferences,statements/[id],page.tsx,villas}`, [`dispute-modal.tsx`](src/components/owner-portal/dispute-modal.tsx). Cabinets: Owner home/statements/villas/settings.

### PR 5 · `owner-inbox(threads+concierge)` — ~2d · **no schema** (tables exist)
Thread list + `[threadId]` message UI on `owner_threads`/`owner_messages`; real `owner-concierge` body + trigger on owner message insert.
*Touches:* `src/app/(owner)/owner/inbox/`, [`owner-concierge.ts`](src/features/ai-agents/owners/owner-concierge.ts), insert trigger/event handler. Cabinets: Owner inbox. **Depends on PR 4** (shared owner-thread wiring).

### PR 6 · `agents-mgmt(impls-batch-1)` — ~2d
Real bodies + triggers for shipped-table mgmt agents: `statement-anomaly` (run post-prepare), `arrival-prep` (on booking confirm), front-office agents (`id-ocr`/`vip-prep`). Seed any missing `agent_configurations` rows.
*Touches:* `src/features/ai-agents/{statements,bookings,front-office}/`, `statement-preparer-job.ts`, seed migration. Cabinets: Finance/Bookings/Front-office.

### PR 7 · `agents-dev(impls-batch-2)` — ~2d
Real bodies for `incident-classifier`, `cashflow-forecaster` (wire into `/cfo/cashflow`), sales `offer-drafter`/`lead-scorer`/`stage-stale-watcher` + seed their configs. **`weekly-composer` deferred to PR 8** (needs `weekly_reports`).
*Touches:* `src/features/ai-agents/{site-reports,cfo,sales}/`, `registry.ts`, seed migration. Cabinets: Site-supervisor/CFO/Sales.

### PR 8 · `design-only-schema+replatform` — ~3–5d · **CONDITIONAL on PR 0**
*Only the tables PR 0 approves.* Per approved cabinet: migration + data-fn rewire + agent enablement. E.g. `rate_cells`→channel grid + `channel-listing-matcher`; `weekly_reports`+`site_frames`→`weekly-composer`; `comp_villas`/`comp_set_observations`→`comp-scraper`; `pricing_pins`/`pricing_runs`; `comp_offered`/`concierge_escalations`; `sales_pipeline_cards*`.
*Touches:* `drizzle/0116+`, the relevant `src/features/{channels,dynamic-pricing,concierge,sales,site-reports}/` query layers + agents. Cabinets: P2 set. Split per-cabinet if more than ~2 are approved.

### PR 9 · `auth(reset+sso+reskin)` — ~1d (routes) + ~2d (re-skin) · **re-skin depends on design**
Add `/forgot-password` + `/reset-password` routes; wire SSO button. Layer B re-skin once the auth design lands.
*Touches:* `src/app/(auth)/`, `src/features/auth/`. Cabinets: Auth.

### PR 10 · `re-skins+mobile-parity` — ~2d · **UI only, depends on design decisions**
Apply approved §3 re-skins (Overview / channels grid / concierge / owner narrative) + verify mobile against `mobile-pass-*.html`.
*Touches:* component/layout files per cabinet; no data work. Cabinets: cross.

### Sequence & critical path
```
PR0 (decision gate)
 ├─► PR1 ─► PR2 ◄─ PR3            (Overview + SLA — no schema, parallelizable after PR1)
 ├─► PR4 ─► PR5                   (Owner write-surfaces — no schema)
 ├─► PR6, PR7                     (agent impls on shipped tables — parallel)
 ├─► PR8  (CONDITIONAL schema/re-platform — gated by PR0)
 └─► PR9, PR10 (auth + re-skins — gated by design landing)
```
**No-schema PRs (1–7) can start immediately** — they wire already-shipped tables and unblock most user value. Schema/re-platform (PR 8) and re-skins (PR 9–10) wait on PR 0 decisions + design. Rough total: **~10–14 senior-eng days** for PRs 1–7 + auth routes; PR 8 adds 3–5d per approved cabinet; re-skins are design-paced.

> **Contrast with rollup's estimate (~13.5d / 10 PRs):** similar total, but **redistributed** — the rollup spent its budget *creating tables that already exist* and *rebuilding live cabinets*; this plan spends it *wiring shipped tables, the attention feed, owner write-surfaces, and agent bodies* — i.e. the work that's actually open.

---

## Files written this pass
- `design-handoff/_current-app-routes.md`
- `design-handoff/filled/01-management-os.md`
- `design-handoff/filled/02-development-os.md`
- `design-handoff/filled/03-owner-portal.md`
- `design-handoff/filled/04-platform-and-auth.md`
- `design-handoff/_reconciliation-report.md` (this file)
