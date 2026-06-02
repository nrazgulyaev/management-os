# Current-app route + service inventory — `management-os@main` (verified 2026-05-29)

> **Evidence base for the reconciliation.** Built by enumerating `page.tsx` under each route group and the backing `src/features/**` service layer, then spot-verifying specific claims (schema tables, agent wiring, stubbed fns) against the real files. Every Have/Partial/Missing verdict in `filled/01–04` and `_reconciliation-report.md` cites a row here or a file path.
>
> **Counts (this pull):** `(dashboard)` = **272** `page.tsx` · `(development-app)` = **269** · `(owner)` = **19** · `(platform-app)` = **9** · `(auth)` = **6** · `(public)` = **23**. Migrations head = **`0115_phase_2_owner_l2.sql`** (117 SQL files). `src/features/**` = **69 folders**. `src/features/ai-agents/**` = **~50 agent code files** across 13 sub-domains.
>
> Granularity: one row per **route root + notable sub-route**; deep leaf trees are summarized with a page count. "Service layer" cites the `src/features/**` folder that backs the route.

---

## 1 · Management OS — `src/app/(dashboard)/dashboard/**` (272 pages)

| Route | What it does today | Service layer |
|---|---|---|
| `/dashboard` | Overview: greeting + 5-KPI strip, today snapshot, revenue-by-channel, 6-mo gross, owners YTD, portfolio table, recent-digests tile. **Stubs:** statement-nudge band (`getCurrentStatementNudge()` returns `null`), op-health tiles (open-maint / housekeeping / owner-stay-requests show `—`). No unified attention/triage feed. | `features/dashboard/dashboard-cabinet-queries.ts:406` (nudge stub), `live-counts.ts` |
| `/dashboard/bookings` (+`[id]`, `[id]/edit`, `[id]/charges/[chargeId]`, `[id]/guest-stay`, `calendar`, `new`, `rates`+`[id]/seasons`+`overrides`+`quote`, `sync`) | Full bookings cabinet: filterable list, detail, per-charge, edit, guest-stay link, month calendar, rate plans/seasons/overrides/quote, channel-sync tab. | `features/bookings`, `booking-automation` |
| `/dashboard/finance` (+`expenses`, `fees`, `material-usage`, `payouts`, `periods`+`[id]`, `reserves`+`balances`, `revenue`, `statements`+`[id]`+`[id]/pdf`, `taxes`, `transparency`+`warnings`+`rebuild`+`statements`) | 31-page finance cabinet: KPIs, owner statements (+PDF route), transparency source-groups, reconciliation warnings (info/warn/critical), expenses/fees/payouts/periods/reserves/revenue/taxes. | `features/finance`, `statements`, `statement-transparency`, `owner-statements` |
| `/dashboard/operations` (+`maintenance`+`[id]`+`new`, `housekeeping`+`[id]`, `tasks`+`[id]`+`new`, `preventive`+`new`, `service-requests`+`[id]`, `damage-reports`+`new`, `checklists`, `turnovers`) | 17-page ops command center: today hero, villa status board, housekeeping board, maintenance tickets (severity `low/normal/high/urgent`), tasks, preventive, service requests, damage, checklists, turnovers. | `features/operations`, `maintenance` |
| `/dashboard/maintenance-intelligence` (+`risks`, `plans`+`[id]`+`new`, `templates`+`new`, `windows`) | Risk feed (7 risk types, idempotent scanner), preventive plans, templates, maintenance windows. | `features/maintenance-intelligence` |
| `/dashboard/owners` (+`[id]`+`access`+`edit`, `new`) | Owners list + attention flags, detail (profile/villas/statements), grant portal access, edit, onboarding (onboarding_drafts 14d TTL). | `features/owners` |
| `/dashboard/owner-intelligence` (+`bookings`+`[id]`, `calendar`, `health`+`[villaId]`, `preferences`, `rebuild`, `revenue`, `reviews`) | Owner risk-ring + insights (owner_insights), per-owner health, owner-visible-events rebuild. | `features/owner-intelligence` |
| `/dashboard/owner-stays` (+`requests`+`[id]`, `policies`+`new`, `finance-bridge`, `equivalence-groups`+`new`) | Owner-stay requests, policies, finance bridge, equivalence groups. | `features/owner-stays` |
| `/dashboard/channels` (+`new`) | Channel list (name/key/type/commission/status) + connect form. **Thin UI** — logic lives in `state-machine.ts` (6-state cell FSM) + `conflict-resolver.ts`. No per-villa×channel grid; no `rate_cells` table. | `features/channels` |
| `/dashboard/pricing` (+`calendar`, `rule-sets`+`[id]`+`new`, `channel-push`, `logs`, `quote`) | Pricing calendar, rule-sets, 8-step quote engine (`quote-pure.ts`), channel-push + logs, ad-hoc quote. No `pricing_pins`/`pricing_runs`/`comp_villas`. | `features/dynamic-pricing` |
| `/dashboard/front-office` (+`arrivals`, `departures`, `in-house`, `readiness`, `requests`) | Today board, 4-step check-in FSM (`checkin-state.ts`), readiness gate, tax-export gate, requests. | `features/front-office` |
| `/dashboard/concierge` | Concierge inbox ranked by attention; comp policy (500k IDR ladder), 30-min escalation. No `comp_offered`/`concierge_escalations` tables. | `features/concierge`, `guest-ai-concierge` |
| `/dashboard/guest-stays` (+`tokens`+`[id]`, `security`+`events`+`verifications`) | Signed stay-token issuance, active/revoked tokens, guest-stay security. | `features/guest-stays` |
| `/dashboard/guest-services` (+`catalog`+`[id]`+`new`, `categories`+`[id]`, `orders`+`[id]`, `finance-bridge`) | Service catalog (3 categories), orders → fulfilment, finance bridge. | `features/guest-services` |
| `/dashboard/guest-journey` (+`rules`+`[id]`+`new`, `runs`, `suggestions`, `reviews`) | Phased journey rules (pre/in/post), runs log, suggestions, review requests. | `features/guest-journey` |
| `/dashboard/guest-ai` (+`sessions`+`[id]`, `handoffs`+`[id]`+`metrics`, `storage`) | HITL concierge oversight, sentiment, take-over, handoff metrics. | `features/guest-ai-concierge` |
| `/dashboard/guests` (+`new`) | Guest directory. | `features/guests` |
| `/dashboard/villa-guides` (+`sections`, `wifi`+`[id]`+`migrate`, `emergency-contacts`, `neighborhood`, `security/wifi-migration`) | Villa guide editor: sections, wifi, emergency contacts, neighborhood. | `features/villa-guides` |
| `/dashboard/direct-bookings` (+`holds`+`[id]`, `deposits`+`[id]`, `requests`+`[id]`, `messages`+`[threadId]`, `reconciliation`+`[id]`, `guest-status`+`[id]`) | Direct-booking funnel (enquiry→hold 48h→deposit→confirmed), message threads, reconciliation vs channel cal. | `features/direct-booking` |
| `/dashboard/payments` (+`providers`+`[id]`+`new`, `webhooks`) | Payment providers (manual stub; Stripe/Xendit slots), idempotent webhook envelopes. **Only manual provider live.** | `features/payments` |
| `/dashboard/service-fulfilment` (+`fulfilments`+`[id]`, `vendors`+`[id]`+`new`, `invoices`, `ratings`, `finance-bridge`) | Fulfilment triage queue, vendor dispatch+ETA, invoices, ratings, finance bridge. | `features/service-fulfilment` |
| `/dashboard/integrations` (+`calendar-feeds`+`[id]`+`new`, `calendar-events`, `conflicts`, `automation`) | iCal feeds + sync, conflict queue, automation rules. | `features/integrations` |
| `/dashboard/inventory` (+`items`+`[id]`+`new`, `categories`, `counts`+`[id]`+`new`, `locations`+`new`, `movements`+`new`, `stock`, `suppliers`+`new`) | Stock command, items, counts, locations, movements, suppliers. | `features/inventory` |
| `/dashboard/procurement` (+`requests`+`[id]`+`new`, `orders`+`[id]`+`new`) | Purchase requests → POs. | `features/procurement` |
| `/dashboard/villas` (+`[id]`+`edit`+`availability`, `new`) | Villa table, detail, edit, availability. | `features/villas` |
| `/dashboard/projects` (+`[slug]`+`edit`, `new`) | Mgmt-side project grid + detail (links to Dev OS). | `features/projects` |
| `/dashboard/shares` (+`new`) | Ownership shares table + allocation totals (=100%, over/under flags). | `features/shares` |
| `/dashboard/availability` (+`blocks`+`new`) | Master calendar, block types, add-block. | `features/availability` |
| `/dashboard/readiness` | Append-only readiness timeline; close-then-insert state per villa. | `features/readiness` |
| `/dashboard/utilities` (+`accounts`+`[id]`+`new`, `readings`, `payments`, `risks`) | Utility accounts/meters, readings, payments, low-balance risk feed. | `features/utilities` |
| `/dashboard/documents` (+`new`) | Document vault (grouped, visibility), bundle generation. | `features/documents`, `src/lib/pdf` |
| `/dashboard/ai` (+`[agentCode]`+`outputs/[outputCode]`, `operations`, `runs`+`[id]`) | Agent catalog (cards by category, live/planned, runs/24h), AI KPIs, runs audit log. | `features/ai-agents`, `ai` |
| `/dashboard/digests` (+`[id]`) | Daily agent digests, all/unread, mark-read. | `features/digests` |
| `/dashboard/notifications` (+`inbox`, `deliveries`, `preferences`) | Notification inbox (queued/sent/failed envelopes, idempotent), delivery log, prefs. | `features/notifications` |
| `/dashboard/security` (+`auth`, `cameras`+`new`, `events`, `login-attempts`, `mfa`) | Security overview, auth-event cadence, camera registry, login attempts, MFA. | `features/security`, `security-baseline` |
| `/dashboard/jobs` (+`runs`+`[id]`, `locks`) | Cron job catalog, run log (status/duration/summary), advisory locks. | `features/jobs` |
| `/dashboard/audit` | Append-only audit log (actor/action/entity/before-after). | `features/audit` |
| `/dashboard/settings` (+`team`+`[user_id]`, `users`+`[id]`, `security`, `account-security`, `ai-agents`+`[agent_key]`, `integrations`, `responsibility-scopes`) | Config health, session+users/roles, per-agent config, responsibility scopes. | `features/system`, `team`, `responsibility-scopes` |
| `/dashboard/system` (`health`, `deployment`, `storage`) | System health/deployment/storage status. | `features/system`, `storage` |
| `/dashboard/billing/upgrade` | Plan upgrade / Stripe portal entry. | `features/billing` |
| `/dashboard/investors` | Mgmt-side investor index (Dev OS owns the deep cabinet). | `features/investors` |
| `/dashboard/housekeeping`, `/dashboard/owner`, `/dashboard/demo` | Standalone housekeeping board; owner-context shim; demo/seed page. | `features/operations`, `demo-data` |

