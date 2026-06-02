# Feature inventory · Management OS — FILLED 2026-05-29

Status: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ N/A. Verdicts cite real files; absences cite the grep that found nothing. See `../_current-app-routes.md` for the route map.

> **Headline:** of 80 rows, nearly every *cabinet* is built. Gaps cluster in: (a) design's net-new storage models for already-built P2 cabinets (channels/pricing/concierge — all 🔴 by table-absence but a product decision, not a build); (b) the Overview attention-feed + stubbed tiles; (c) a few agent stubs not yet triggered.

---

## P1 · CORE CABINETS

### Bookings — `/dashboard/bookings`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Bookings list `[core]` | ✅ Have | `bookings/page.tsx` + `_list-client.tsx` filterbar |
| 2 | Status filter pills | 🟡 Partial | `_list-client.tsx:70-79` has confirmed/in-house/checked-out/cancelled; design's "pending" pill not surfaced (state exists in badge map) |
| 3 | Booking detail `[detail]` | ✅ Have | `bookings/[id]/page.tsx` |
| 4 | Per-charge view `[detail]` | ✅ Have | `bookings/[id]/charges/[chargeId]/page.tsx` |
| 5 | Edit booking | ✅ Have | `bookings/[id]/edit/page.tsx` |
| 6 | Guest-stay link `[cross]` | ✅ Have | `bookings/[id]/guest-stay/page.tsx` |
| 7 | Calendar view | ✅ Have | `bookings/calendar/page.tsx` |
| 8 | Rate plans | ✅ Have | `bookings/rates/` + `[id]/seasons`+`overrides`+`quote`+`new` |
| 9 | Channel sync tab | ✅ Have | `bookings/sync/page.tsx` |
| 10 | New booking flow | ✅ Have | `bookings/new/page.tsx` |
| 11 | ⌘K command palette `[cross]` | ✅ Have | `features/command-palette/sources.ts` |
| 12 | Arrival-prep agent `[ai][design-only]` | 🟡 Partial | `ai-agents/bookings/arrival-prep.ts` exists + cron `0 * * * *` declared, but **body is a stub** (returns empty); not triggered. Registry-real, not fiction |

### Finance / Statements — `/dashboard/finance`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Finance home `[core]` | ✅ Have | `finance/page.tsx` (15kb, live KPIs) |
| 2 | Owner statements list | ✅ Have | `finance/page.tsx` via `listOwnerStatementsLive` |
| 3 | Statement detail `[detail]` | ✅ Have | `finance/statements/[id]/page.tsx` |
| 4 | Statement PDF | ✅ Have | `finance/statements/[id]/pdf/route.ts` |
| 5 | Statement transparency | ✅ Have | `finance/transparency/page.tsx` (+`statements`) |
| 6 | Reconciliation warnings | ✅ Have | `finance/transparency/warnings/page.tsx` (info/warn/critical) |
| 7 | Transparency rebuild | ✅ Have | `finance/transparency/rebuild/page.tsx` |
| 8 | Expenses | ✅ Have | `finance/expenses/`+`new` |
| 9 | Fees | ✅ Have | `finance/fees/`+`new` |
| 10 | Material-usage bridge `[cross]` | ✅ Have | `finance/material-usage/page.tsx` + `jobs/material-usage-bridge-job.ts` |
| 11 | Payouts | ✅ Have | `finance/payouts/`+`new` |
| 12 | Periods | ✅ Have | `finance/periods/`+`[id]`+`new` (close) |
| 13 | Reserves | ✅ Have | `finance/reserves/`+`balances`+`new` |
| 14 | Revenue | ✅ Have | `finance/revenue/`+`new` |
| 15 | Taxes | ✅ Have | `finance/taxes/`+`new` |
| 16 | Statement anomalies `[ai]` | 🟡 Partial | `statement_anomalies` table (0112) + `ai-agents/statements/statement-anomaly.ts` exist, but **agent is a stub** (returns empty flags), not run post-prepare |
| 17 | Owner-state machine `[design-only]` | ✅ Have | **Shipped under team's name:** `owner_statements` ALTER +owner_state/auto_ack cols (0112) + `owner-statements/state-machine.ts` (AUTO_ACK_DAYS=14). 🟡 caveat: no auto-ack sweeper job found |

