# Stage 6.P3.5 — Coverage Audit

**Generated**: 2026-05-07T05:02:18.742Z

> This is a read-only audit. No code, schema, or feature changes were made.
> Source data: `tmp/coverage-audit.json` (574 page analyses · 927 action files · 104 test files).

## Executive Summary

Total sections inventoried: **226**

| State | Count | Description |
|---|---|---|
| 🟢 FULLY_FUNCTIONAL | 80 | Page exists, real DB reads, full CRUD wired (or read-only by design) |
| 🟡 PARTIALLY_FUNCTIONAL | 64 | Page exists with reads, some CRUD missing or no action import detected |
| 🔴 READ_ONLY | 81 | Page exists but no Create/Edit/Delete affordances detected (and not RO-by-design) |
| ⚫ BROKEN | 1 | Sidebar link likely 404s — no page.tsx at any candidate route |
| ⚪ UNKNOWN | 0 | Cannot determine without manual run |

> **Heuristic limitations.** The 🔴 count includes a meaningful number of false-positives that an operator would not actually consider broken. Specifically, the heuristic does not detect:
> - **Workflow pages** (Approve/Reject inbox-style pages — e.g. `/dashboard/direct-bookings/holds` — where the operator's affordance is "approve hold" rather than "create hold"). These typically import `approveX` / `rejectX` server actions which the regex catches, but the affordance label is a domain verb, not a generic Create/Edit/Delete.
> - **Dashboard / hub pages** (read-only metric strips) that aren't tagged `readOnlyByDesign` in the inventory.
> - **Forms inside client components** mounted on the page — the action lives in the child component module which doesn't end with `/actions`.
>
> Treat the 🔴 list as **"plausibly read-only — please spot-check"** rather than a definitive gap. The 🟢 count, by contrast, has very few false-positives — those are confidently fully-functional.

### Top critical gaps

Sections most likely to surprise an operator on first use:

**Broken sidebar links (page.tsx missing — promoted to top of remediation list):**

- **Roadmap (Dev OS) → Warehouse** — tried: `/development-os/warehouse`

**Read-only pages where the operator probably expects to Create/Edit:**

- **Bookings (Mgmt OS) → Calendar** (/dashboard/bookings/calendar) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Bookings (Mgmt OS) → Sync** (/dashboard/bookings/sync) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Guest Stays → Tokens** (/dashboard/guest-stays/tokens) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Guest Services → Orders** (/dashboard/guest-services/orders) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Guest Services → Finance bridge** (/dashboard/guest-services/finance-bridge) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Guest Stay Security → Verifications** (/dashboard/guest-stays/security/verifications) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Guest Stay Security → Wi-Fi migration** (/dashboard/villa-guides/wifi/migrate) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Owner Stays → Requests** (/dashboard/owner-stays/requests) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Maintenance Intelligence → Windows** (/dashboard/maintenance-intelligence/windows) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Utilities → Readings** (/dashboard/utilities/readings) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Utilities → Payments** (/dashboard/utilities/payments) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Front Office → Arrivals** (/dashboard/front-office/arrivals) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Front Office → Departures** (/dashboard/front-office/departures) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Front Office → In-house** (/dashboard/front-office/in-house) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- **Availability → Readiness** (/dashboard/readiness) — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- _… and 66 more (see Per-Section Detail Table)_

### Recommended remediation P-stage

Given the count of broken (1) + read-only (81) sections, the audit recommends inserting **Stage 6.P3.6 — CRUD Coverage Closure** before P4 begins. See "Remediation Plan Proposal" at the bottom for sub-stage breakdown.

### Methodology

The audit script (`scripts/audit-coverage.ts`) walked every `page.tsx` under `src/app/` and emitted a JSON inventory at `tmp/coverage-audit.json`. Per-page heuristics:

- **Read shape**: page imports a `queries.ts` module, calls `getDb()`/`requireDb()`, performs a Drizzle `.from()/.select()`, or renders `<Table>`/`<DataTable>`.
- **Create/Edit/Delete affordance**: page imports a server-action whose name starts with `create`/`update`/`delete`/`archive`/`set`/`run`/etc., AND the page text contains a corresponding label (`Create`/`Edit`/`Archive`/`Delete`).
- **Wiring**: REAL when an action module is imported or a `<form action={...}>` is rendered; MOCKED when read-shape exists without an action import; MISSING when neither.
- **Tests**: counted by grep against test bodies for the route stem or page-file path.

These are heuristics — false negatives are possible (e.g. a page that mounts a client component containing the affordances). When the heuristic flags a section as 🔴 or 🟡, the gap is plausible but worth a manual second look before remediation work begins.

## Per-Section Detail Table

| Section | Path | State | Read | Create | Edit | Delete | Wiring | Tests | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **Portfolio (Mgmt OS)** → Projects | `/dashboard/projects` | 🟢 | PASS | YES | YES | NO | REAL | NONE | no tests reference this route |
| **Portfolio (Mgmt OS)** → Villas | `/dashboard/villas` | 🟢 | PASS | YES | YES | NO | REAL | PARTIAL | — |
| **Owners & Investors (Mgmt OS)** → Owners | `/dashboard/owners` | 🟢 | PASS | YES | YES | NO | REAL | NONE | no tests reference this route |
| **Owners & Investors (Mgmt OS)** → Ownership shares | `/dashboard/shares` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Bookings (Mgmt OS)** → Bookings | `/dashboard/bookings` | 🟢 | PASS | YES | YES | NO | REAL | NONE | no tests reference this route |
| **Bookings (Mgmt OS)** → Calendar | `/dashboard/bookings/calendar` | 🔴 | PASS | YES | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Bookings (Mgmt OS)** → Sync | `/dashboard/bookings/sync` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Bookings (Mgmt OS)** → Rate plans | `/dashboard/bookings/rates` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Bookings (Mgmt OS)** → Channels (Mgmt) | `/dashboard/channels` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Bookings (Mgmt OS)** → Guests | `/dashboard/guests` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Stays** → Overview | `/dashboard/guest-stays` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Guest Stays** → Tokens | `/dashboard/guest-stays/tokens` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Guest Stays** → Villa guides | `/dashboard/villa-guides` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Guest Stays** → Sections (sub-pages) | `/dashboard/villa-guides/sections` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Stays** → Wi-Fi | `/dashboard/villa-guides/wifi` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Stays** → Emergency contacts | `/dashboard/villa-guides/emergency-contacts` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Stays** → Neighborhood | `/dashboard/villa-guides/neighborhood` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Services** → Services | `/dashboard/guest-services` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Guest Services** → Catalog | `/dashboard/guest-services/catalog` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Services** → Orders | `/dashboard/guest-services/orders` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Guest Services** → Finance bridge | `/dashboard/guest-services/finance-bridge` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Guest Stay Security** → Security | `/dashboard/guest-stays/security` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Guest Stay Security** → Security events | `/dashboard/guest-stays/security/events` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Guest Stay Security** → Verifications | `/dashboard/guest-stays/security/verifications` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Guest Stay Security** → Wi-Fi migration | `/dashboard/villa-guides/wifi/migrate` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Guest Stay Security** → Attachment storage | `/dashboard/guest-ai/storage` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Concierge AI** → Concierge AI | `/dashboard/guest-ai` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Concierge AI** → AI sessions | `/dashboard/guest-ai/sessions` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Concierge AI** → AI handoffs | `/dashboard/guest-ai/handoffs` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Concierge AI** → Handoff SLA | `/dashboard/guest-ai/handoffs/metrics` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Owner Stays** → Overview | `/dashboard/owner-stays` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Owner Stays** → Requests | `/dashboard/owner-stays/requests` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Owner Stays** → Policies | `/dashboard/owner-stays/policies` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Owner Stays** → Equivalence groups | `/dashboard/owner-stays/equivalence-groups` | 🟢 | PASS | YES | YES | NO | REAL | NONE | no tests reference this route |
| **Owner Stays** → Finance bridge | `/dashboard/owner-stays/finance-bridge` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Maintenance Intelligence** → Overview | `/dashboard/maintenance-intelligence` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Maintenance Intelligence** → Templates | `/dashboard/maintenance-intelligence/templates` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Maintenance Intelligence** → Plans | `/dashboard/maintenance-intelligence/plans` | 🟢 | PASS | YES | YES | NO | REAL | NONE | no tests reference this route |
| **Maintenance Intelligence** → Windows | `/dashboard/maintenance-intelligence/windows` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Maintenance Intelligence** → Risk feed | `/dashboard/maintenance-intelligence/risks` | 🟢 | PASS | N/A | N/A | N/A | REAL | NONE | no tests reference this route |
| **Utilities** → Overview | `/dashboard/utilities` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Utilities** → Accounts | `/dashboard/utilities/accounts` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Utilities** → Readings | `/dashboard/utilities/readings` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Utilities** → Payments | `/dashboard/utilities/payments` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Utilities** → Risks | `/dashboard/utilities/risks` | 🟡 | PASS | NO | NO | NO | REAL | NONE | missing: Create + Edit + Delete/Archive; no tests reference this route |
| **Front Office** → Today | `/dashboard/front-office` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Front Office** → Arrivals | `/dashboard/front-office/arrivals` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Front Office** → Departures | `/dashboard/front-office/departures` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Front Office** → In-house | `/dashboard/front-office/in-house` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Front Office** → Check-in/out requests | `/dashboard/front-office/requests` | 🟡 | PASS | NO | NO | NO | REAL | NONE | missing: Create + Edit + Delete/Archive; no tests reference this route |
| **Availability** → Availability board | `/dashboard/availability` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Availability** → Calendar blocks | `/dashboard/availability/blocks` | 🟡 | PASS | YES | NO | YES | REAL | NONE | missing: Edit; no tests reference this route |
| **Availability** → Readiness | `/dashboard/readiness` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Security (Mgmt)** → Overview | `/dashboard/security` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Security (Mgmt)** → Cameras | `/dashboard/security/cameras` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Security (Mgmt)** → Authentication | `/dashboard/security/auth` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Security (Mgmt)** → Login attempts | `/dashboard/security/login-attempts` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | — |
| **Security (Mgmt)** → Events | `/dashboard/security/events` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Security (Mgmt)** → MFA factors | `/dashboard/security/mfa` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Integrations (Mgmt)** → Overview | `/dashboard/integrations` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Integrations (Mgmt)** → Calendar feeds | `/dashboard/integrations/calendar-feeds` | 🟢 | PASS | YES | YES | NO | REAL | PARTIAL | — |
| **Integrations (Mgmt)** → Calendar events | `/dashboard/integrations/calendar-events` | 🟢 | PASS | N/A | N/A | N/A | REAL | NONE | no tests reference this route |
| **Integrations (Mgmt)** → Conflicts | `/dashboard/integrations/conflicts` | 🟡 | PASS | NO | NO | NO | REAL | NONE | missing: Create + Edit + Delete/Archive; no tests reference this route |
| **Integrations (Mgmt)** → Automation rules | `/dashboard/integrations/automation` | 🟡 | PASS | NO | YES | NO | REAL | NONE | missing: Create + Delete/Archive; no tests reference this route |
| **Finance (Mgmt)** → Finance | `/dashboard/finance` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Finance (Mgmt)** → Material-usage bridge | `/dashboard/finance/material-usage` | 🟡 | PASS | NO | NO | NO | REAL | NONE | missing: Create + Edit + Delete/Archive; no tests reference this route |
| **Finance (Mgmt)** → Statement transparency | `/dashboard/finance/transparency` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Owner Intelligence** → Overview | `/dashboard/owner-intelligence` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Owner Intelligence** → Calendar | `/dashboard/owner-intelligence/calendar` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Owner Intelligence** → Health reports | `/dashboard/owner-intelligence/health` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Owner Intelligence** → Reviews | `/dashboard/owner-intelligence/reviews` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Owner Intelligence** → Preferences | `/dashboard/owner-intelligence/preferences` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Owner Intelligence** → Rebuild events | `/dashboard/owner-intelligence/rebuild` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Owner Intelligence** → Booking projection | `/dashboard/owner-intelligence/bookings` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Owner Intelligence** → Revenue source mix | `/dashboard/owner-intelligence/revenue` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Guest Journey** → Overview | `/dashboard/guest-journey` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Guest Journey** → Rules | `/dashboard/guest-journey/rules` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Guest Journey** → Runs | `/dashboard/guest-journey/runs` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Guest Journey** → Suggestions | `/dashboard/guest-journey/suggestions` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Guest Journey** → Review requests | `/dashboard/guest-journey/reviews` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Service Fulfilment** → Overview | `/dashboard/service-fulfilment` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Service Fulfilment** → Fulfilments | `/dashboard/service-fulfilment/fulfilments` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Service Fulfilment** → Vendors | `/dashboard/service-fulfilment/vendors` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Service Fulfilment** → Invoices | `/dashboard/service-fulfilment/invoices` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Service Fulfilment** → Ratings | `/dashboard/service-fulfilment/ratings` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Service Fulfilment** → Finance bridge | `/dashboard/service-fulfilment/finance-bridge` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Dynamic Pricing** → Overview | `/dashboard/pricing` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Dynamic Pricing** → Rule sets | `/dashboard/pricing/rule-sets` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Dynamic Pricing** → Calendar | `/dashboard/pricing/calendar` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Dynamic Pricing** → Quote tester | `/dashboard/pricing/quote` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Dynamic Pricing** → Logs | `/dashboard/pricing/logs` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Dynamic Pricing** → Channel push | `/dashboard/pricing/channel-push` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Direct Bookings** → Overview | `/dashboard/direct-bookings` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Direct Bookings** → Holds | `/dashboard/direct-bookings/holds` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Direct Bookings** → Requests | `/dashboard/direct-bookings/requests` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Direct Bookings** → Deposits | `/dashboard/direct-bookings/deposits` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Direct Bookings** → Reconciliation | `/dashboard/direct-bookings/reconciliation` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Direct Bookings** → Guest status | `/dashboard/direct-bookings/guest-status` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Direct Bookings** → Guest messages | `/dashboard/direct-bookings/messages` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Payments (Mgmt)** → Overview | `/dashboard/payments` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Payments (Mgmt)** → Providers | `/dashboard/payments/providers` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Payments (Mgmt)** → Webhooks | `/dashboard/payments/webhooks` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **Operations (Mgmt)** → Command center | `/dashboard/operations` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Operations (Mgmt)** → Tasks | `/dashboard/operations/tasks` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Operations (Mgmt)** → Housekeeping | `/dashboard/operations/housekeeping` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Operations (Mgmt)** → Maintenance | `/dashboard/operations/maintenance` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Operations (Mgmt)** → Preventive | `/dashboard/operations/preventive` | 🟢 | PASS | YES | YES | NO | REAL | NONE | no tests reference this route |
| **Operations (Mgmt)** → Checklists | `/dashboard/operations/checklists` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Operations (Mgmt)** → Service requests | `/dashboard/operations/service-requests` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Operations (Mgmt)** → Damage reports | `/dashboard/operations/damage-reports` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Inventory (Mgmt)** → Stock command | `/dashboard/inventory` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Inventory (Mgmt)** → Items | `/dashboard/inventory/items` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Inventory (Mgmt)** → Stock by location | `/dashboard/inventory/stock` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Inventory (Mgmt)** → Movements | `/dashboard/inventory/movements` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Inventory (Mgmt)** → Locations | `/dashboard/inventory/locations` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Inventory (Mgmt)** → Categories | `/dashboard/inventory/categories` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Inventory (Mgmt)** → Suppliers | `/dashboard/inventory/suppliers` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Inventory (Mgmt)** → Counts | `/dashboard/inventory/counts` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Procurement (Mgmt)** → Procurement | `/dashboard/procurement` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **Procurement (Mgmt)** → Purchase requests | `/dashboard/procurement/requests` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Procurement (Mgmt)** → Purchase orders | `/dashboard/procurement/orders` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Documents (Mgmt)** → Documents | `/dashboard/documents` | 🟡 | PASS | YES | NO | NO | REAL | NONE | missing: Edit + Delete/Archive; no tests reference this route |
| **Intelligence (Mgmt)** → AI assistants | `/dashboard/ai` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **System (Mgmt)** → Background jobs | `/dashboard/jobs` | 🔴 | PASS | NO | YES | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **System (Mgmt)** → Job runs | `/dashboard/jobs/runs` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **System (Mgmt)** → Job locks | `/dashboard/jobs/locks` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **System (Mgmt)** → System health | `/dashboard/system/health` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | — |
| **System (Mgmt)** → Deployment readiness | `/dashboard/system/deployment` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | — |
| **System (Mgmt)** → Demo walkthrough | `/dashboard/demo` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | — |
| **System (Mgmt)** → Notifications | `/dashboard/notifications` | 🟡 | PASS | NO | NO | NO | REAL | NONE | missing: Create + Edit + Delete/Archive; no tests reference this route |
| **System (Mgmt)** → Inbox (system notifications) | `/dashboard/notifications/inbox` | 🟢 | PASS | N/A | N/A | N/A | REAL | NONE | auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route |
| **System (Mgmt)** → Delivery log | `/dashboard/notifications/deliveries` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **System (Mgmt)** → Notification preferences | `/dashboard/notifications/preferences` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **System (Mgmt)** → Audit log | `/dashboard/audit` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | NONE | no tests reference this route |
| **System (Mgmt)** → Settings | `/dashboard/settings` | 🟡 | PASS | NO | NO | NO | REAL | FULL | missing: Create + Edit + Delete/Archive; 1 form action(s) |
| **System (Mgmt)** → Responsibility scopes | `/dashboard/settings/responsibility-scopes` | 🔴 | PASS | NO | YES | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **System (Mgmt)** → My account security | `/dashboard/settings/security` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Dev OS Top Level** → Command center | `/development-os` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Cabinets (Dev OS)** → My cabinet | `/development-os/cabinets/my-cabinet` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Cabinets (Dev OS)** → Site supervisor | `/development-os/cabinets/site-supervisor` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → Project manager | `/development-os/cabinets/project-manager` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → CFO / Accountant | `/development-os/cabinets/cfo-accountant` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → QS / Cost analyst | `/development-os/cabinets/qs` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → Procurement manager | `/development-os/cabinets/procurement-manager` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → Warehouse manager | `/development-os/cabinets/warehouse-manager` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → Marketing staff | `/development-os/cabinets/marketing-staff` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Cabinets (Dev OS)** → Sales manager | `/development-os/cabinets/sales-manager` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Marketing (Dev OS)** → Dashboard | `/development-os/marketing/dashboard` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | auto-classified as dashboard / metrics hub — read-only-by-design |
| **Marketing (Dev OS)** → Lead sources | `/development-os/marketing/lead-sources` | 🟢 | PASS | YES | YES | NO | REAL | FULL | — |
| **Marketing (Dev OS)** → Campaigns | `/development-os/marketing/campaigns` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Marketing (Dev OS)** → Content pipeline | `/development-os/marketing/content` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Marketing (Dev OS)** → Conversations | `/development-os/marketing/conversations` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Marketing (Dev OS)** → Manager performance | `/development-os/marketing/manager-performance` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | — |
| **AI Agents** → Hub | `/development-os/ai-agents` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **AI Agents** → Inbox | `/development-os/ai-agents/inbox` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **AI Agents** → QS Cost Analyst | `/development-os/ai-agents/qs-cost-analyst` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Procurement Analyst | `/development-os/ai-agents/procurement-analyst` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Tax Assistant | `/development-os/ai-agents/tax-assistant` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Marketing Assistant | `/development-os/ai-agents/marketing-assistant` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Executive Business | `/development-os/ai-agents/executive-business` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Daily Digest | `/development-os/ai-agents/daily-digest` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Weekly Plan | `/development-os/ai-agents/weekly-plan` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **AI Agents** → Project Memory | `/development-os/ai-agents/memory` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Executive (Dev OS)** → Dashboard | `/development-os/dashboard` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | — |
| **Executive (Dev OS)** → Visual reports | `/development-os/reports` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | — |
| **Executive (Dev OS)** → Risk radar | `/development-os/risk-radar` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Executive (Dev OS)** → Executive digests | `/development-os/digests` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Build & Sell** → Projects | `/development-os/projects` | 🔴 | PASS | NO | NO | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Assets | `/development-os/assets` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Build & Sell** → Asset types | `/development-os/asset-types` | 🔴 | PASS | NO | YES | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Site reports | `/development-os/site-reports` | 🟢 | PASS | YES | YES | NO | REAL | FULL | — |
| **Build & Sell** → Sales & buyers | `/development-os/buyers` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Sales (legacy) | `/development-os/sales` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Reservations | `/development-os/reservations` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Contracts | `/development-os/contracts` | 🔴 | PASS | NO | NO | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Invoices | `/development-os/invoices` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Build & Sell** → Discounts | `/development-os/discounts` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Capital** → Finance | `/development-os/finance` | 🟡 | PASS | NO | NO | NO | REAL | FULL | missing: Create + Edit + Delete/Archive |
| **Capital** → Invoices | `/development-os/finance/invoices` | 🟡 | PASS | YES | NO | NO | REAL | FULL | missing: Edit + Delete/Archive |
| **Capital** → Tax types | `/development-os/finance/tax-types` | 🟡 | PASS | NO | NO | NO | REAL | FULL | missing: Create + Edit + Delete/Archive |
| **Capital** → Tax reports | `/development-os/finance/tax-reports` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Capital** → Shared costs | `/development-os/finance/shared-costs` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Capital** → Document extraction | `/development-os/finance/document-extractions` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Capital** → Investors | `/development-os/investors` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Capital** → Investor requests | `/development-os/investor-requests` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Capital** → Commitments | `/development-os/commitments` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Capital** → Distributions | `/development-os/distributions` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Capital** → Revenue streams | `/development-os/revenue-streams` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Strategic** → Project cycle intelligence | `/development-os/project-cycle` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Strategic** → Unit profitability | `/development-os/profitability` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Strategic** → Cashflow forecast | `/development-os/cashflow-forecast` | 🔴 | PASS | NO | NO | NO | MOCKED | NONE | read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route |
| **Operations (Dev OS)** → Vendors | `/development-os/vendors` | 🟢 | PASS | YES | YES | NO | REAL | FULL | — |
| **Operations (Dev OS)** → Materials | `/development-os/materials` | 🟢 | PASS | YES | YES | NO | REAL | FULL | — |
| **Operations (Dev OS)** → Deliveries | `/development-os/materials/deliveries` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Operations (Dev OS)** → Safety incidents | `/development-os/safety` | 🟡 | PASS | YES | NO | NO | REAL | FULL | missing: Edit + Delete/Archive |
| **Operations (Dev OS)** → Procurement (Dev OS) | `/development-os/procurement` | 🟡 | FAIL | NO | NO | NO | MISSING | FULL | missing: Create + Edit + Delete/Archive |
| **Operations (Dev OS)** → Purchase requests | `/development-os/procurement/purchase-requests` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Operations (Dev OS)** → Quotations | `/development-os/procurement/quotations` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Communications (Dev OS)** → WhatsApp messages | `/development-os/whatsapp` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Communications (Dev OS)** → WhatsApp templates | `/development-os/whatsapp/templates` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Communications (Dev OS)** → Phone numbers | `/development-os/whatsapp/phone-numbers` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Communications (Dev OS)** → Notification rules | `/development-os/settings/notifications` | 🟡 | FAIL | NO | NO | NO | MISSING | FULL | missing: Create + Edit + Delete/Archive |
| **Roadmap (Dev OS)** → Quantity surveying _(soon)_ | `/development-os/quantity-surveying` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Roadmap (Dev OS)** → Warehouse _(soon)_ | `/development-os/warehouse` | ⚫ | FAIL | NO | NO | NO | MISSING | NONE | page.tsx not found at any candidate route — sidebar link likely 404s |
| **Roadmap (Dev OS)** → QA / QC | `/development-os/qa-qc` | 🟡 | PASS | YES | NO | NO | REAL | FULL | missing: Edit + Delete/Archive |
| **Roadmap (Dev OS)** → Schedule | `/development-os/schedule` | 🔴 | PASS | NO | NO | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Roadmap (Dev OS)** → Calendars | `/development-os/schedule/calendars` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Roadmap (Dev OS)** → Resources | `/development-os/schedule/resources` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Roadmap (Dev OS)** → Productivity | `/development-os/productivity` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Knowledge Base** → Drawings | `/development-os/drawings` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Knowledge Base** → BOQ | `/development-os/boq` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Knowledge Base** → Specifications | `/development-os/specifications` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Knowledge Base** → Method statements | `/development-os/method-statements` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Knowledge Base** → Quality standards | `/development-os/quality-standards` | 🟡 | PASS | YES | NO | NO | REAL | PARTIAL | missing: Edit + Delete/Archive |
| **Settings (Dev OS)** → General settings | `/development-os/settings` | 🔴 | PASS | NO | NO | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Settings (Dev OS)** → AI usage | `/development-os/settings/ai-usage` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | FULL | — |
| **Settings (Dev OS)** → Notifications | `/development-os/settings/notifications` | 🟡 | FAIL | NO | NO | NO | MISSING | FULL | missing: Create + Edit + Delete/Archive |
| **Settings (Dev OS)** → Approval thresholds | `/development-os/settings/approval-thresholds` | 🟡 | PASS | NO | NO | NO | REAL | FULL | missing: Create + Edit + Delete/Archive |
| **Settings (Dev OS)** → WhatsApp setup | `/development-os/settings/whatsapp` | 🟡 | PASS | NO | NO | NO | REAL | FULL | missing: Create + Edit + Delete/Archive |
| **Settings (Dev OS)** → API keys | `/development-os/settings/api-keys` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Settings (Dev OS)** → Webhooks | `/development-os/settings/webhooks` | 🔴 | PASS | NO | YES | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Settings (Dev OS)** → Data export | `/development-os/settings/data-export` | 🟡 | PASS | NO | NO | NO | REAL | PARTIAL | missing: Create + Edit + Delete/Archive |
| **Platform (Dev OS)** → Organizations | `/development-os/platform/organizations` | 🔴 | PASS | NO | NO | NO | MOCKED | FULL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |
| **Platform (Dev OS)** → Usage metrics | `/development-os/platform/usage` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | — |
| **Platform (Dev OS)** → API docs | `/development-os/platform/api-docs` | 🟢 | PASS | N/A | N/A | N/A | MOCKED | PARTIAL | — |
| **Platform (Dev OS)** → Branding | `/development-os/platform/branding` | 🔴 | PASS | NO | NO | NO | MOCKED | PARTIAL | read-only — no Create/Edit/Delete affordances detected (no action wiring imported) |

## Domain-grouped Gap Analysis

### AI Agents — 10 🔴 (10 sections)

- 🔴 **Hub** — `/development-os/ai-agents` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Inbox** — `/development-os/ai-agents/inbox` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **QS Cost Analyst** — `/development-os/ai-agents/qs-cost-analyst` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Procurement Analyst** — `/development-os/ai-agents/procurement-analyst` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Tax Assistant** — `/development-os/ai-agents/tax-assistant` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Marketing Assistant** — `/development-os/ai-agents/marketing-assistant` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Executive Business** — `/development-os/ai-agents/executive-business` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Daily Digest** — `/development-os/ai-agents/daily-digest` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Weekly Plan** — `/development-os/ai-agents/weekly-plan` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Project Memory** — `/development-os/ai-agents/memory` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)

