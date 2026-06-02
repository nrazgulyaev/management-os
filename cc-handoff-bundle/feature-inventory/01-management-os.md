# Feature inventory · Management OS

Mark **Status**: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ Skip. Tags: `[core] [detail] [ai] [mobile] [design-only] [cross]`.

---

## P1 · CORE CABINETS

### Bookings — `/dashboard/bookings`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Bookings list `[core]` | Filterable table: guest, villa, dates, channel, status, value | |
| 2 | Status filter pills | confirmed / checked-in / checked-out / cancelled / pending | |
| 3 | Booking detail `[detail]` | Full booking record + charges + timeline | |
| 4 | Per-charge view `[detail]` | charges/[chargeId] breakdown | |
| 5 | Edit booking | inline + full edit form | |
| 6 | Guest-stay link `[cross]` | open the token-gated guest stay for this booking | |
| 7 | Calendar view | month grid, occupancy, drag | |
| 8 | Rate plans | rate plan list + [id] seasons + overrides + quote | |
| 9 | Channel sync tab | sync status per channel | |
| 10 | New booking flow | CTA + form | |
| 11 | ⌘K command palette `[cross]` | jump to booking/guest/villa | |
| 12 | Arrival-prep agent `[ai][design-only]` | auto-build inspection task on confirm (uses operation_tasks) | |

### Finance / Statements — `/dashboard/finance`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Finance home `[core]` | KPIs + period overview | |
| 2 | Owner statements list | per-owner monthly statements | |
| 3 | Statement detail `[detail]` | line items + source groups | |
| 4 | Statement PDF | pdf route generation | |
| 5 | Statement transparency | owner-safe source-group buckets | |
| 6 | Reconciliation warnings | warning layer (info/warn/critical) + open-row dedupe | |
| 7 | Transparency rebuild | recompute owner-facing explanation | |
| 8 | Expenses | list + new | |
| 9 | Fees | management/cleaning fees | |
| 10 | Material-usage bridge `[cross]` | ops material usage → statement lines | |
| 11 | Payouts | payout runs + new | |
| 12 | Periods | accounting periods + close + [id] | |
| 13 | Reserves | reserve balances + ledger | |
| 14 | Revenue | revenue entries | |
| 15 | Taxes | tax records | |
| 16 | Statement anomalies `[ai]` | anomaly detector flags (supplier spike, occupancy drop…) | |
| 17 | Owner-state machine `[design-only]` | owner_state: pending→viewed→acked→disputed + auto-ack TTL | |

### Operations — `/dashboard/operations`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Command center `[core]` | today: arrivals / tickets / turnovers hero | |
| 2 | Villa status board | live readiness tiles (8 states) | |
| 3 | Housekeeping board | today's turnovers, assignee, progress | |
| 4 | Maintenance tickets | list + severity + 8-state status | |
| 5 | Ticket detail `[detail]` | maintenance/[id] + resolve/escalate | |
| 6 | New maintenance ticket | modal/form + photo + villa | |
| 7 | Tasks | operation_tasks list + [id] + new | |
| 8 | Preventive | preventive plans + new | |
| 9 | Service requests | guest-side requests + [id] | |
| 10 | Damage reports | list + new | |
| 11 | Checklists | checklist templates | |
| 12 | Turnovers | turnover board | |
| 13 | SLA model `[design-only]` | P0–P3 targets + computeSlaStatus + sla_breaches (table exists 0112) | |
| 14 | Severity vocabulary | reconcile low/normal/high/urgent ↔ P0–P3 | |
| 15 | Operations Copilot `[ai]` | daily-digest agent empty-state → run history | |

### Owners — `/dashboard/owners`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Owners list `[core]` | all owners + attention flags | |
| 2 | Owner detail `[detail]` | profile + villas + statements | |
| 3 | Owner access | grant portal access per owner | |
| 4 | Edit owner | form | |
| 5 | New owner | onboarding (onboarding_drafts, 14d TTL) | |
| 6 | Owner intelligence `[ai][cross]` | risk-ring + insights (occupancy/ADR/maintenance/renewal) | |
| 7 | Owner-stays cluster `[cross]` | requests + policies + finance-bridge + equivalence-groups | |

---

## P2 · REVENUE & GUEST