---

## 2 · Development OS — `src/app/(development-app)/development-os/**` (269 pages)

| Route | What it does today | Service layer |
|---|---|---|
| `/development-os` | Executive overview (12.9kb). | `features/projects` etc. |
| `/development-os/dashboard` | Dev command center / cross-project roll-up. | — |
| `/development-os/projects` (+`[slug]` hub +`boq`+`[lineId]`, `change-orders`+`[code]`+`new`, `company`+`[id]`, `decisions`+`[code]`+`new`, `land`, `milestones`, `permits`+`[id]`, `risks`+`heatmap`+`[code]`+`new`, `schedule`+`lookahead`+`tasks`, `waterfall`+`simulator`, `work-packages`+`[code]`+`new`) | Deepest cabinet (32+ pages). `[slug]` hub + BOQ, change orders, org chart, decisions, land, milestones (milestones + milestone_dependencies 0113), permits, risks+heatmap, schedule+lookahead+tasks, waterfall+simulator, work packages. | `features/projects`, `boq` |
| `/development-os/cfo` (+`capital-calls`+`[id]`, `cashflow`, `distributions`) | CFO console KPIs, capital waterfall, P&L-by-project, cash bars, capital calls (capital_calls + capital_call_allocations 0113), distributions. **`cashflow` view notes forecaster agent wiring pending.** | `features/finance`, `investors` |
| `/development-os/finance` (+`bank-accounts`+`[id]`, `bank-review`, `budget`+`[projectId]`, `categories`, `corporate-events`, `document-extractions`+`[id]`, `fx`, `invoices`+`[id]`+`new`, `period-close`, `reconciliation`, `rules`, `shared-costs`+`[id]`, `statement-import`, `tax-reports`, `tax-types`, `transactions`+`[id]`+`import`+`quick-entry`) | Deep dev-finance: bank accounts/review, budgets, doc extractions, FX, invoices, period close, reconciliation, rules, shared-cost allocation, tax types (PPN/PPh/PBB), transactions+import. | `features/finance` |
| `/development-os/boq` (+`[code]`+`import`+`export`, `new`, `quick-entry`) | BOQ list/detail, variance pills (boq_revisions/boq_actuals/variance_reviews 0113), import wizard, export, quick-entry. | `features/boq` |
| `/development-os/procurement` (+`purchase-requests`+`[code]`+`new`, `quotation-comparison`+`[requestCode]`, `quotations`+`import`) | Purchase requests, quotation comparison matrix, quotations + import wizard. | `features/procurement`, `vendors` |
| `/development-os/sales` (+`[contactRoleId]`) | Sales pipeline 6-stage FSM (`stage-machine.ts`), kanban board (`lead-pipeline-board.tsx`), funnel chart, buyer detail. No `sales_pipeline_cards`/`sales_stage_events`/`sales_offers` tables. | `features/sales` |
| `/development-os/investors` (+`[code]`+`capital-account`+`grant-access`) | Investors list, detail, capital account, grant portal access. Waterfall/IRR/capital-call as `ai-agents/investors/*` pure fns. | `features/investors`, `investor-portal` |
| `/development-os/investor-requests` (+`[code]`) | Investor request queue. | `features/investor-portal` |
| `/development-os/site-reports` (+`[id]`, `new`) · `/development-os/operations/site-reports/quick-photo` | Daily site reports, detail (photos/zones/incidents), capture (camera+caption+tag), quick-photo. GPS lat/lng on `site_report_photos`; voice_notes (0105). No `weekly_reports` table / `site_frames` view. | `features/site-reports` |
| `/development-os/banking` (+`[id]`+`new`) | Bank connections (Revolut/Wise API; Mandiri/BCA/manual CSV), detail+sync. | `features/finance` |
| `/development-os/cashflow-forecast` · `/profitability` | 12-mo cashflow forecast; unit profitability table (GENERATED STORED margin) + tone badges. | `features/finance` |
| `/development-os/contracts` (+`[id]`) · `/invoices` · `/discounts` · `/commitments` (+`[id]`) | Contract groups (FSM), milestone invoices, discount approval ladder (role-tier + escalation), capital commitments. | `features/finance`, `investors` |
| `/development-os/knowledge` · `/drawings` (+`[code]`+`distribution`, `new`) · `/method-statements` (+`[code]`+`new`) · `/materials` (+`[poCode]`+`deliveries`, `new`) | Knowledge hub, drawing revision control, method statements (versioning), material POs + deliveries gate. | `features/boq`, `documents` |
| `/development-os/specifications` (+`[code]`+`new`) · `/quality-standards` (+`[code]`+`new`) · `/qa-qc` (+`[code]`+`inspect`+`new`) | Specs, quality standards, QA/QC inspections. | — |
| `/development-os/marketing` (+`attribution`, `campaigns`+`[code]`+`costs`+`new`, `connections`+`[id]`+`new`, `content`+`[code]`+`calendar`+`new`, `conversations`+`[code]`, `conversions`, `dashboard`, `lead-sources`+`[key]`+`new`, `manager-performance`+`[managerId]`) | Marketing pipeline (leads/campaigns/content, 6 channels), lead-source attribution, content calendar+approval, manager performance. | `features/sales` |
| `/development-os/inbox` (+`[threadId]`, `templates`, `auto-responses`) | Unified inbox threads (WA confirmed live; others partial), templates, auto-responses. | — |
| `/development-os/whatsapp` (+`messages`+`[id]`, `templates`, `phone-numbers`) | WhatsApp messaging, templates, phone numbers. | — |
| `/development-os/project-cycle` · `/productivity` (+`log`) | Project-cycle intelligence; productivity per-trade (hours+qty→rate), log entry. | — |
| `/development-os/schedule` (+`calendars`+`[code]`+`new`, `resources`+`[code]`+`new`) | Cross-project schedule, calendars, resources. | — |
| `/development-os/inventory` (+`items`+`[sku]`+`new`, `locations`, `movements`+`new`+`quick-entry`, `stocktake`) · `/warehouse` · `/assets` · `/asset-types` · `/residual-inventory`+`[unitId]` | Dev-side inventory/warehouse/assets/residual inventory. | `features/inventory` |
| `/development-os/vendors` (+`[code]`+`engagements/new`, `new`) | Vendor registry + engagements. | `features/vendors` |
| `/development-os/reports` (+`budget-burn`, `cashflow-waterfall`, `cost-heatmap`, `investor-capital-timeline`, `procurement-delays`, `s-curve`, `sales-funnel`, `workforce-productivity`) | Reporting hub — 8 analytical report routes. | — |
| `/development-os/risk-radar` (+`[code]`) · `/safety`+`new` · `/strategic` | Portfolio risk radar, site safety, strategic planning. | — |
| `/development-os/reservations` · `/revenue-streams` · `/channels` (+`[connectionId]`+`rates`, `calendar`, `conflicts`, `inbox`+`[reservationId]`) | Dev-side reservations, revenue streams, channel connections+rates+inbox. | `features/channels` |
| `/development-os/ai-agents` (+`[agentCode]`, `daily-digest`/`executive-business`/`marketing-assistant`/`procurement-analyst`/`qs-cost-analyst`/`tax-assistant`/`weekly-plan` +`outputs/[code]`, `inbox`, `memory`) · `/agents`+`[agentCode]` · `/agent-digests`+`[id]` · `/digests`+`[code]`+`new` | Dev agent consoles (per-agent pages + outputs), AI inbox, agent memory, digests. | `features/ai-agents`, `digests` |
| `/development-os/cabinets/*` (`cfo-accountant`, `marketing-staff`, `my-cabinet`, `procurement-manager`+`pos`+`rfqs`, `project-manager`, `qs`+`import`, `sales-manager`, `site-supervisor`, `warehouse-manager`) | Role-scoped cabinet landing pages. | `features/responsibility-scopes` |
| `/development-os/platform` (+`api-docs`, `branding`, `organizations`+`[code]`, `usage`) | Dev-OS-local platform/org views (distinct from `(platform-app)`). | — |
| `/development-os/settings/*` (12 routes) · `/bulk-import`+`jobs` · `/communications` · `/integrations` · `/quantity-surveying` | Settings (ai-usage, api-keys, approval-thresholds, webhooks, whatsapp, users-and-roles…), bulk import, comms, integrations, QS workspace. | `features/system` |