_Estimated work to make all 🟢: 10 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Availability — 1 🟢 · 1 🟡 · 1 🔴 (3 sections)

- 🟢 **Availability board** — `/dashboard/availability` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Calendar blocks** — `/dashboard/availability/blocks` — missing: Edit; no tests reference this route
- 🔴 **Readiness** — `/dashboard/readiness` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Bookings (Mgmt OS) — 1 🟢 · 3 🟡 · 2 🔴 (6 sections)

- 🟢 **Bookings** — `/dashboard/bookings` — no tests reference this route
- 🔴 **Calendar** — `/dashboard/bookings/calendar` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Sync** — `/dashboard/bookings/sync` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Rate plans** — `/dashboard/bookings/rates` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Channels (Mgmt)** — `/dashboard/channels` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Guests** — `/dashboard/guests` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 5 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Build & Sell — 1 🟢 · 9 🔴 (10 sections)

- 🔴 **Projects** — `/development-os/projects` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Assets** — `/development-os/assets` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Asset types** — `/development-os/asset-types` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟢 **Site reports** — `/development-os/site-reports` — —
- 🔴 **Sales & buyers** — `/development-os/buyers` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Sales (legacy)** — `/development-os/sales` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Reservations** — `/development-os/reservations` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Contracts** — `/development-os/contracts` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Invoices** — `/development-os/invoices` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Discounts** — `/development-os/discounts` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)

