# 20 business-logic questions — stubs only

**Per operator decision Q5(b)**: brief "current behavior" + "gap to
ideal" per question; NOT deep design work. Each question is flagged
for **Stage 10.6.F** (business-logic deep work) — that's where the
actual investigation + fix design happens.

CHECKPOINT 2 stubs are intentionally shallow. They give the operator
a one-paragraph snapshot per topic so the Phase 10.6.F prioritisation
at CHECKPOINT 5 has the right inputs.

---

## 1. Calendar feed sync — how does it work?
**Current**: Stage 6.P-something shipped a `calendar_feeds` table +
sync cron. iCal feeds (Booking.com, Airbnb, Vrbo) are pulled per-feed
on a recurring cadence into `villa_calendar_blocks`.
**Gap**: end-to-end UX from "operator pastes iCal URL" → "blocked
nights show on dashboard calendar" is fragmented across
`/dashboard/integrations/calendar-feeds` (config), `/dashboard/sync`
(observability), `/dashboard/availability` (consumption). No single
"channel sync health" surface.
**For 10.6.F**: unify into one operator surface; document failure
modes.

## 2. Service orders — apply transitions, bridge, status, operation layer
**Current**: Service requests + service orders + fulfilment vendors
form a small FSM (`requested → assigned → in_progress → completed`).
Likely connected to `/dashboard/service-fulfilment` + `/dashboard/guest-services`.
**Gap**: the FSM, the operations bridge, and the financial bridge
likely live in three different files. Operator question implies
discoverability is poor.
**For 10.6.F**: state-machine doc + UX consolidation.

## 3. Financial bridge — how transactions flow
**Current**: `dev_transactions` (per Stage 6 cap-finance) is the
canonical entry; multiple bridges exist (Stripe webhook → transaction,
service-order → transaction, owner-stay → transaction).
**Gap**: the "where did this dollar come from / where does it go"
trace isn't surfaced anywhere.
**For 10.6.F**: build a transaction-trace surface OR document existing
data path.

## 4. Security events — what populates, how viewed
**Current**: `security_events` table (Stage 9.A.1). Populated by
auth events (login_succeeded, login_failed, password_changed, MFA
events). Viewed at `/dashboard/security/events` (likely).
**Gap**: severity / actor / timeline is captured but not visualised
in a SOC-style timeline.
**For 10.6.F**: timeline surface + filter UX.

## 5. Verifications — what это, how used
**Current**: presumably `verifications` table for guest ID checks,
contract signatures, host verifications.
**Gap**: needs file-system search to confirm — operator question
implies fuzzy understanding of the surface.
**For 10.6.F**: locate, document, surface.

## 6. Wi-Fi migration — flow, benefits
**Current**: Stage 6.P1.B introduced AES-256-GCM encryption for
Wi-Fi passwords. `/dashboard/villa-guides/wifi/migrate` runs a sweep
that re-encrypts plaintext rows.
**Gap**: no UX explanation of WHY (compliance? security incident?
audit pressure?). One-time op or recurring?
**For 10.6.F**: docs page + admin runbook.

## 7. Concierge AI — how connected, why sessions tracked
**Current**: `concierge_ai_sessions` table; `/dashboard/concierge-ai`
likely exists. Operator says "не подключен" (not connected).
**Gap**: presumably the AI agent is configured but not invoked
end-to-end (guest message → agent response → handoff if needed).
**For 10.6.F**: end-to-end test + connection wiring.

## 8. AI Handoffs — what, how works, SLA tracking
**Current**: `/dashboard/ai-handoffs` likely; `/dashboard/handoff-sla`.
Stage 9 area.
**Gap**: SLA semantics + escalation path + per-channel routing rules
not documented.
**For 10.6.F**: ops runbook.

## 9. Attachment storage — health metrics meaning
**Current**: `/dashboard/attachment-storage` shows storage health
(quota, error count, etc.). Backed by S3 / Cloudflare R2 / similar.
**Gap**: meaning of each metric not labelled in plain language.
**For 10.6.F**: copy + ops docs.

## 10. Owner stays request approval — workflow
**Current**: `owner_stay_requests` table; FSM `requested → reviewed →
approved/rejected`. Owner submits via `/owner/stays/new`; operator
reviews at `/dashboard/owner-stays/requests`.
**Gap**: SLA, who-approves rules, escalation not surfaced.
**For 10.6.F**: workflow doc + SLA wiring.