### Operations — `/dashboard/operations`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Command center `[core]` | ✅ Have | `operations/page.tsx` (14kb) |
| 2 | Villa status board | ✅ Have | `operations/page.tsx` via `getVillaStatusBoard` |
| 3 | Housekeeping board | ✅ Have | `operations/page.tsx` `getHousekeepingProgress` + `housekeeping/`+`[id]` |
| 4 | Maintenance tickets | ✅ Have | `operations/maintenance/page.tsx`; `severity` col |
| 5 | Ticket detail `[detail]` | ✅ Have | `operations/maintenance/[id]/page.tsx` |
| 6 | New maintenance ticket | ✅ Have | `operations/maintenance/new/page.tsx` |
| 7 | Tasks | ✅ Have | `operations/tasks/`+`[id]`+`new` |
| 8 | Preventive | ✅ Have | `operations/preventive/`+`new` |
| 9 | Service requests | ✅ Have | `operations/service-requests/`+`[id]` |
| 10 | Damage reports | ✅ Have | `operations/damage-reports/`+`new` |
| 11 | Checklists | ✅ Have | `operations/checklists/page.tsx` |
| 12 | Turnovers | ✅ Have | `operations/turnovers/page.tsx` |
| 13 | SLA model `[design-only]` | 🟡 Partial | `sla_breaches` table (0112) ✅ + `computeSlaStatus()` (`maintenance/sla.ts`) ✅ wired into `maintenance-queue.tsx` UI; **but no scan job writes `sla_breaches`** (grep: only schema + a comment reference the table) |
| 14 | Severity vocabulary | 🟡 Partial | **Real divergence:** DB column = `low/normal/high/urgent` (`drizzle/0005:193` CHECK); `sla.ts:22` computes on a separate `P0–P3` `TicketPriority`. Design wants P0–P3 end-to-end → needs a canonical mapping |
| 15 | Operations Copilot `[ai]` | 🟡 Partial | `operations/page.tsx` shows daily-digest agent **empty-state** (static); no run history wired yet |

### Owners — `/dashboard/owners`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Owners list `[core]` | ✅ Have | `owners/page.tsx` |
| 2 | Owner detail `[detail]` | ✅ Have | `owners/[id]/page.tsx` |
| 3 | Owner access | ✅ Have | `owners/[id]/access/page.tsx` |
| 4 | Edit owner | ✅ Have | `owners/[id]/edit/page.tsx` |
| 5 | New owner (onboarding_drafts) | ✅ Have | `owners/new/page.tsx`; `onboarding_drafts` (0112) has `expires_at` (14d) but **no sweeper job** drops expired rows |
| 6 | Owner intelligence `[ai][cross]` | ✅ Have | `/dashboard/owner-intelligence/page.tsx` + `owner_insights` table (0112) |
| 7 | Owner-stays cluster `[cross]` | ✅ Have | `owner-stays/` requests/policies/finance-bridge/equivalence-groups |

---

## P2 · REVENUE & GUEST

### Channels — `/dashboard/channels`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Channel grid `[core]` | 🔴 Missing | `channels/page.tsx` is a flat list (name/key/type/commission/status); **no per-villa×channel cell grid** |
| 2 | 6-state cell FSM | ✅ Have | `channels/state-machine.ts` (pending/synced/stale/conflict/blocked/booked) |
| 3 | Connect wizard | 🟡 Partial | `channels/new/form.tsx` is a single form, **not a 3-step wizard** |
| 4 | Listing matcher `[ai]` | 🔴 Missing | `ai-agents/channels/channel-listing-matcher.ts` is a stub; no `channel_listing_matches` table; not wired |
| 5 | Conflict resolver | ✅ Have | `channels/conflict-resolver.ts` + `/dashboard/integrations/conflicts` |
| 6 | Sync health | 🟡 Partial | `channels/queries.ts` references sync events; no per-feed last-sync metric surfaced on page |
| 7 | Rate-cells storage `[design-only]` | 🔴 Missing | **`rate_cells` absent from all 117 migrations.** Cabinet built on `channel_connections` (0076) + `channel_reservations` (0077). → product decision: re-platform or keep |

