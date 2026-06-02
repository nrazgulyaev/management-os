# Cross-surface matrix — function → event → table → admin/partner screen

> Companion to the per-cabinet contracts. Every `[cross]` function across all cabinets in one place, so you can see the whole web of dependencies and the **events** that join the two ends. Proposed event names are suggestions for the repo to ratify (answers the recurring Open-Question in the contracts).

Status: `Wire` = both ends exist, connect them · `Build` = the partner handler / event must be built.

## 1 · Cross-surface flow matrix

### Management OS

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `mgmt/bookings` | Arrival-prep agent (auto inspection task) | Mgmt Operations | `booking.confirmed` | `operation_tasks` | Build |
| `mgmt/bookings` | Guest-stay link | Guest Stay Portal | — | `stay_tokens` | Wire |
| `mgmt/bookings` | Channel sync tab | Mgmt Channels | — | `channel_connections` | Wire |
| `mgmt/finance` | Owner statement issued | Owner Portal | `statement.sent` | `owner_statements` | Wire |
| `mgmt/finance` | Record expense → categorised lines | Owner Portal | `statement.line.posted` | `statement_line_items` | Build |
| `mgmt/finance` | Receive owner viewed/acked/disputed | Owner Portal | `statement.viewed / .acknowledged / .disputed` | `owner_statements` · `owner_threads` | Build |
| `mgmt/finance` | Material-usage bridge | Mgmt Operations | `material.usage.posted` | `statement_line_items` | Wire |
| `mgmt/operations` | Villa status / readiness | Mgmt Front office | `villa.readiness.changed` | `readiness_timeline` | Wire |
| `mgmt/operations` | Guest service request intake | Guest Stay Portal | `request.created` | `operation_tasks` | Wire |
| `mgmt/owners` | Grant portal access | Owner Portal | `owner.access.granted` | `owners` | Wire |
| `mgmt/owners` | Owner intelligence insights | Owner Portal · Home | `owner.insight.published` | `owner_insights` | Build |
| `mgmt/owners` | Owner-stays request queue | Owner Portal · Calendar | `ownerstay.requested` | `owner_stay_requests` | Wire |
| `mgmt/channels` | Conflict resolver → winning reservation | Mgmt Bookings | `channel.conflict.resolved` | `reservations` | Wire |
| `mgmt/pricing` | Channel push (accepted rates) | Mgmt Channels | `pricing.rate.pushed` | `rate_cells` · `channel_connections` | Wire |
| `mgmt/front-office` | Approve check-in → issue door code | Guest Stay Portal | `checkin.approved → checkin.code_issued` | `checkins` · `villa_codes` | Build |
| `mgmt/concierge` | Guest session + escalation | Guest Stay Portal | `concierge.escalated` | `guest_ai_concierge_sessions` · `concierge_escalations` | Wire |
| `mgmt/guest-stays` | Issue signed stay token | Guest Stay Portal | `staytoken.issued` | `stay_tokens` | Wire |
| `mgmt/guest-stays` | Guide / catalog edits | Guest Stay Portal | — | `guest_services` | Wire |
| `mgmt/guest-stays` | Service order → vendor | Mgmt Service fulfilment | `order.dispatched` | `service_orders` | Wire |
| `mgmt/distribution` | Reconciliation vs channel cal | Mgmt Channels | `booking.unmatched` | `direct_bookings` | Wire |
| `mgmt/distribution` | Finance bridge (fulfilment → revenue/expense) | Mgmt Finance | `fulfilment.completed` | `statement_line_items` | Wire |
| `mgmt/portfolio` | Project link | Dev OS · Projects | — | `projects` | Wire |
| `mgmt/security-system` | Plan change | Platform Admin | `org.plan.changed` | `organizations` | Wire |
| `mgmt/availability` | Readiness / arrivals-not-ready | Mgmt Front office | `villa.not_ready.alert` | `readiness_timeline` | Wire |
| `mgmt/workspace` | Statement nudge band | Owner Portal | — | `owner_statements` | Wire |
| `mgmt/documents` | Owner-visible doc / bundle | Owner Portal | `document.shared` | `documents` | Wire |
| `mgmt/owner-intelligence` | Rebuild owner_visible_events | Owner Portal · Home | `owner.events.rebuilt` | `owner_visible_events` | Wire |

