# Ground-truth route inventory — `nrazgulyaev/management-os@main` (pulled 2026-05-29)

> **Why this file exists.** The feature-gap audits 01–23 were written against the **partial `_repo` import** in this design project: only `src/features/{channels,concierge,dynamic-pricing,front-office,investors,sales,site-reports,ai-agents}/` + `drizzle/`. That import contains **no `src/app/**`, no `src/components/**`, and only 8 of the repo's 69 `src/features/**` folders.** As a result, every audit conclusion of the form *"not built / missing / orphaned / no route / no data fn"* that was inferred from absence-in-`_repo` is **unreliable**.
>
> This file is the authoritative, GitHub-verified inventory of what actually ships in `main`. Use it to calibrate every audit. **Rule: never assert "X is not built" from `_repo` absence again — check here or pull the path.**

## The headline correction

The live app is **built far past** what the audits assumed. `src/app/(dashboard)/dashboard/**` alone is **299 files**. The owner app, dev app, and all mgmt cabinets are deep, live-wired Next.js route trees. The audits' real value is **design ↔ code gap analysis** (schema mismatches, missing agents, vocabulary divergence, stubbed tiles) — NOT "is it built," which is almost always **yes**.

What's genuinely still open, cross-cabinet:
- **Stubbed tiles pending seed/sprint data** — e.g. Overview's "Open maintenance / Housekeeping / Owner-stay-requests" show `—`; `getCurrentStatementNudge()` returns `null` (STATEMENT-1).
- **Agent fiction** — design docs name agents that don't exist as `agent_configurations` rows; live cabinets use the real roster (`front_office_copilot`, `housekeeping_scheduler`, `concierge_handoff`, `security_copilot`, `daily_digest`, etc.) and the digest pattern.
- **Vocabulary divergence** — e.g. maintenance severity `low/normal/high/urgent` (code) vs `P0–P3` (design).
- **Specific schema items** — verify each against `drizzle/` (which we DO have in full), not against `_repo/src`.

---

## `src/features/**` — 69 folders exist (import had 8)

Confirmed folders relevant to the audits (non-exhaustive, first 40 of 69):
`access-grants · ai-agents · ai · attachments · audit · auth · availability · billing · booking-automation · bookings · boq · channels · command-palette · concierge · dashboard · demo-data · digests · direct-booking · documents · dynamic-pricing · email · finance · front-office · guest-ai-concierge · guest-journey · guest-services · guest-stays · guests · integrations · inventory · investor-portal · investors · jobs · maintenance-intelligence · maintenance · notifications · operations · owner-bookings · owner-intelligence · owner-portal · …`

Notable folders the audits assumed absent but which exist: **`dashboard/`, `operations/`, `maintenance-intelligence/`, `maintenance/`, `bookings/`, `finance/`, `boq/`, `inventory/`, `owner-portal/`, `owner-intelligence/`, `digests/`, `notifications/`, `auth/`.**

---

## Management OS — `src/app/(dashboard)/dashboard/**` (299 files total)