---

## 3 · Owner Portal — `src/app/(owner)/owner/**` (19 pages)

| Route | What it does today | Service layer |
|---|---|---|
| `/owner` | Home: portfolio at-a-glance (net/occ/ADR), recent statement card + PDF CTA, upcoming stays + quota widget, per-villa tiles. AI narrative is a 12-mo-average placeholder. **No `owner_insights` "what needs you" surface on home.** | `features/owner-portal` |
| `/owner/statements` (+`[id]`) | Statement list by villa; detail with owner-safe line items + explanation card; PDF via `/api/finance/statements/[id]/pdf`. State machine (`owner-statements/state-machine.ts`, AUTO_ACK 14d). **Dispute modal exists but not wired into detail.** | `features/owner-statements` |
| `/owner/distributions` · `/owner/revenue` | Distribution runs; per-owner revenue. | `features/owner-portal` |
| `/owner/villas` (+`[id]/health`, `[id]/calendar`, `[id]/revenue`, `[id]/timeline`) | Villa list (gradient tiles, **no photo gallery** despite villa_photos 0115), health, calendar, revenue, timeline (owner_activity_log 0115). | `features/owner-portal` |
| `/owner/calendar` (+`/owner/preferences/calendar`) | Month calendar (bookings+stays+blocks), personal stay request, quota tracking, calendar prefs. | `features/owner-stays` |
| `/owner/inbox` | In-app notifications list. **owner_threads/owner_messages schema exists but no thread/message UI** (no `[threadId]` page); owner-concierge agent not triggered. | `features/owner-portal`, `notifications` |
| `/owner/documents` | Owner-visible document list. Bundle download unconfirmed in UI. | `features/documents` |
| `/owner/preferences/calendar` | Calendar prefs only. **No general `/owner/preferences` page, no notification-prefs UI (owner_notification_prefs unused in UI), no payout-edit, no profile edit.** | `features/owner-stays` |
| `/owner/bookings` (+`[id]`) · `/owner/stays` (+`[id]`, `new`) | App-only: owner booking views; owner-stay request flow. | `features/owner-bookings`, `owner-stays` |