### Dynamic pricing — `/dashboard/pricing`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Pricing calendar `[core]` | ✅ Have | `pricing/calendar/page.tsx` |
| 2 | Rule sets | ✅ Have | `pricing/rule-sets/`+`[id]`+`new` |
| 3 | Rule evaluator | ✅ Have | `dynamic-pricing/quote-pure.ts` (base→DOW→occupancy→close-out→channel→clamp + stop-sell + min-stay) |
| 4 | Comp set `[ai]` | 🔴 Missing | No `comp-scraper` wired; `comp_villas`/`comp_set_observations` absent from migrations |
| 5 | Channel push | ✅ Have | `pricing/channel-push/`+`logs` |
| 6 | Quote | ✅ Have | `pricing/quote/page.tsx` |
| 7 | Pricing pins/runs `[design-only]` | 🔴 Missing | **`pricing_pins`/`pricing_runs` absent.** Built on `pricing_rules` (0036). → product decision |

### Front office — `/dashboard/front-office`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Today `[core]` | ✅ Have | `front-office/page.tsx` (17kb) |
| 2 | Arrivals + 4-step FSM | ✅ Have | `front-office/checkin-state.ts` (identity→stay→sign→handover) |
| 3 | Departures | ✅ Have | `front-office/departures/page.tsx` |
| 4 | In-house | ✅ Have | `front-office/in-house/page.tsx` |
| 5 | Readiness `[cross]` | ✅ Have | `front-office/readiness-services.ts` (8-state tone) |
| 6 | Tax-export gate | ✅ Have | `front-office/tax-export-gate.ts` |
| 7 | Requests | ✅ Have | `front-office/requests/page.tsx` |
| 8 | Agents `[ai]` | 🟡 Partial | All 4 files exist (`ai-agents/front-office/{id-ocr,visa-watcher,turnover-monitor,vip-prep}.ts`); verify each is real vs stub (id-ocr/vip-prep likely partial) |

### Concierge — `/dashboard/concierge`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Concierge inbox `[core]` | ✅ Have | `concierge/page.tsx` (12.6kb), sessions+handoffs+safety |
| 2 | Comp policy | ✅ Have | `concierge/comp-policy.ts` (500k IDR threshold + ladder) |
| 3 | URGENT escalation | ✅ Have | `concierge/escalation.ts` (30-min SLA) |
| 4 | AI handoff `[ai]` | ✅ Have | `guest-ai-concierge/handoff-actions.ts`+`handoff-pure.ts`; `concierge_handoff` seeded (0101) |
| 5 | Comp ledger `[design-only]` | 🔴 Missing | **`comp_offered` absent.** Built on `guest_ai_concierge*`/`service_requests`. → product decision |
| 6 | Escalation log `[design-only]` | 🔴 Missing | **`concierge_escalations` absent.** Escalation is computed (`escalation.ts`), not persisted as event rows. → product decision |

---

## P3 · SECONDARY CLUSTERS

### C1 · Guest Stays
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Issue signed stay token `[core]` | ✅ Have | `guest-stays/` + `tokens/`; `guest-stays/schema.ts` |
| 2 | Active/revoked token list | ✅ Have | `guest-stays/tokens/`+`[id]` |
| 3 | Villa guide editor | ✅ Have | `/dashboard/villa-guides/` sections/wifi/emergency/neighborhood |
| 4 | Service catalog + price | ✅ Have | `guest-services/catalog/`+`categories` (3 cats) |
| 5 | Service orders + vendor routing | ✅ Have | `guest-services/orders/`+`[id]` + `service-fulfilment` |
| 6 | Journey rule library by phase | ✅ Have | `guest-journey/rules/`+`[id]`+`new` (pre/in/post) |
| 7 | Review requests by channel | ✅ Have | `guest-journey/reviews/page.tsx` |
| 8 | AI session ranking + take-over `[ai]` | ✅ Have | `guest-ai/sessions/`+`handoffs/`+`metrics` |