_Estimated work to make all 🟢: 9 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Cabinets (Dev OS) — 8 🟢 · 1 🔴 (9 sections)

- 🔴 **My cabinet** — `/development-os/cabinets/my-cabinet` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟢 **Site supervisor** — `/development-os/cabinets/site-supervisor` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Project manager** — `/development-os/cabinets/project-manager` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **CFO / Accountant** — `/development-os/cabinets/cfo-accountant` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **QS / Cost analyst** — `/development-os/cabinets/qs` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Procurement manager** — `/development-os/cabinets/procurement-manager` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Warehouse manager** — `/development-os/cabinets/warehouse-manager` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Marketing staff** — `/development-os/cabinets/marketing-staff` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Sales manager** — `/development-os/cabinets/sales-manager` — auto-classified as dashboard / metrics hub — read-only-by-design

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Capital — 7 🟡 · 4 🔴 (11 sections)

- 🟡 **Finance** — `/development-os/finance` — missing: Create + Edit + Delete/Archive
- 🟡 **Invoices** — `/development-os/finance/invoices` — missing: Edit + Delete/Archive
- 🟡 **Tax types** — `/development-os/finance/tax-types` — missing: Create + Edit + Delete/Archive
- 🟡 **Tax reports** — `/development-os/finance/tax-reports` — missing: Create + Edit + Delete/Archive
- 🟡 **Shared costs** — `/development-os/finance/shared-costs` — missing: Create + Edit + Delete/Archive
- 🟡 **Document extraction** — `/development-os/finance/document-extractions` — missing: Create + Edit + Delete/Archive
- 🔴 **Investors** — `/development-os/investors` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Investor requests** — `/development-os/investor-requests` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Commitments** — `/development-os/commitments` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟡 **Distributions** — `/development-os/distributions` — missing: Edit + Delete/Archive
- 🔴 **Revenue streams** — `/development-os/revenue-streams` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 11 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Communications (Dev OS) — 4 🟡 (4 sections)