---

## 4 · Platform Admin — `src/app/(platform-app)/platform/**` (9 pages)

| Route | What it does today | Service layer |
|---|---|---|
| `/platform` | Hub. Comments confirm support-inbox stays external (Plain/Linear/Intercom); Stripe billing ships after Stripe Connect. | `features/billing`, `system` |
| `/platform/organizations` (+`/platform/[orgCode]`) | Org list (plan/status/MRR/period-ends/products) + status filter pills; org detail. **Comp-flag toggle not surfaced; impersonation button present but disabled/read-only.** | `features/billing` |
| `/platform/revenue` | MRR/ARR hero, active/trial/total, trial→paid 30d, churn 30d, per-tier table. | `features/billing` |
| `/platform/usage` | Total orgs + product split (mgmt/dev/both), per-org plan, AI-usage references. | `features/system` |
| `/platform/agents` (+`[id]`, `new`) | Agent registry (platform_agent_configs), subscriber count + 30d cost, **deep detail [id]: config + test-chat + KB upload (pgvector 0109) + Vault API key + per-org subscriptions.** Richer than design's ai-overview. | `features/ai-agents` (platform scope) |
| `/platform/audit` | Admin audit log (minimal/stub-ish, ~3.6kb). | `features/audit` |
| **Not built** (design drafts only) | `/platform/users`, feature-flags, support-inbox, per-org Stripe billing collection. | — |