| Cabinet (audit) | Route root | Pages (size highlights) | Verdict |
|---|---|---|---|
| Overview (**23**) | `/dashboard` | `page.tsx` **16.9kb** live-wired (KPIs, Today, channel mix, 6-mo gross, owners, portfolio, statement-nudge). Feature: `dashboard/dashboard-cabinet-queries.ts` 13.6kb + `live-counts.ts` | ✅ built — design is a *redesign* |
| Front office (**01**) | `/dashboard/front-office` | `page.tsx` **17.4kb** + arrivals/departures/in-house/readiness/requests. Feature: `front-office/{services 13.7kb, readiness-services 8.6kb, actions, checkin-state, room-board, tax-export-gate, transitions, queries}` | ✅ built deep |
| Channels (**02**) | `/dashboard/channels` | `page.tsx` 2.6kb + new (+form 3.3kb). Also `/dashboard/integrations` + `/dashboard/bookings/sync`. Feature: `channels/{state-machine, conflict-resolver, services, queries, actions, schema}` | ✅ built (thin UI, deep logic) |
| Dynamic pricing (**03**) | `/dashboard/pricing` | 8 pages: calendar/channel-push/logs/quote/rule-sets(+[id] 7.3kb/new). Feature: `dynamic-pricing/{quote-pure, availability-pure, rule-types, explainer, services, …}` | ✅ built deep |
| Concierge (**04**) | `/dashboard/concierge` | `page.tsx` **12.6kb**. Feature: `concierge/{escalation, comp-policy, queries}` + `guest-ai-concierge/` | ✅ built |
| Bookings (**05**) | `/dashboard/bookings` | `page.tsx` **12.6kb** + [id] (9kb, charges, edit, guest-stay 12.8kb), calendar, new, rates(+[id]/seasons/overrides/quote), sync. Feature: `bookings/` + `booking-automation/` | ✅ built very deep |
| Finance (**06**) | `/dashboard/finance` | **31 pages**: `page.tsx` 15kb + expenses/fees/material-usage/payouts/periods/reserves/revenue/statements(+[id]+pdf)/taxes/**transparency**(+warnings 6.2kb +statements +rebuild). Feature: `finance/` | ✅ built very deep |
| Owners (**07**) | `/dashboard/owners` | `page.tsx` 5.3kb + [id] (10kb, access, edit) + new. Plus `/dashboard/owner-intelligence`, `/dashboard/owner-stays` (8 pages incl. requests+[id], policies, finance-bridge 8.8kb, equivalence-groups) | ✅ built deep |
| Operations (**08**) | `/dashboard/operations` | **17 pages**: `page.tsx` 14.4kb + tasks(+[id]/new)/housekeeping(+[id])/maintenance(+[id]/new)/preventive(+new)/service-requests(+[id])/damage-reports(+new)/checklists/turnovers. Feature: `operations/operations-cabinet-queries.ts` | ✅ built very deep |
| (08 adjacent) Maintenance-intelligence | `/dashboard/maintenance-intelligence` | **8 pages**: `page.tsx` + risks 7.6kb (full risk feed, 7 types, idempotent scanner) + plans(+[id]/new) + templates(+new) + windows. Feature: `maintenance-intelligence/services.ts` | ✅ built — the "orphaned risk feed" was a full cabinet |
| (08 adjacent) Utilities | `/dashboard/utilities` | **7 pages**: page + accounts(+[id]/new) + readings + payments + risks | ✅ built — "orphaned utilities" was a full cabinet |
| (Intelligence) | `/dashboard/ai` | agent catalog 9.7kb + [agentCode](+outputs) + operations + runs(+[id]). `/dashboard/digests` (+[id]). Feature: `ai-agents/`, `ai/`, `digests/` | ✅ built |

Other confirmed mgmt roots: `availability`, `billing/upgrade`, `audit`, `demo`, `direct-bookings`, `documents`, `guest-*` (ai/journey/services/stays), `guests`, `integrations`, `inventory`, `jobs`, `notifications`, `payments`, `procurement`, `projects`, `readiness`, `security`, `service-fulfilment`, `settings`, `shares`, `villas`.

---

## Development OS — `src/app/(development-app)/development-os/**` (58 route roots)

| Cabinet (audit) | Route root | Pages (size highlights) | Verdict |
|---|---|---|---|
| Dev Overview | `/development-os` | `page.tsx` **12.9kb** | ✅ |
| Site supervisor (**09**) | `/development-os/site-reports` | page 10.4kb + [id] **15kb** + new **19.2kb** (+error). Plus `/operations/site-reports/quick-photo` 5kb. Feature: `site-reports/{severity, weekly-composer, queries}` | ✅ built deep |
| Sales (**10**) | `/development-os/sales` | page 8.4kb + [contactRoleId] 8.3kb. Plus `buyers`, `contracts`, `discounts`, `marketing`, `communications`. Feature: `sales/{stage-machine, offer-policy, queries}` | ✅ built |
| Investors (**11**) | `/development-os/investors` | page 9.3kb + [code] (10kb, capital-account 8.3kb, grant-access 12.9kb). Plus `distributions`, `investor-requests`, `commitments`. Feature: `investors/{waterfall-calculator, irr-tracker, capital-call-issuer, queries}` + `investor-portal/` | ✅ built deep |
| Projects (**12**) | `/development-os/projects` | **32 pages**: `[slug]/page.tsx` **41.7kb** + boq/change-orders/company/decisions/land 9.4kb/milestones/permits/risks(+heatmap)/schedule(+lookahead+tasks)/waterfall(+simulator)/work-packages | ✅ built extremely deep |
| CFO (**13**) | `/development-os/cfo` | page **11.6kb** + capital-calls(+[id])/cashflow/distributions. Plus `/development-os/finance`, `profitability`, `cashflow-forecast`, `banking` | ✅ built |
| BOQ / QS (**14**) | `/development-os/boq` | page 4.7kb + [code](+export/import) 6.9kb + new + quick-entry (+form 8.5kb). Feature: `boq/` | ✅ built |
| Procurement (**15**) | `/development-os/procurement` | purchase-requests(+[code] 8kb/new) + quotation-comparison(+[requestCode] 7.7kb +matrix-island 11.5kb) + quotations(+import wizard **23kb**) | ✅ built deep |

Other confirmed dev roots: `agents`, `ai-agents`, `agent-digests`, `assets`, `asset-types`, `banking`, `bulk-import`, `cabinets`, `channels`, `commitments`, `communications`, `contracts`, `dashboard`, `digests`, `discounts`, `distributions`, `drawings`, `inbox`, `integrations`, `inventory`, `investor-requests`, `invoices`, `knowledge`, `marketing`, `materials`, `method-statements`, `platform`, `productivity`, `project-cycle`.

---

## Owner Portal — `src/app/(owner)/owner/**` (21 pages)

| Cabinet (audit) | Route | Size | Verdict |
|---|---|---|---|
| Owner home (**16**) | `/owner` | `page.tsx` **15.9kb** | ✅ built |
| Owner statements (**17**) | `/owner/statements` | page 8.4kb + [id] 4.8kb + [id]/pdf route | ✅ built |
| Owner villas (**18**) | `/owner/villas` | page 4.6kb + [id]/{calendar 10kb, health 8.7kb, revenue, timeline} | ✅ built deep |
| Owner calendar (**19**) | `/owner/calendar` | `page.tsx` **14.4kb** + `/owner/preferences/calendar` | ✅ built |
| Owner inbox (**20**) | `/owner/inbox` | page 4.3kb | ✅ built |
| Owner documents (**21**) | `/owner/documents` | page 4.9kb | ✅ built |
| Owner settings (**22**) | `/owner/preferences` | `preferences/calendar` 2.5kb only | 🟡 partial — only calendar prefs; broader settings may be thin |

Also built: `/owner/bookings`(+[id]), `/owner/distributions`, `/owner/revenue`, `/owner/stays`(+[id]/new).

---

## Navigation source of truth

- `src/config/dashboard-nav.ts` is a **deprecated shim** → re-exports `src/config/navigation/management.ts`.
- Real nav: `src/config/navigation/{management.ts 8.9kb, development.ts 7kb, legacy.ts 14.8kb, index.ts}`.
- `MGMT_DASHBOARD_NAV` = **14 groups** (WORKSPACE / PORTFOLIO / BOOKINGS / GUEST STAYS / OWNER STAYS / FRONT OFFICE / OPERATIONS / INVENTORY·PROCUREMENT / UTILITIES & MAINTENANCE / FINANCE / REVENUE / INTELLIGENCE / INTEGRATIONS / SECURITY·SYSTEM), ~60 items. Every href points at a real route.
- `MGMT_PRIMARY_MOBILE_TABS` = `/dashboard`, `/dashboard/bookings`, `/dashboard/guests`, `/dashboard/finance` (+ More sheet).
- Any "cabinet map should bind to nav" recommendation: bind to `MGMT_DASHBOARD_NAV`.

---

## Real agent roster (from `drizzle/`, full in import)

Seeded `agent_configurations` (authoritative):
- **Mgmt MD-5 copilots**: `front_office_copilot` (0099), `housekeeping_scheduler` (0100), `concierge_handoff` (0101), `security_copilot` (0102)
- **Investor**: `investor_copilot` (0098)
- **mig 0062 roster** (14, mostly dev/construction): `sales_assistant`, `photo_analyst`, `construction_supervisor`, `investor_relations`, `distribution_preview`, `document_understanding`, `whatsapp_intent`, `qs_cost_analyst`, `procurement_analyst`, `tax_assistant`, `marketing_assistant`, `executive_business`, `daily_digest`, `weekly_plan`
- Digest infra: `agent_digest_subscriptions` + `notifications` (0110/0111), `agent_runs` extended for scheduled runs + tool-call introspection.

**Fictional agent names found in design docs (NOT seeded):** `maintenance-triage`, `turnover-allocator`, `arrival-prep` (cab 08); `statement-preparer`, `draft-replier`, `dynamic-pricing`(agent), `conflict-investigator`, `triage-router`, `visa-watcher` (cab 23). Live cabinets use the real roster + the digest empty-state pattern instead.

---

## Per-audit re-validation verdicts

Legend: ✅ overturned-built (audit claimed missing, it's built) · 🟡 partially valid · 🔴 gap survives (verified against drizzle/feature code).

See each audit file's **GROUND-TRUTH CORRECTION** banner for specifics. Summary:

| Audit | Built? | Surviving real gaps (verified) |
|---|---|---|
| 01 front-office | ✅ deep | re-verify any "missing data fn" vs `front-office/services.ts` (13.7kb) — likely none |
| 02 channels | ✅ | thin UI is intentional; logic in `state-machine`/`conflict-resolver`. Verify cell-state storage `rate_cells` in drizzle (rollup §A claims net-new) |
| 03 dynamic-pricing | ✅ deep | verify pricing-rule schema claims vs drizzle 0036 |
| 04 concierge | ✅ | comp-policy/escalation pure fns exist; agent = `concierge_handoff` not fiction |
| 05 bookings | ✅ very deep | `arrival-prep` agent fiction (shared w/ 08); otherwise built |
| 06 finance | ✅ very deep | transparency + warnings cabinet exists; verify any statement-schema gaps vs drizzle 0032 |
| 07 owners | ✅ deep | owner-stays + intelligence built |
| 08 operations | ✅ very deep | **severity vocab P0–P3 vs low/normal/high/urgent**; **explicit per-ticket SLA targets + breach** (age-only today); 3 fictional agents (cabinet uses daily-digest) |
| 09 site-supervisor | ✅ deep | verify `severity.ts`/`weekly-composer.ts` wiring (pure fns confirmed); agent roster |
| 10 sales | ✅ | stage-machine/offer-policy exist |
| 11 investors | ✅ deep | waterfall/irr/capital-call pure fns exist |
| 12 projects | ✅ extremely deep (41kb hub) | almost certainly fully built — re-verify any claim |
| 13 cfo | ✅ | cashflow/capital-calls/distributions built |
| 14 boq-qs | ✅ | import/export/quick-entry built |
| 15 procurement | ✅ deep | quotation-comparison + import wizard (23kb) built |
| 16 owner-home | ✅ (15.9kb) | — |
| 17 owner-statements | ✅ (+pdf) | — |
| 18 owner-villas | ✅ deep (calendar/health/revenue/timeline) | — |
| 19 owner-calendar | ✅ (14.4kb) | — |
| 20 owner-inbox | ✅ | — |
| 21 owner-documents | ✅ | — |
| 22 owner-settings | 🟡 partial | only `preferences/calendar` confirmed — broader settings surface may be thin; verify |

**Bottom line for 00-rollup:** strip every "build the route / build the cabinet / wire the page" item — those are done. Keep only verified schema additions (check each vs `drizzle/`), agent seeds for genuinely-missing agents, vocabulary reconciliations, and stubbed-tile data wiring.