- 🟡 **WhatsApp messages** — `/development-os/whatsapp` — missing: Create + Edit + Delete/Archive
- 🟡 **WhatsApp templates** — `/development-os/whatsapp/templates` — missing: Create + Edit + Delete/Archive
- 🟡 **Phone numbers** — `/development-os/whatsapp/phone-numbers` — missing: Create + Edit + Delete/Archive
- 🟡 **Notification rules** — `/development-os/settings/notifications` — missing: Create + Edit + Delete/Archive

_Estimated work to make all 🟢: 4 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Concierge AI — 4 🟢 (4 sections)

- 🟢 **Concierge AI** — `/dashboard/guest-ai` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **AI sessions** — `/dashboard/guest-ai/sessions` — no tests reference this route
- 🟢 **AI handoffs** — `/dashboard/guest-ai/handoffs` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Handoff SLA** — `/dashboard/guest-ai/handoffs/metrics` — no tests reference this route

### Dev OS Top Level — 1 🔴 (1 section)

- 🔴 **Command center** — `/development-os` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Direct Bookings — 3 🟢 · 4 🔴 (7 sections)

- 🟢 **Overview** — `/dashboard/direct-bookings` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🔴 **Holds** — `/dashboard/direct-bookings/holds` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Requests** — `/dashboard/direct-bookings/requests` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Deposits** — `/dashboard/direct-bookings/deposits` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Reconciliation** — `/dashboard/direct-bookings/reconciliation` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟢 **Guest status** — `/dashboard/direct-bookings/guest-status` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🔴 **Guest messages** — `/dashboard/direct-bookings/messages` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 4 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Documents (Mgmt) — 1 🟡 (1 section)