### Development OS

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `dev/projects` | BOQ feed | Dev BOQ+QS | — | `boq_lines` | Wire |
| `dev/projects` | Milestone complete → call/invoice | Dev CFO | `milestone.completed` | `milestones` | Wire |
| `dev/projects` | Waterfall share | Dev Investors | — | `distributions` | Wire |
| `dev/cfo` | Issue capital call | Investor Portal | `capitalcall.issued` | `capital_calls` · `capital_call_allocations` | Build |
| `dev/cfo` | Distribution run | Investor Portal | `distribution.posted` | `distributions` | Build |
| `dev/sales` | Accepted offer → contract group | Dev Contracts | `offer.accepted` | `offers` · `contracts` | Wire |
| `dev/investors` | Capital-call issuer (pro-rata) | Investor Portal | `capitalcall.issued` | `capital_calls` | Build |
| `dev/investors` | Waterfall / XIRR | Investor Portal | — | `distributions` | Wire |
| `dev/investors` | Capital account / wallet | Investor Portal | — | `commitments` | Wire |
| `dev/investors` | Grant portal access | Investor Portal | `investor.access.granted` | `investors` | Wire |
| `dev/site-reports` | WhatsApp → site report draft | Dev Inbox | `wa.intent.received` | `site_reports` | Build |
| `dev/contracts` | Milestone invoice | Dev CFO | `invoice.issued` | `invoices` | Wire |
| `dev/contracts` | Capital commitments | Dev Investors | — | `commitments` | Wire |
| `dev/knowledge` | Material PO reconcile | Dev Procurement | `po.received` | `material_pos` · `deliveries` | Wire |
| `dev/dev-ops` | WA thread → site report | Dev Site supervisor | `wa.intent.received` | `dev_inbox_threads` | Wire |
| `dev/dev-ops` | Productivity → BOQ calibration | Dev BOQ+QS | `productivity.logged` | `productivity_logs` | Wire |

### Owner Portal

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `owner/home` | What needs you | Mgmt Owner-intelligence | — | `owner_insights` | Wire |
| `owner/villas` | Villa health | Mgmt Operations | — | `maintenance_tickets` | Wire |
| `owner/calendar` | Personal stay request | Mgmt Owners · Owner-stays | `ownerstay.requested` | `owner_stay_requests` | Build |
| `owner/inbox` | Thread (incl. dispute) | Mgmt Inbox | `thread.message.posted` | `owner_threads` · `owner_messages` | Wire |
| `owner/documents` | Owner-visible docs | Mgmt Documents | — | `documents` | Wire |
| `owner/settings` | Payout method change | Mgmt Finance | `owner.payout.changed` | `owners` | Build |

### Platform

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `platform/console` | Read-only impersonation | All customer surfaces | `admin.impersonation.started` | `audit_log` | Wire |
| `platform/console` | Org agent subscription | Customer orgs | `org.agent.enabled` | `platform_agent_configs` | Wire |

### Auth

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `auth/suite` | Sign up → new org (trial) | Platform Admin | `org.created` | `organizations` | Wire |

### Guest Portal

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `guest/stay` | Submit online check-in | Mgmt Front office | `checkin.submitted` | `checkins` | Build |
| `guest/stay` | Villa code reveal | Mgmt Front office | `checkin.code_issued` | `villa_codes` | Build |
| `guest/stay` | Concierge chat / escalation | Mgmt Concierge | `concierge.escalated` | `guest_ai_concierge_sessions` | Wire |
| `guest/stay` | Service order | Mgmt Service fulfilment | `order.created` | `service_orders` | Wire |
| `guest/stay` | Villa request | Mgmt Operations | `request.created` | `operation_tasks` | Wire |

### Investor Portal

| Source | Function | → Partner / admin screen | Event (proposed) | Key tables | Status |
|---|---|---|---|---|---|
| `investor/portal` | Fund capital call | Dev OS · Investors | `capitalcall.funded` | `capital_calls` | Build |
| `investor/portal` | View distribution / waterfall | Dev OS · Investors | — | `distributions` | Wire |

## 2 · Shared-table index (which cabinets touch each table)

| Table | Cabinets that read/write it |
|---|---|
| `audit_log` | `platform/console` |
| `boq_lines` | `dev/projects` |
| `capital_call_allocations` | `dev/cfo` |
| `capital_calls` | `dev/cfo` · `dev/investors` · `investor/portal` |
| `channel_connections` | `mgmt/bookings` · `mgmt/pricing` |
| `checkins` | `mgmt/front-office` · `guest/stay` |
| `commitments` | `dev/investors` · `dev/contracts` |
| `concierge_escalations` | `mgmt/concierge` |
| `contracts` | `dev/sales` |
| `deliveries` | `dev/knowledge` |
| `dev_inbox_threads` | `dev/dev-ops` |
| `direct_bookings` | `mgmt/distribution` |
| `distributions` | `dev/projects` · `dev/cfo` · `dev/investors` · `investor/portal` |
| `documents` | `mgmt/documents` · `owner/documents` |
| `guest_ai_concierge_sessions` | `mgmt/concierge` · `guest/stay` |
| `guest_services` | `mgmt/guest-stays` |
| `investors` | `dev/investors` |
| `invoices` | `dev/contracts` |
| `maintenance_tickets` | `owner/villas` |
| `material_pos` | `dev/knowledge` |
| `milestones` | `dev/projects` |
| `offers` | `dev/sales` |
| `operation_tasks` | `mgmt/bookings` · `mgmt/operations` · `guest/stay` |
| `organizations` | `mgmt/security-system` · `auth/suite` |
| `owner_insights` | `mgmt/owners` · `owner/home` |
| `owner_messages` | `owner/inbox` |
| `owner_statements` | `mgmt/finance` · `mgmt/workspace` |
| `owner_stay_requests` | `mgmt/owners` · `owner/calendar` |
| `owner_threads` | `mgmt/finance` · `owner/inbox` |
| `owner_visible_events` | `mgmt/owner-intelligence` |
| `owners` | `mgmt/owners` · `owner/settings` |
| `platform_agent_configs` | `platform/console` |
| `productivity_logs` | `dev/dev-ops` |
| `projects` | `mgmt/portfolio` |
| `rate_cells` | `mgmt/pricing` |
| `readiness_timeline` | `mgmt/operations` · `mgmt/availability` |
| `reservations` | `mgmt/channels` |
| `service_orders` | `mgmt/guest-stays` · `guest/stay` |
| `site_reports` | `dev/site-reports` |
| `statement_line_items` | `mgmt/finance` · `mgmt/distribution` |
| `stay_tokens` | `mgmt/bookings` · `mgmt/guest-stays` |
| `villa_codes` | `mgmt/front-office` · `guest/stay` |