### C2 · Distribution & Payments
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Direct-booking funnel `[core]` | ✅ Have | `direct-bookings/page.tsx` (enquiry→hold→deposit→confirmed) |
| 2 | Holds (48h expiry) | ✅ Have | `direct-bookings/holds/`+`[id]`; `jobs/direct-booking-hold-expiry-job.ts` |
| 3 | Requests + messages | ✅ Have | `direct-bookings/requests/`+`[id]`, `messages/`+`[threadId]` |
| 4 | Reconciliation vs channel cal `[cross]` | ✅ Have | `direct-bookings/reconciliation/`+`[id]` |
| 5 | Deposit workflow | ✅ Have | `direct-bookings/deposits/`+`[id]`; `jobs/direct-booking-deposit-expiry-job.ts` |
| 6 | Payment providers | 🟡 Partial | `payments/providers/`+`[id]`+`new`; **only manual stub live** (Stripe/Xendit are slots) |
| 7 | Webhook envelopes (idempotent) | ✅ Have | `payments/webhooks/page.tsx` |
| 8 | Fulfilment triage queue | ✅ Have | `service-fulfilment/fulfilments/`+`[id]` |
| 9 | Vendor dispatch + ETA | ✅ Have | `service-fulfilment/vendors/`+`[id]`+`new` |
| 10 | Vendor invoices + ratings | ✅ Have | `service-fulfilment/invoices/`+`ratings/` |
| 11 | Finance bridge `[cross]` | ✅ Have | `service-fulfilment/finance-bridge/page.tsx` |
| 12 | Calendar feeds + status | ✅ Have | `integrations/calendar-feeds/`+`[id]`+`new`, `calendar-events` |
| 13 | Conflicts (double-book/orphan) | ✅ Have | `integrations/conflicts/page.tsx` |
| 14 | Automation rules | ✅ Have | `integrations/automation/page.tsx` |

### C3 · Portfolio
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Villas table `[core]` | ✅ Have | `villas/page.tsx` |
| 2 | Villa detail `[detail]` | ✅ Have | `villas/[id]/page.tsx` (+`availability`) |
| 3 | Add/edit villa | ✅ Have | `villas/new`, `villas/[id]/edit` |
| 4 | Projects grid | ✅ Have | `projects/page.tsx` |
| 5 | Project detail `[cross]` | ✅ Have | `projects/[slug]/`+`edit` |
| 6 | Ownership shares table | ✅ Have | `shares/page.tsx` |
| 7 | Allocation totals (=100%) `[core]` | ✅ Have | `shares/page.tsx` over/under flags + `features/shares` validation |
| 8 | Add share | ✅ Have | `shares/new/page.tsx` |

### C4 · Security & System
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Security overview `[core]` | ✅ Have | `security/page.tsx` |
| 2 | Auth-event cadence chart | ✅ Have | `security/auth/`, `events/`, `login-attempts/` |
| 3 | Camera registry | ✅ Have | `security/cameras/`+`new` (registry only) |
| 4 | Security copilot `[ai]` | ✅ Have | `security_copilot` seeded (0102); `security-copilot-queries.ts` |
| 5 | Job definitions (cron) | ✅ Have | `jobs/page.tsx`; `jobs/definitions.ts` |
| 6 | Job runs log | ✅ Have | `jobs/runs/`+`[id]`, `locks/` |
| 7 | Notification inbox | ✅ Have | `notifications/inbox/` (+`deliveries`, `preferences`) idempotent |
| 8 | Audit log | ✅ Have | `audit/page.tsx` (append-only) |
| 9 | Settings · config health | ✅ Have | `settings/page.tsx` + `system/health` |
| 10 | Settings · session + users | ✅ Have | `settings/users/`+`[id]`, `team/`+`[user_id]` |
| 11 | Settings · subscription | ✅ Have | `billing/upgrade/page.tsx` |
| 12 | System health | ✅ Have | `system/health/page.tsx` (+`deployment`, `storage`) |

### C5 · Availability & Intelligence
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Agent catalog `[core][ai]` | ✅ Have | `ai/page.tsx` + `[agentCode]`+`outputs` |
| 2 | AI KPIs | ✅ Have | `ai/page.tsx` (live/runs/latency/spend/refusals) |
| 3 | AI inbox | ✅ Have | `ai/operations/page.tsx` (cross-agent suggestions) |
| 4 | Runs audit log | ✅ Have | `ai/runs/`+`[id]` |
| 5 | Availability board | ✅ Have | `availability/page.tsx` (block types) |
| 6 | Add calendar block | ✅ Have | `availability/blocks/new/page.tsx` |
| 7 | Readiness timeline | ✅ Have | `readiness/page.tsx` (append-only, close-then-insert) |
| 8 | Arrivals-not-ready alert `[cross]` | 🟡 Partial | Readiness data exists; verify the heads-up **notification** to front-office is actually dispatched |
| 9 | Set readiness | ✅ Have | `readiness/page.tsx` set-readiness form |
| 10 | Daily digests | ✅ Have | `digests/`+`[id]` (all/unread/mark-read) |