- 🟡 **Documents** — `/dashboard/documents` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Dynamic Pricing — 2 🟢 · 1 🟡 · 3 🔴 (6 sections)

- 🟢 **Overview** — `/dashboard/pricing` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟡 **Rule sets** — `/dashboard/pricing/rule-sets` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Calendar** — `/dashboard/pricing/calendar` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Quote tester** — `/dashboard/pricing/quote` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Logs** — `/dashboard/pricing/logs` — no tests reference this route
- 🔴 **Channel push** — `/dashboard/pricing/channel-push` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 4 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Executive (Dev OS) — 2 🟢 · 1 🟡 · 1 🔴 (4 sections)

- 🟢 **Dashboard** — `/development-os/dashboard` — —
- 🟢 **Visual reports** — `/development-os/reports` — —
- 🔴 **Risk radar** — `/development-os/risk-radar` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟡 **Executive digests** — `/development-os/digests` — missing: Edit + Delete/Archive

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Finance (Mgmt) — 2 🟢 · 1 🟡 (3 sections)

- 🟢 **Finance** — `/dashboard/finance` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Material-usage bridge** — `/dashboard/finance/material-usage` — missing: Create + Edit + Delete/Archive; no tests reference this route
- 🟢 **Statement transparency** — `/dashboard/finance/transparency` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Front Office — 1 🟢 · 1 🟡 · 3 🔴 (5 sections)