---

## 5 · Auth — `src/app/(auth)/**` (6 pages) + portal logins

| Route | What it does today | Service layer |
|---|---|---|
| `/login` (+`form.tsx`) | Email + password (Supabase), x-product routing via PRODUCT_COPY. **No SSO buttons wired.** | `features/auth` |
| `/sign-up` | Org creation (name/email/pwd/org/slug/plan) + 14-day trial. | `features/signup` |
| `/setup/admin-bootstrap` | First-run super_admin creation. | `features/auth` |
| `/setup/mfa` (+`/verify`, `/recovery-codes`) | MFA enroll, 6-digit verify (+resend), recovery codes. | `features/auth` |
| `(investor-portal)/login`, `(buyer-portal)/login` | Bespoke portal logins (separate forms). Owner uses shared `/login` (no bespoke owner login). | `features/auth` |
| **Not built** | `/forgot-password`, `/reset-password` dedicated routes (Supabase reset flow only). | — |

---

## 6 · Out-of-scope built portals (per CLAUDE.md — do NOT design now)

`(guest)` stay portal (28 pages) · `(field)` staff app (5) · `(investor-portal)` (20) · `(buyer-portal)` (7) · `(vendor)` (2) · `(public)` marketing+pricing+legal+direct-book (23). Real and live-wired; excluded from the design wave by decision.