---

## NEW CABINETS

### Workspace overview — `/dashboard`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Greeting + 5-KPI strip | ✅ Have | `dashboard/page.tsx` (occ/ADR/RevPAR/gross MTD/net-to-owners) |
| 2 | Today snapshot | ✅ Have | `dashboard/page.tsx` arrivals/departures |
| 3 | Revenue by channel | ✅ Have | `dashboard-cabinet-queries.ts` |
| 4 | Six-month gross | ✅ Have | `dashboard-cabinet-queries.ts` |
| 5 | Owners YTD payouts | ✅ Have | `dashboard-cabinet-queries.ts` |
| 6 | Portfolio table | ✅ Have | `dashboard-cabinet-queries.ts` |
| 7 | Recent digests tile `[ai]` | ✅ Have | `dashboard/page.tsx` digest feed |
| 8 | Statement nudge band | 🔴 Missing | **`getCurrentStatementNudge()` returns `null`** (`dashboard-cabinet-queries.ts:406-407`) — stubbed |
| 9 | Attention/triage feed `[design-only]` | 🔴 Missing | **No unified cross-cabinet queue exists anywhere** — the single genuinely-absent product capability (the Overview has scattered tiles only) |
| 10 | Operational-health tiles `[design-only]` | 🔴 Missing | open-maintenance / housekeeping / owner-stay-requests render `—` (stubbed); the backing ops/owner-stay queries exist and can be wired |

### Documents — `/dashboard/documents`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Document vault | ✅ Have | `documents/page.tsx` (grouped, visibility) |
| 2 | Bundle generation | ✅ Have | `documents/new` + `src/lib/pdf/` (generate-bundle wired off stub per recent commit) |

### Inventory & procurement — `/dashboard/inventory` + `/procurement`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Stock command | ✅ Have | `inventory/stock/page.tsx` + `jobs/low-stock-job.ts` |
| 2 | Movements | ✅ Have | `inventory/movements/`+`new` |
| 3 | Suppliers | ✅ Have | `inventory/suppliers/`+`new` |
| 4 | Purchase requests + orders | ✅ Have | `procurement/requests/`+`[id]`+`new`, `orders/`+`[id]`+`new` |

### Owner intelligence — `/dashboard/owner-intelligence`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Owner risk ring `[ai]` | ✅ Have | `owner-intelligence/page.tsx` + `owner_insights` (0112) |
| 2 | Insights feed | ✅ Have | `owner-intelligence/` (occupancy/ADR/maintenance/renewal) |
| 3 | Owner-events rebuild | ✅ Have | `owner-intelligence/rebuild/page.tsx` + `jobs/owner-visible-events-rebuild-job.ts` |

### Utilities — `/dashboard/utilities`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Utility accounts | ✅ Have | `utilities/accounts/`+`[id]`+`new` |
| 2 | Readings | ✅ Have | `utilities/readings/page.tsx` |
| 3 | Payments | ✅ Have | `utilities/payments/page.tsx` |
| 4 | Risk feed | ✅ Have | `utilities/risks/page.tsx` |

---

## App-only extras (Management) — built, no design coverage → send back to design
- **Maintenance-intelligence cabinet** (`/dashboard/maintenance-intelligence`, 8 pages: risks / plans+[id]+new / templates+new / windows) — a full predictive-maintenance cabinet; design folds it conceptually into Operations but it has its own surface.
- **Villa-guides authoring** (`/dashboard/villa-guides`: sections / wifi(+migrate) / emergency-contacts / neighborhood) — the *staff-side editor* behind the guest guide; design only shows the guest-facing guide.
- **Owner-intelligence sub-pages** (`health/[villaId]`, `reviews`, `preferences`, `bookings/[id]`) — beyond the design's "risk ring + insights feed".
- **Guest-AI handoff metrics** (`guest-ai/handoffs/metrics`) and **guest-stays security** (`security/events`, `verifications`).
- **Notifications deliveries + preferences** sub-cabinets; **security login-attempts / mfa / events** sub-cabinets.
- **Responsibility scopes** (`settings/responsibility-scopes`) — role-scoped access control surface.
- **System deployment + storage** (`system/deployment`, `system/storage`).
- **Demo/seed page** (`/dashboard/demo`) and mgmt-side **investors index** (`/dashboard/investors`).