- 🟢 **Today** — `/dashboard/front-office` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🔴 **Arrivals** — `/dashboard/front-office/arrivals` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Departures** — `/dashboard/front-office/departures` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **In-house** — `/dashboard/front-office/in-house` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Check-in/out requests** — `/dashboard/front-office/requests` — missing: Create + Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 4 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Guest Journey — 3 🟢 · 1 🟡 · 1 🔴 (5 sections)

- 🟢 **Overview** — `/dashboard/guest-journey` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Rules** — `/dashboard/guest-journey/rules` — missing: Edit + Delete/Archive; no tests reference this route
- 🟢 **Runs** — `/dashboard/guest-journey/runs` — no tests reference this route
- 🟢 **Suggestions** — `/dashboard/guest-journey/suggestions` — no tests reference this route
- 🔴 **Review requests** — `/dashboard/guest-journey/reviews` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Guest Services — 1 🟢 · 1 🟡 · 2 🔴 (4 sections)

- 🟢 **Services** — `/dashboard/guest-services` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Catalog** — `/dashboard/guest-services/catalog` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Orders** — `/dashboard/guest-services/orders` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Finance bridge** — `/dashboard/guest-services/finance-bridge` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 3 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Guest Stay Security — 3 🟢 · 2 🔴 (5 sections)

- 🟢 **Security** — `/dashboard/guest-stays/security` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Security events** — `/dashboard/guest-stays/security/events` — no tests reference this route
- 🔴 **Verifications** — `/dashboard/guest-stays/security/verifications` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Wi-Fi migration** — `/dashboard/villa-guides/wifi/migrate` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Attachment storage** — `/dashboard/guest-ai/storage` — auto-classified as dashboard / metrics hub — read-only-by-design

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Guest Stays — 2 🟢 · 4 🟡 · 1 🔴 (7 sections)

- 🟢 **Overview** — `/dashboard/guest-stays` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🔴 **Tokens** — `/dashboard/guest-stays/tokens` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Villa guides** — `/dashboard/villa-guides` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Sections (sub-pages)** — `/dashboard/villa-guides/sections` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Wi-Fi** — `/dashboard/villa-guides/wifi` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Emergency contacts** — `/dashboard/villa-guides/emergency-contacts` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Neighborhood** — `/dashboard/villa-guides/neighborhood` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 5 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Integrations (Mgmt) — 3 🟢 · 2 🟡 (5 sections)

- 🟢 **Overview** — `/dashboard/integrations` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Calendar feeds** — `/dashboard/integrations/calendar-feeds` — —
- 🟢 **Calendar events** — `/dashboard/integrations/calendar-events` — no tests reference this route
- 🟡 **Conflicts** — `/dashboard/integrations/conflicts` — missing: Create + Edit + Delete/Archive; no tests reference this route
- 🟡 **Automation rules** — `/dashboard/integrations/automation` — missing: Create + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Intelligence (Mgmt) — 1 🔴 (1 section)

- 🔴 **AI assistants** — `/dashboard/ai` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Inventory (Mgmt) — 1 🟢 · 5 🟡 · 2 🔴 (8 sections)

- 🟢 **Stock command** — `/dashboard/inventory` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Items** — `/dashboard/inventory/items` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Stock by location** — `/dashboard/inventory/stock` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Movements** — `/dashboard/inventory/movements` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Locations** — `/dashboard/inventory/locations` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Categories** — `/dashboard/inventory/categories` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Suppliers** — `/dashboard/inventory/suppliers` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Counts** — `/dashboard/inventory/counts` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 7 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Knowledge Base — 5 🟡 (5 sections)

- 🟡 **Drawings** — `/development-os/drawings` — missing: Edit + Delete/Archive
- 🟡 **BOQ** — `/development-os/boq` — missing: Edit + Delete/Archive
- 🟡 **Specifications** — `/development-os/specifications` — missing: Edit + Delete/Archive
- 🟡 **Method statements** — `/development-os/method-statements` — missing: Edit + Delete/Archive
- 🟡 **Quality standards** — `/development-os/quality-standards` — missing: Edit + Delete/Archive

_Estimated work to make all 🟢: 5 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Maintenance Intelligence — 3 🟢 · 1 🟡 · 1 🔴 (5 sections)