## 11. Owner stay policies — fields, business logic
**Current**: `owner_stay_policies` table. Per-villa or per-org policy
governing how many nights per year, blackout periods, etc.
**Gap**: form fields not documented; business logic spread across
form + service.
**For 10.6.F**: policy editor UX + docs.

## 12. Equivalence groups — purpose, configuration
**Current**: `owner_stay_equivalence_groups` table. Purpose: when an
owner books their own villa, "credit" stays on similar villas
(equivalence) so revenue impact is fair.
**Gap**: configuration UX + the math is opaque.
**For 10.6.F**: configurator + worked example.

## 13. Owner stay finance bridge — owner balance, withdrawals
**Current**: `owner_stay_finance_bridge` connects owner stays to the
owner ledger. Balance accrues / decrements per stay night.
**Gap**: "I see X owed but where did it come from" trace missing.
**For 10.6.F**: ledger trace UI.

## 14. Maintenance window suggestions — algorithm
**Current**: `suggestMaintenanceWindows()` in
`maintenance-intelligence/scheduling.ts`. Proposes windows based on
booking gaps + plan cadence + risk.
**Gap**: algorithm not documented for operators; opaque "trust the
suggestion" UX.
**For 10.6.F**: algorithm doc + operator override UX.

## 15. Risk feed scan — what scans, output
**Current**: `/dashboard/maintenance-intelligence/risk-feed`. Operator
says "Scan risks not working".
**Gap**: scan trigger, scan input, scan output are all unclear.
**For 10.6.F**: documentation + repro of the not-working button +
fix.

## 16. Front office ready/today/etc — workflow
**Current**: `/dashboard/front-office` (replatformed in 10.5.A.3.3) +
`/arrivals`, `/departures`, `/in-house`, `/readiness`, `/requests`.
**Gap**: workflow handoff between sub-pages (ready → today → tomorrow
queue) not documented.
**For 10.6.F**: workflow diagram + per-page role doc.

## 17. Direct bookings vs channels — relationship
**Current**: `direct_bookings` table (separate from
channel-mediated `bookings` table?). Likely a Stage 7 area.
**Gap**: when does an operator pick direct vs channel? What's the
financial difference?
**For 10.6.F**: comparison doc + UI to switch.

## 18. Dynamic pricing rule sets — rule engine
**Current**: `pricing_rule_sets` + `pricing_rules` tables. Engine
likely in `src/features/dynamic-pricing/`.
**Gap**: rule-engine semantics (precedence, stacking, conflict
resolution) opaque.
**For 10.6.F**: rule-engine docs + tester surface.

## 19. Guest journey rules — automation
**Current**: `guest_journey_rules` table. Automations triggered on
guest events (booked, checked-in, checked-out, etc.). Likely sends
templated messages or creates tasks.
**Gap**: trigger + action vocabulary not surfaced; rule debugger
absent.
**For 10.6.F**: rule-builder UX + dry-run / replay surface.

## 20. Service fulfilment vendors — pipeline
**Current**: `service_fulfilment_vendors` + per-vendor catalog. Vendor
gets assigned a service order, fulfils it, gets paid via finance
bridge.
**Gap**: vendor performance / quality / on-time-rate not surfaced.
**For 10.6.F**: vendor scorecard surface.

---

## Phase 10.6.F prioritisation seed

CHECKPOINT 5 will rank the 20 against operator priorities. Expected
top-tier (highest customer-impact):

- 7 (Concierge AI not connected) — user-facing AI promise
- 15 (Risk feed scan not working) — operator-flagged broken
- 12-13 (Equivalence groups + finance bridge) — owner-balance correctness
- 14 (Maintenance window algorithm) — credibility of AI suggestions
- 18 (Dynamic pricing rule engine) — revenue-critical

Expected lower-tier (defer past 10.6):
- 5 (Verifications) — low-frequency surface
- 9 (Attachment storage metrics) — observability, not user-blocking
- 19 (Guest journey rules) — power-user feature, not core

**Operator should triage at CHECKPOINT 5** when the full audit is in
front of them.