---

## 7 · Agents — code vs registry vs seed (the three-layer truth)

There are **three distinct layers**; "an agent exists" can mean any of them:

1. **Code file** — `src/features/ai-agents/<domain>/<agent>.ts` (~50 files). Many are **stubs** (return empty/hardcoded), e.g. `bookings/arrival-prep.ts`, `channels/channel-listing-matcher.ts`, `statements/statement-anomaly.ts`, `owners/owner-concierge.ts` (returns `"human"` always).
2. **Registry code** — `features/ai-agents/registry.ts` `MGMT_AGENT_CODES` (16) + `DEV_AGENT_CODES` (21), hyphenated form, used by `[agentCode]` routes. Includes `statement-preparer`, `maintenance-triage`, `arrival-prep`, `turnover-allocator`, `owner-concierge` — so these are **NOT fictional**, contra the design-side audit.
3. **Seeded `agent_configurations` rows** — only **~19**, from `drizzle/0062` (14: `sales_assistant`, `photo_analyst`, `construction_supervisor`, `investor_relations`, `distribution_preview`, `document_understanding`, `whatsapp_intent`, `qs_cost_analyst`, `procurement_analyst`, `tax_assistant`, `marketing_assistant`, `executive_business`, `daily_digest`, `weekly_plan`) + `0098–0102` MD-5 copilots (`investor_copilot`, `front_office_copilot`, `housekeeping_scheduler`, `concierge_handoff`, `security_copilot`).
4. **`platform_agent_configs`** — table from `0109`; **no seed rows** — configs are created at runtime via `/platform/agents/new`.