- 🟢 **Overview** — `/dashboard/maintenance-intelligence` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟡 **Templates** — `/dashboard/maintenance-intelligence/templates` — missing: Edit + Delete/Archive; no tests reference this route
- 🟢 **Plans** — `/dashboard/maintenance-intelligence/plans` — no tests reference this route
- 🔴 **Windows** — `/dashboard/maintenance-intelligence/windows` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Risk feed** — `/dashboard/maintenance-intelligence/risks` — no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Marketing (Dev OS) — 3 🟢 · 2 🟡 · 1 🔴 (6 sections)

- 🟢 **Dashboard** — `/development-os/marketing/dashboard` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟢 **Lead sources** — `/development-os/marketing/lead-sources` — —
- 🟡 **Campaigns** — `/development-os/marketing/campaigns` — missing: Edit + Delete/Archive
- 🟡 **Content pipeline** — `/development-os/marketing/content` — missing: Edit + Delete/Archive
- 🔴 **Conversations** — `/development-os/marketing/conversations` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟢 **Manager performance** — `/development-os/marketing/manager-performance` — —

_Estimated work to make all 🟢: 3 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Operations (Dev OS) — 2 🟢 · 3 🟡 · 2 🔴 (7 sections)

- 🟢 **Vendors** — `/development-os/vendors` — —
- 🟢 **Materials** — `/development-os/materials` — —
- 🔴 **Deliveries** — `/development-os/materials/deliveries` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟡 **Safety incidents** — `/development-os/safety` — missing: Edit + Delete/Archive
- 🟡 **Procurement (Dev OS)** — `/development-os/procurement` — missing: Create + Edit + Delete/Archive
- 🟡 **Purchase requests** — `/development-os/procurement/purchase-requests` — missing: Edit + Delete/Archive
- 🔴 **Quotations** — `/development-os/procurement/quotations` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)

_Estimated work to make all 🟢: 5 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Operations (Mgmt) — 1 🟢 · 3 🟡 · 4 🔴 (8 sections)

- 🔴 **Command center** — `/dashboard/operations` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Tasks** — `/dashboard/operations/tasks` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Housekeeping** — `/dashboard/operations/housekeeping` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Maintenance** — `/dashboard/operations/maintenance` — missing: Edit + Delete/Archive; no tests reference this route
- 🟢 **Preventive** — `/dashboard/operations/preventive` — no tests reference this route
- 🔴 **Checklists** — `/dashboard/operations/checklists` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Service requests** — `/dashboard/operations/service-requests` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Damage reports** — `/dashboard/operations/damage-reports` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 7 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Owner Intelligence — 6 🟢 · 2 🔴 (8 sections)

- 🟢 **Overview** — `/dashboard/owner-intelligence` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟢 **Calendar** — `/dashboard/owner-intelligence/calendar` — no tests reference this route
- 🟢 **Health reports** — `/dashboard/owner-intelligence/health` — no tests reference this route
- 🔴 **Reviews** — `/dashboard/owner-intelligence/reviews` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Preferences** — `/dashboard/owner-intelligence/preferences` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Rebuild events** — `/dashboard/owner-intelligence/rebuild` — no tests reference this route
- 🟢 **Booking projection** — `/dashboard/owner-intelligence/bookings` — no tests reference this route
- 🟢 **Revenue source mix** — `/dashboard/owner-intelligence/revenue` — no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Owner Stays — 3 🟢 · 1 🟡 · 1 🔴 (5 sections)

- 🟢 **Overview** — `/dashboard/owner-stays` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🔴 **Requests** — `/dashboard/owner-stays/requests` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Policies** — `/dashboard/owner-stays/policies` — missing: Edit + Delete/Archive; no tests reference this route
- 🟢 **Equivalence groups** — `/dashboard/owner-stays/equivalence-groups` — no tests reference this route
- 🟢 **Finance bridge** — `/dashboard/owner-stays/finance-bridge` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Owners & Investors (Mgmt OS) — 1 🟢 · 1 🟡 (2 sections)

- 🟢 **Owners** — `/dashboard/owners` — no tests reference this route
- 🟡 **Ownership shares** — `/dashboard/shares` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Payments (Mgmt) — 2 🟢 · 1 🔴 (3 sections)

- 🟢 **Overview** — `/dashboard/payments` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🔴 **Providers** — `/dashboard/payments/providers` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Webhooks** — `/dashboard/payments/webhooks` — no tests reference this route

_Estimated work to make all 🟢: 1 section needs CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Platform (Dev OS) — 2 🟢 · 2 🔴 (4 sections)

- 🔴 **Organizations** — `/development-os/platform/organizations` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟢 **Usage metrics** — `/development-os/platform/usage` — —
- 🟢 **API docs** — `/development-os/platform/api-docs` — —
- 🔴 **Branding** — `/development-os/platform/branding` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Portfolio (Mgmt OS) — 2 🟢 (2 sections)

- 🟢 **Projects** — `/dashboard/projects` — no tests reference this route
- 🟢 **Villas** — `/dashboard/villas` — —

### Procurement (Mgmt) — 1 🟢 · 2 🟡 (3 sections)

- 🟢 **Procurement** — `/dashboard/procurement` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟡 **Purchase requests** — `/dashboard/procurement/requests` — missing: Edit + Delete/Archive; no tests reference this route
- 🟡 **Purchase orders** — `/dashboard/procurement/orders` — missing: Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Roadmap (Dev OS) — 3 🟡 · 3 🔴 · 1 ⚫ (7 sections)

- 🔴 **Quantity surveying** — `/development-os/quantity-surveying` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- ⚫ **Warehouse** — `/development-os/warehouse` — page.tsx not found at any candidate route — sidebar link likely 404s
- 🟡 **QA / QC** — `/development-os/qa-qc` — missing: Edit + Delete/Archive
- 🔴 **Schedule** — `/development-os/schedule` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟡 **Calendars** — `/development-os/schedule/calendars` — missing: Edit + Delete/Archive
- 🟡 **Resources** — `/development-os/schedule/resources` — missing: Edit + Delete/Archive
- 🔴 **Productivity** — `/development-os/productivity` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)

_Estimated work to make all 🟢: 7 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Security (Mgmt) — 4 🟢 · 1 🟡 · 1 🔴 (6 sections)

- 🟢 **Overview** — `/dashboard/security` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟡 **Cameras** — `/dashboard/security/cameras` — missing: Edit + Delete/Archive; no tests reference this route
- 🟢 **Authentication** — `/dashboard/security/auth` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟢 **Login attempts** — `/dashboard/security/login-attempts` — —
- 🟢 **Events** — `/dashboard/security/events` — no tests reference this route
- 🔴 **MFA factors** — `/dashboard/security/mfa` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 2 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Service Fulfilment — 1 🟢 · 1 🟡 · 4 🔴 (6 sections)