### Channels — `/dashboard/channels`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Channel grid `[core]` | per-villa × channel cell-sync state | |
| 2 | 6-state cell FSM | pending/synced/stale/conflict/blocked/booked | |
| 3 | Connect wizard | 3-step channel connection | |
| 4 | Listing matcher `[ai]` | match ext listings → villas (matched/ambiguous/unmatched) | |
| 5 | Conflict resolver | 3-way conflict resolution + modal | |
| 6 | Sync health | feeds status + last sync | |
| 7 | Rate-cells storage `[design-only]` | design wants rate_cells; app built on channel_connections/reservations | |

### Dynamic pricing — `/dashboard/pricing`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Pricing calendar `[core]` | per-night rate curve | |
| 2 | Rule sets | priority rule list + [id] + new | |
| 3 | Rule evaluator | 8-step engine + priority resolution | |
| 4 | Comp set `[ai]` | comp-villa similarity + observations | |
| 5 | Channel push | push rates to channels + logs | |
| 6 | Quote | ad-hoc quote tool | |
| 7 | Pricing pins/runs `[design-only]` | design wants pins + run accept/reject log | |

### Front office — `/dashboard/front-office`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Today `[core]` | arrivals / departures / in-house | |
| 2 | Arrivals | arrival list + check-in FSM (4-step) | |
| 3 | Departures | departure list + checkout | |
| 4 | In-house | current guests | |
| 5 | Readiness `[cross]` | villa readiness gate before arrival | |
| 6 | Tax-export gate | block export until tax fields complete | |
| 7 | Requests | front-office requests | |
| 8 | Agents `[ai]` | id-ocr · visa-watcher · turnover-monitor · vip-prep | |

### Concierge — `/dashboard/concierge`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Concierge inbox `[core]` | active guest sessions ranked by attention | |
| 2 | Comp policy | 500k IDR threshold + approval ladder | |
| 3 | URGENT escalation | 30-min unresponsive → escalate | |
| 4 | AI handoff `[ai]` | concierge_handoff routes routine vs issue | |
| 5 | Comp ledger `[design-only]` | comp_offered per booking (audit trail) | |
| 6 | Escalation log `[design-only]` | concierge_escalations event audit | |

---

## P3 · SECONDARY CLUSTERS (mobile: `mobile-pass-mgmt-p3-full.html`)

### C1 · Guest Stays
**Guest stays** `/dashboard/guest-stays` — stay-token issuance, active/revoked tokens, guide completeness, links to guide/wifi/emergency. `[mobile]`
**Guest services** `/dashboard/guest-services` — service catalog (+categories), orders (+[id]), finance bridge.
**Guest journey** `/dashboard/guest-journey` — timed rules (pre-arrival→in-stay→post-stay), runs log, suggestions, review requests.
**Guest AI** `/dashboard/guest-ai` — HITL concierge oversight, sentiment, take-over.
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Issue signed stay token `[core]` | sign URL, prefill guide, no raw IDs in public URL | |
| 2 | Active/revoked token list | per-villa, check-in window | |
| 3 | Villa guide editor | sections · wifi · emergency · neighborhood | |
| 4 | Service catalog + price | published extras, 3 categories | |
| 5 | Service orders + vendor routing | order → vendor → fulfilment | |
| 6 | Journey rule library by phase | pre/in/post, CTA vs system | |
| 7 | Review requests by channel | post-stay routing | |
| 8 | AI session ranking + take-over `[ai]` | autonomous % · escalations · drafts | |

### C2 · Distribution & Payments
**Direct bookings** `/dashboard/direct-bookings` · **Payments** `/dashboard/payments` · **Service fulfilment** `/dashboard/service-fulfilment` · **Integrations** `/dashboard/integrations`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Direct-booking funnel `[core]` | enquiry → hold → deposit → confirmed | |
| 2 | Holds (48h expiry) | hold list + [id] | |
| 3 | Requests + messages | request [id] + message threads | |
| 4 | Reconciliation vs channel cal `[cross]` | unmatched direct bookings | |
| 5 | Deposit workflow | pending → manually-marked-paid gate | |
| 6 | Payment providers | manual stub · Stripe/Xendit slots | |
| 7 | Webhook envelopes (idempotent) | provider events log | |
| 8 | Fulfilment triage queue | new/triage/awaiting-vendor/scheduled | |
| 9 | Vendor dispatch + ETA | assign vendor, track ETA | |
| 10 | Vendor invoices + ratings | capture invoice + guest rating | |
| 11 | Finance bridge `[cross]` | completed fulfilment → revenue/expense | |
| 12 | Calendar feeds + status | iCal feeds, sync-all, error states | |
| 13 | Conflicts (double-book/orphan) | resolve queue | |
| 14 | Automation rules | block/notify rules | |