**Cron / job infra is deep:** `src/features/jobs/` (~25 job files incl. `statement-preparer-job.ts`, `material-usage-bridge-job.ts`, `preventive-tasks-job.ts`) + `src/app/api/cron/**` (40+ routes incl. `statements-monthly`, `channel-rates-sync`, `dev-os-*`). `vercel.json` only registers `warm-routes`; the rest are invoked via `cron-handler.ts` / `runner.ts`.

**Genuinely-missing agent wiring (code exists, trigger doesn't):**
- `arrival-prep` — cron declared, body is a stub.
- `channel-listing-matcher`, `comp-scraper`, `pricing-recommender` — stubs; blocked on absent tables.
- `statement-anomaly` — stub; not run post-prepare.
- `owner-concierge` — stub; **no trigger** on `owner_messages` insert.
- `weekly-composer` / `weekly-report-composer` — code exists; no cron + no `weekly_reports` table.
- `maintenance-triage` — **registry code + UI label only, no agent file.**
- `sla_breaches` **breach-scan job** — table (0112) + `computeSlaStatus()` (`maintenance/sla.ts`, wired into `maintenance-queue.tsx` UI) both exist, but **nothing writes the table** (no scan cron).

---

## 8 · Schema deltas confirmed (migrations are truth)

**Shipped under the team's own names (0112–0115)** — design's proposed names were wrong:
`sla_breaches` (0112) · `statement_anomalies`, `owner_insights`, `onboarding_drafts` (0112) · `owner_statements` ALTER +owner_state/auto_ack (0112/0114) · `capital_calls` + `capital_call_allocations` (0113, = design's `capital_call_notices`) · `boq_revisions`+`boq_actuals`+`variance_reviews` (0113) · `vendor_scores` (0113) · `milestones`+`milestone_dependencies`+`rfis` (0113) · `owner_threads`+`owner_messages`+`owner_notification_prefs` (0114) · `documents` visibility widen (0114) · `villa_photos`+`owner_activity_log` (0115).

**Design-proposed, NOT in any migration (verified by grep across all 117 SQL files):**
`rate_cells`, `channel_listing_matches`, `pricing_pins`, `pricing_runs`, `comp_villas`, `comp_set_observations`, `comp_offered`, `concierge_escalations`, `weekly_reports`, `sales_pipeline_cards`, `sales_stage_events`, `sales_offers`, and the `site_frames` / `concierge_requests` views. **All belong to already-built P2 cabinets** (channels/pricing/concierge/sales/site-supervisor) built on different storage models — so each is a "re-platform onto design's richer model?" product decision, not a clean to-do.