- 🟢 **Overview** — `/dashboard/service-fulfilment` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🔴 **Fulfilments** — `/dashboard/service-fulfilment/fulfilments` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Vendors** — `/dashboard/service-fulfilment/vendors` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Invoices** — `/dashboard/service-fulfilment/invoices` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Ratings** — `/dashboard/service-fulfilment/ratings` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Finance bridge** — `/dashboard/service-fulfilment/finance-bridge` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 5 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Settings (Dev OS) — 1 🟢 · 4 🟡 · 3 🔴 (8 sections)

- 🔴 **General settings** — `/development-os/settings` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟢 **AI usage** — `/development-os/settings/ai-usage` — —
- 🟡 **Notifications** — `/development-os/settings/notifications` — missing: Create + Edit + Delete/Archive
- 🟡 **Approval thresholds** — `/development-os/settings/approval-thresholds` — missing: Create + Edit + Delete/Archive
- 🟡 **WhatsApp setup** — `/development-os/settings/whatsapp` — missing: Create + Edit + Delete/Archive
- 🔴 **API keys** — `/development-os/settings/api-keys` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🔴 **Webhooks** — `/development-os/settings/webhooks` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟡 **Data export** — `/development-os/settings/data-export` — missing: Create + Edit + Delete/Archive

_Estimated work to make all 🟢: 7 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Strategic — 3 🔴 (3 sections)

- 🔴 **Project cycle intelligence** — `/development-os/project-cycle` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Unit profitability** — `/development-os/profitability` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Cashflow forecast** — `/development-os/cashflow-forecast` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route

_Estimated work to make all 🟢: 3 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### System (Mgmt) — 9 🟢 · 2 🟡 · 3 🔴 (14 sections)

- 🔴 **Background jobs** — `/dashboard/jobs` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported)
- 🟢 **Job runs** — `/dashboard/jobs/runs` — no tests reference this route
- 🟢 **Job locks** — `/dashboard/jobs/locks` — no tests reference this route
- 🟢 **System health** — `/dashboard/system/health` — —
- 🟢 **Deployment readiness** — `/dashboard/system/deployment` — —
- 🟢 **Demo walkthrough** — `/dashboard/demo` — —
- 🟡 **Notifications** — `/dashboard/notifications` — missing: Create + Edit + Delete/Archive; no tests reference this route
- 🟢 **Inbox (system notifications)** — `/dashboard/notifications/inbox` — auto-classified as dashboard / metrics hub — read-only-by-design; no tests reference this route
- 🟢 **Delivery log** — `/dashboard/notifications/deliveries` — no tests reference this route
- 🔴 **Notification preferences** — `/dashboard/notifications/preferences` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **Audit log** — `/dashboard/audit` — no tests reference this route
- 🟡 **Settings** — `/dashboard/settings` — missing: Create + Edit + Delete/Archive; 1 form action(s)
- 🔴 **Responsibility scopes** — `/dashboard/settings/responsibility-scopes` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟢 **My account security** — `/dashboard/settings/security` — auto-classified as dashboard / metrics hub — read-only-by-design

_Estimated work to make all 🟢: 5 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

### Utilities — 1 🟢 · 2 🟡 · 2 🔴 (5 sections)

- 🟢 **Overview** — `/dashboard/utilities` — auto-classified as dashboard / metrics hub — read-only-by-design
- 🟡 **Accounts** — `/dashboard/utilities/accounts` — missing: Edit + Delete/Archive; no tests reference this route
- 🔴 **Readings** — `/dashboard/utilities/readings` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🔴 **Payments** — `/dashboard/utilities/payments` — read-only — no Create/Edit/Delete affordances detected (no action wiring imported); no tests reference this route
- 🟡 **Risks** — `/dashboard/utilities/risks` — missing: Create + Edit + Delete/Archive; no tests reference this route

_Estimated work to make all 🟢: 4 sections need CRUD wiring or page creation. Detail-level estimate depends on how many share a service-layer module — see "Remediation Plan Proposal" below._

## Remediation Plan Proposal

Inserting a remediation sub-stage before continuing P4 ensures the platform looks complete to first-time users. Recommended structure:

### Stage 6.P3.6 — CRUD Coverage Closure (proposed, est. 1–2 weeks)

**Sub-checkpoints**:

- **P3.6.A — Broken-link triage** (1 day). For every ⚫ section, decide: (a) build a stub page that 404-style routes back to the parent, (b) build the full functional page, or (c) remove from the sidebar. Most likely outcome: half end up at (c), the rest at (b).
- **P3.6.B — Read-only page CRUD wire-up** (3–5 days). For every 🔴 section that the operator legitimately expects to manage (judged per-domain), wire up the missing Create/Edit/Delete affordances using the existing P0.3 form-component pattern. Reuses existing service-layer code wherever it exists.
- **P3.6.C — Action-imported-but-no-affordance pages** (2 days). The 🟡 set frequently includes pages where the server actions exist but the UI doesn't expose them. This is the highest leverage / lowest effort tier.
- **P3.6.D — Test coverage backfill** (2 days). For every section newly upgraded to 🟢, ensure at least one test asserts the form action is wired. Test target: 452+ new file-presence + grep tests.

**Out of scope**: any new entity tables. P3.6 is a UI + service-layer plumbing pass over existing data.

**Estimated test delta**: ~339 new file-presence + grep tests (one or two per remediated section).

**Estimated total time**: 1–2 weeks. Most variance is in P3.6.A (which broken sections actually need pages vs. should be cut).

### Alternative — restructure P4–P8

If P3.6 feels too disruptive, an alternative is to fold "complete missing CRUD" tasks into each remaining sub-stage as it touches the relevant domain:

- **P4** (Marketing) already touches `/development-os/marketing/*` — fold in any 🔴 sections in that domain.
- **P5** (Productivity Tools) — fold in System / Settings / Notification gaps.
- **P6** (AI Agents Activation) — fold in AI Agents Hub gaps.
- **P7** (Investor Portal Enhancement) — fold in Capital + Investors gaps.
- **P8** (Polish + Comprehensive Testing) — backstop for everything else.

This keeps the linear sub-stage structure but lengthens each sub-stage by ~1–2 days. Total program length stays roughly the same.

---

_Generated by `scripts/audit-coverage.ts` + `scripts/audit-coverage-classify.ts`. Heuristics are approximate; please spot-check any section flagged 🔴 or 🟡 against the live page before committing remediation effort._