## 3 · Proposed event catalog

Convention `<entity>.<verb>`. Emit on the state transition (server-side), never on a render. The partner subscribes — no manual sync. Ratify these names in the repo.

| Event | Emitted by | Consumed by |
|---|---|---|
| `admin.impersonation.started` | `platform/console` | All customer surfaces |
| `booking.confirmed` | `mgmt/bookings` | Mgmt Operations |
| `booking.unmatched` | `mgmt/distribution` | Mgmt Channels |
| `capitalcall.funded` | `investor/portal` | Dev OS · Investors |
| `capitalcall.issued` | `dev/cfo` · `dev/investors` | Investor Portal |
| `channel.conflict.resolved` | `mgmt/channels` | Mgmt Bookings |
| `checkin.approved` | `mgmt/front-office` | Guest Stay Portal |
| `checkin.code_issued` | `mgmt/front-office` · `guest/stay` | Guest Stay Portal · Mgmt Front office |
| `checkin.submitted` | `guest/stay` | Mgmt Front office |
| `concierge.escalated` | `mgmt/concierge` · `guest/stay` | Guest Stay Portal · Mgmt Concierge |
| `distribution.posted` | `dev/cfo` | Investor Portal |
| `document.shared` | `mgmt/documents` | Owner Portal |
| `fulfilment.completed` | `mgmt/distribution` | Mgmt Finance |
| `investor.access.granted` | `dev/investors` | Investor Portal |
| `invoice.issued` | `dev/contracts` | Dev CFO |
| `material.usage.posted` | `mgmt/finance` | Mgmt Operations |
| `milestone.completed` | `dev/projects` | Dev CFO |
| `offer.accepted` | `dev/sales` | Dev Contracts |
| `order.created` | `guest/stay` | Mgmt Service fulfilment |
| `order.dispatched` | `mgmt/guest-stays` | Mgmt Service fulfilment |
| `org.agent.enabled` | `platform/console` | Customer orgs |
| `org.created` | `auth/suite` | Platform Admin |
| `org.plan.changed` | `mgmt/security-system` | Platform Admin |
| `owner.access.granted` | `mgmt/owners` | Owner Portal |
| `owner.events.rebuilt` | `mgmt/owner-intelligence` | Owner Portal · Home |
| `owner.insight.published` | `mgmt/owners` | Owner Portal · Home |
| `owner.payout.changed` | `owner/settings` | Mgmt Finance |
| `ownerstay.requested` | `mgmt/owners` · `owner/calendar` | Owner Portal · Calendar · Mgmt Owners · Owner-stays |
| `po.received` | `dev/knowledge` | Dev Procurement |
| `pricing.rate.pushed` | `mgmt/pricing` | Mgmt Channels |
| `productivity.logged` | `dev/dev-ops` | Dev BOQ+QS |
| `request.created` | `mgmt/operations` · `guest/stay` | Guest Stay Portal · Mgmt Operations |
| `statement.line.posted` | `mgmt/finance` | Owner Portal |
| `statement.sent` | `mgmt/finance` | Owner Portal |
| `statement.viewed / .acknowledged / .disputed` | `mgmt/finance` | Owner Portal |
| `staytoken.issued` | `mgmt/guest-stays` | Guest Stay Portal |
| `thread.message.posted` | `owner/inbox` | Mgmt Inbox |
| `villa.not_ready.alert` | `mgmt/availability` | Mgmt Front office |
| `villa.readiness.changed` | `mgmt/operations` | Mgmt Front office |
| `wa.intent.received` | `dev/site-reports` · `dev/dev-ops` | Dev Inbox · Dev Site supervisor |

---

**59 cross-surface flows · 42 shared tables · 40 proposed events.** Build `Build`-status flows first — they are the parity gaps.