### C3 · Portfolio
**Villas** `/dashboard/villas` · **Projects** `/dashboard/projects` · **Ownership shares** `/dashboard/shares`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Villas table `[core]` | status, model, beds, nightly rate, owner-visible | |
| 2 | Villa detail `[detail]` | per-villa record | |
| 3 | Add/edit villa | form | |
| 4 | Projects grid | area, status, concept, villa count | |
| 5 | Project detail `[cross]` | → dev projects | |
| 6 | Ownership shares table | owner, subject, model, share % | |
| 7 | Allocation totals (=100%) `[core]` | per villa/pool, over/under flags | |
| 8 | Add share | form + validation | |

### C4 · Security & System
**Security** `/dashboard/security` · **Jobs** `/dashboard/jobs` · **Notifications** `/dashboard/notifications` · **Audit** `/dashboard/audit` · **Settings** `/dashboard/settings`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Security overview `[core]` | incidents · camera health · patrols · auth events | |
| 2 | Auth-event cadence chart | 7-day bar + critical count | |
| 3 | Camera registry | registry only (no streaming) | |
| 4 | Security copilot `[ai]` | overnight incident brief | |
| 5 | Job definitions (cron) | catalog + enable/disable + run-now | |
| 6 | Job runs log | status, duration, summary | |
| 7 | Notification inbox | queued/sent/failed envelopes (idempotent) | |
| 8 | Audit log | append-only, actor/action/entity/before-after | |
| 9 | Settings · config health | DB/auth/service-role/mode status | |
| 10 | Settings · session + users | identity, roles, manage users | |
| 11 | Settings · subscription | plan, Stripe portal, change plan | |
| 12 | System health | `/dashboard/system/health` | |

### C5 · Availability & Intelligence
**AI assistants** `/dashboard/ai` · **Availability** `/dashboard/availability` · **Readiness** `/dashboard/readiness` · **Digests** `/dashboard/digests`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Agent catalog `[core][ai]` | cards by category, live/planned, runs/24h | |
| 2 | AI KPIs | live · runs 30d · latency · token spend · refusals | |
| 3 | AI inbox | cross-agent suggestions needing review | |
| 4 | Runs audit log | per-invocation status/latency/cost | |
| 5 | Availability board | master calendar, all block types, half-open | |
| 6 | Add calendar block | maintenance/clean/OOO/hold | |
| 7 | Readiness timeline | append-only, current state per villa | |
| 8 | Arrivals-not-ready alert `[cross]` | heads-up + risk scan notification | |
| 9 | Set readiness | close-then-insert state | |
| 10 | Daily digests | agent briefs, all/unread, mark-read | |

---

## NEW CABINETS

### Workspace overview — `/dashboard` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Greeting + 5-KPI strip | occupancy / ADR / RevPAR / gross MTD / net-to-owners | |
| 2 | Today snapshot | arrivals/departures table | |
| 3 | Revenue by channel | MTD share bars | |
| 4 | Six-month gross | bar chart | |
| 5 | Owners YTD payouts | top owners | |
| 6 | Portfolio table | per-project occ/ADR/revenue | |
| 7 | Recent digests tile `[ai]` | agent digest feed | |
| 8 | Statement nudge band | awaiting sign-off CTA | |
| 9 | Attention/triage feed `[design-only]` | unified cross-cabinet actionable queue (NOT built) | |
| 10 | Operational-health tiles `[design-only]` | open-maintenance / housekeeping / owner-stay-requests (stubbed) | |

### Documents — `/dashboard/documents`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Document vault | grouped docs, visibility | |
| 2 | Bundle generation | owner doc bundles | |

### Inventory & procurement — `/dashboard/inventory` + `/procurement`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Stock command | items, low-stock, stockout risk | |
| 2 | Movements | stock in/out | |
| 3 | Suppliers | registry | |
| 4 | Purchase requests + orders | request → PO | |

### Owner intelligence — `/dashboard/owner-intelligence`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Owner risk ring `[ai]` | per-owner risk signals | |
| 2 | Insights feed | occupancy/ADR/maintenance/renewal | |
| 3 | Owner-events rebuild | rebuild owner_visible_events | |

### Utilities — `/dashboard/utilities`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Utility accounts | per-villa meters/accounts | |
| 2 | Readings | append-only meter readings | |
| 3 | Payments | utility payment scheduling | |
| 4 | Risk feed | low-balance / overdue alerts | |

---

## App-only extras (Management)
> List anything your live Mgmt OS does that no design above covers, so we can decide whether to design it:
- …
