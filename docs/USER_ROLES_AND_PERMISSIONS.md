# Arconique Management OS — User Roles & Permissions

**Status:** v0 Blueprint
**Last revised:** 2026-04-24

This document is the authoritative role model. Engineering implements RBAC + ABAC exactly as described here, enforced at two layers:

1. **Application layer** — `lib/permissions/can.ts` used for UI visibility and pre-filtering.
2. **Database layer** — Postgres RLS policies used as the hard boundary. No query bypasses RLS except a narrow, audited `service_role` for background jobs like scheduled close and webhooks (never invoked from user requests).

---

## 1. Model Summary

- **Roles** are named bundles of permissions: `finance_manager`, `property_manager`, etc.
- **Permissions** are atomic, dotted codes: `finance.statement.read`, `tasks.approve`, `cameras.view.interior` (nonexistent by design), etc.
- **Scopes** attach roles to entities. A role assignment has a `scope_type` (`global`, `project`, `villa`, `owner`) and a `scope_id`. Example: "Property Manager on Eternal Villas project only".
- **ABAC** adds row-level filters: an investor sees only villas they own shares in, active on the period in question.
- **Special principals:**
  - **System / background** — scheduled jobs and webhooks, using `service_role` with explicit allowlist of operations.
  - **AI Assistants** — run *as* the requesting user; they never hold independent privilege.
  - **Guest (token)** — scoped to one booking via signed URL; no global session.

---

## 2. Role Catalog

All internal users are assigned at least one role. Multi-role is supported (e.g. a Director who is also the Finance Manager).

### 2.1 Internal (operator) roles

| Role code | Display | Primary scope |
|---|---|---|
| `super_admin` | Super Admin | Global |
| `director` | Director / Company Owner | Global |
| `operations_manager` | Operations Manager | Global or project |
| `property_manager` | Property Manager | Project or villa cluster |
| `finance_manager` | Accountant / Finance Manager | Global |
| `accountant` | Accountant (junior) | Global, read-mostly |
| `concierge` | Concierge / Guest Relations | Project |
| `housekeeping_supervisor` | Housekeeping Supervisor | Project |
| `housekeeper` | Housekeeper / Cleaner | Villa(s) |
| `technician` | Technician / Maintenance | Villa(s) or project |
| `procurement_manager` | Procurement Manager | Global |
| `security` | Security | Project |
| `sales_manager` | Sales / CRM Manager | Global |
| `agent` | External Agent / Broker | Owner-scoped (their referrals) |
| `vendor` | External Vendor (supplier mini-portal) | Supplier-scoped |

### 2.2 External (owner / investor / guest) roles

| Role code | Display | Scope |
|---|---|---|
| `investor_owner` | Investor / Owner | Owner-scoped (their shares) |
| `investor_viewer` | Delegate viewer (accountant of an investor) | Owner-scoped, read-only |
| `guest_token` | Guest (tokenized) | Booking-scoped |

---

## 3. Permission Catalog (selected, grouped)

Permissions are defined once in `permissions` table. This is not exhaustive; the full catalog lives in code.

### Identity
- `users.read`, `users.write`, `users.invite`, `users.suspend`, `users.set_mfa`

### Roles
- `roles.read`, `roles.assign`, `roles.revoke`

### Projects
- `projects.read`, `projects.write`, `projects.create`, `projects.archive`

### Villas
- `villas.read`, `villas.write`, `villas.archive`, `villas.status.change`, `villas.guide.read`, `villas.guide.write`

### Ownership
- `owners.read`, `owners.write`, `owners.kyc.read`, `owners.kyc.write`, `shares.read`, `shares.write`, `owner_approvals.request`, `owner_approvals.decide`

### Bookings & Guests
- `bookings.read`, `bookings.write`, `bookings.cancel`, `bookings.refund`, `bookings.pricing.override`, `guests.read`, `guests.pii.read`

### Finance
- `finance.read.summary`, `finance.read.detail`, `finance.read.drilldown`, `finance.write`, `finance.close.run`, `finance.close.approve`
- `revenue.read`, `revenue.write`, `expenses.read`, `expenses.write`, `expenses.approve`, `expenses.reassign_allocation`
- `taxes.read`, `taxes.write`, `fees.read`, `reserves.read`, `reserves.write`
- `payouts.read`, `payouts.write`, `payouts.approve`, `payouts.send`
- `statements.read`, `statements.generate`, `statements.approve`, `statements.publish`, `statements.amend`
- `bank.read`, `bank.reconcile`

### Operations
- `tasks.read`, `tasks.assign`, `tasks.complete`, `tasks.approve`, `tasks.reopen`
- `housekeeping.read`, `housekeeping.supervise`
- `maintenance.read`, `maintenance.write`, `maintenance.resolve`, `maintenance.escalate`
- `preventive.read`, `preventive.write`
- `damage.read`, `damage.write`, `damage.charge_guest`
- `lost_found.read`, `lost_found.write`
- `complaints.read`, `complaints.resolve`
- `staff.performance.read.own`, `staff.performance.read.any`

### Inventory & Procurement
- `inventory.read`, `inventory.write`, `inventory.consume`, `inventory.writeoff`
- `procurement.request.create`, `procurement.request.approve`, `procurement.order.create`, `procurement.order.send`, `procurement.order.receive`
- `suppliers.read`, `suppliers.write`

### Access & Cameras
- `access.codes.read`, `access.codes.issue`, `access.codes.revoke`
- `access.keys.read`, `access.keys.checkout`, `access.keys.rekey`
- `access.logs.read`
- `cameras.read`, `cameras.view.live`, `cameras.view.recorded`, `cameras.manage`
- `cameras.audit.read` (super admin, director only)

### Documents
- `documents.read` (scoped), `documents.upload`, `documents.delete`, `documents.share.external`

### CRM & Messaging
- `crm.read`, `crm.write`, `crm.assign`
- `inbox.read`, `inbox.reply`, `inbox.assign`, `inbox.close`

### Reports
- `reports.read`, `reports.create`, `reports.schedule`

### AI
- `ai.use.guest_concierge`, `ai.use.investor`, `ai.use.operations`, `ai.use.finance`, `ai.use.crm`, `ai.use.maintenance`, `ai.use.procurement`, `ai.use.report_writer`
- `ai.tools.execute` (required for any AI write tool)

### Settings & Integrations
- `settings.read`, `settings.write`, `integrations.read`, `integrations.connect`, `integrations.disconnect`
- `api_keys.create`, `api_keys.revoke`
- `feature_flags.write`

### Audit
- `audit.read`, `audit.export`

---

## 4. Role ↔ Permission Matrix (high level)

Legend: ● full, ◐ scoped/conditional, ○ none, — not applicable.

| Capability | super_admin | director | ops_mgr | property_mgr | finance_mgr | accountant | concierge | hk_sup | housekeeper | technician | procurement | security | sales | agent | vendor | investor_owner | investor_viewer | guest_token |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Portfolio overview | ● | ● | ● | ◐project | ● | ● | ◐project | ◐project | ○ | ○ | ◐category | ◐project | ◐project | ○ | ○ | ○ | ○ | ○ |
| Villas read | ● | ● | ● | ◐project | ● | ◐ | ◐project | ◐project | ◐assigned | ◐assigned | ● | ◐project | ◐project | ○ | ○ | ◐owned | ◐owned | ○ |
| Villa write | ● | ● | ◐project | ◐project | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Bookings read | ● | ● | ● | ◐project | ● | ● | ◐project | ◐project | ◐own task | ○ | ○ | ◐checkin | ◐own leads | ◐referred | ○ | ◐owned | ◐owned | ◐own only |
| Bookings write | ◐ | ● | ● | ◐project | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ◐direct | ◐own | ○ | ○ | ○ | ○ |
| Pricing override | ◐ | ● | ● | ◐project | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Finance summary | ● | ● | ◐project | ◐project | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐own commission | ○ | ◐owned | ◐owned | ○ |
| Finance detail | ● | ● | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐owned | ◐owned | ○ |
| Finance write | ○ | ◐ | ○ | ○ | ● | ◐limited | ○ | ○ | ○ | ○ | ◐expenses on PO | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Statements generate | ○ | ◐approve | ○ | ○ | ● | ◐draft | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Statements approve | ○ | ● | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Statements read | ● | ● | ○ | ◐project | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐owned | ◐owned | ○ |
| Payouts send | ○ | ◐approve | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Tasks read | ● | ● | ● | ◐project | ○ | ○ | ◐project | ◐project | ◐own | ◐own | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Tasks complete | ○ | ○ | ◐ | ◐ | ○ | ○ | ○ | ◐ | ◐own | ◐own | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Tasks approve | ○ | ○ | ● | ◐project | ○ | ○ | ○ | ●hk | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Maintenance write | ○ | ● | ● | ◐project | ○ | ○ | ◐create | ○ | ○ | ●assigned | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐report issue |
| Inventory consume | ○ | ● | ● | ◐project | ○ | ○ | ○ | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Inventory writeoff | ○ | ● | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| PR create | ○ | ● | ● | ● | ○ | ○ | ○ | ● | ◐ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| PR approve | ○ | ● | ●≤threshold | ◐project ≤threshold | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| PO send | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Suppliers write | ○ | ● | ○ | ○ | ◐read | ◐read | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ◐own | ○ | ○ | ○ |
| Access codes issue | ● | ● | ● | ◐project | ○ | ○ | ◐guest | ○ | ○ | ○ | ○ | ◐shift | ○ | ○ | ○ | ○ | ○ | ○ |
| Access logs read | ● | ● | ● | ◐project | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐project | ○ | ○ | ○ | ◐owned | ◐owned | ○ |
| Cameras live | ● | ● | ◐project | ◐project | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ●project | ○ | ○ | ○ | ◐owned | ○ | ○ |
| Cameras recorded | ● | ● | ◐with-reason | ◐with-reason | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐project | ○ | ○ | ○ | ◐owned | ○ | ○ |
| Cameras audit log | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| CRM read | ● | ● | ◐ | ◐ | ○ | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ● | ◐own | ○ | ○ | ○ | ○ |
| CRM write | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ◐own | ○ | ○ | ○ | ○ |
| Inbox read | ● | ● | ● | ◐project | ○ | ○ | ● | ◐project | ○ | ○ | ○ | ◐project | ● | ○ | ○ | ○ | ○ | ○ |
| AI Guest Concierge | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ● |
| AI Investor | — | ◐impersonate | — | — | — | — | — | — | — | — | — | — | — | — | — | ● | ● | — |
| AI Operations | ● | ● | ● | ● | ○ | ○ | ● | ● | ○ | ○ | ● | ◐ | ○ | ○ | ○ | ○ | ○ | ○ |
| AI Finance | ● | ● | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| AI CRM | ○ | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ |
| AI Maintenance | ○ | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| AI Procurement | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| AI Report Writer | ● | ● | ● | ◐project | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Audit read | ● | ● | ○ | ○ | ◐finance only | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Settings / integrations | ● | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

Notes:
- "Project scope" means the user sees and can act only on the projects they are assigned to.
- "Owned" means ABAC-filtered via `ownership_shares` rows active on the date in question.
- "Threshold" refers to configurable approval thresholds (e.g. Ops Manager can approve PRs up to IDR 10M; above that escalates to Director).

---

## 5. Scoping Rules (ABAC)

The matrix above defines *what kinds of data* a role can touch. Scope rules restrict *which rows*.

### 5.1 Project scope
A role assignment with `scope_type='project'` restricts:
- Villas → those in the project.
- Bookings, tasks, maintenance, expenses, inventory → filtered by `project_id`.

### 5.2 Villa scope (housekeeper, technician)
Field staff often see only villas they are assigned to via rotas or direct assignment.
- Visible villas = villas in active rota slots ∪ tasks currently assigned to the user.
- On task completion, visibility persists for 7 days (for revision/follow-up).

### 5.3 Owner scope (investors)
For `investor_owner`:
- Villa visibility = `EXISTS ownership_shares WHERE owner_id=? AND villa_id=villa.id AND effective_today`, **plus** pool shares: `EXISTS ownership_shares WHERE owner_id=? AND project_id=project.id AND share_type='pool' AND effective_today`.
- Booking visibility = villa-scoped, **without guest PII** (initials + dates + amount only unless explicitly enabled per owner).
- Expense visibility = villa-scoped + their share of pool-allocated expenses (drilled down, but names of other owners never surface).
- Historical visibility = always includes the periods they held shares; never before share start, never after share end.

### 5.4 Guest scope (token)
The token grants access only to:
- The booking object itself (no other bookings, no historical stays).
- Villa guide and rules (read).
- Smart-lock code after T-24h, revoked at T+3h after checkout.
- Messages inside this booking's thread.
- Upsells + service requests on this booking.

### 5.5 Delegate viewer
An investor can grant read-only access to a delegate (accountant, spouse, lawyer). Delegate inherits the investor's scope with `finance.read.detail` but no `write` permissions anywhere.

---

## 6. What Each User Sees (Example Walk-throughs)

### 6.1 Nikita — Director
- Landing: `/app` portfolio overview.
- Full portfolio, all projects, all villas, all bookings, all money.
- Can approve statements and payouts; cannot replace Finance Manager's attestation signature (separation of duties; both required on statement publish).
- Cameras: any camera, all feeds — every view logged.
- Audit: full read.

### 6.2 Made — Operations Manager (all projects)
- Landing: `/app/operations/status-board`.
- All operational data. Finance summary only at portfolio level (sees "GOP of project"), never owner payouts.
- Can escalate complaints to Director; cannot reassign allocation keys.

### 6.3 Ketut — Property Manager (Eternal Villas)
- Landing: `/app` filtered to Eternal Villas.
- Sees Eternal-Villas-only bookings, tasks, maintenance, expenses.
- Can create bookings, approve PRs up to IDR 10M, assign tasks, review checklist photos.
- Cannot see Enso Villas or Ahau Gardens at all.
- Cannot see owners of villas outside Eternal Villas.

### 6.4 Dewi — Accountant
- Landing: `/app/finance`.
- Full finance detail across all projects.
- Can draft statements, reconcile bank, file taxes.
- Cannot approve statements (needs Finance Manager + Director).
- No operational module beyond expenses and POs.

### 6.5 Sari — Housekeeping Supervisor
- Landing: `/field` (mobile) or `/app/operations/housekeeping` (desktop).
- Sees her cluster's villas, today's turnovers, her team's submissions.
- Approves or returns checklist photos.
- Cannot see finance, cannot see guest PII beyond first name + arrival time.

### 6.6 Wayan — Housekeeper
- Landing: `/field` with only today's assigned tasks.
- Each task shows: villa, time, checklist, photo slots, linen count.
- No access to other villas' tasks, no finance, no CRM, no cameras.

### 6.7 Budi — Technician
- Landing: `/field/maintenance`.
- Tickets assigned to him; can raise Purchase Requests.
- Cannot edit tickets on villas he's not assigned to.

### 6.8 Agung — Procurement Manager
- Landing: `/app/procurement`.
- Sees all PRs, POs, suppliers, inventory.
- Can approve PRs within threshold; escalates to Director above.
- Reads expense allocations but cannot edit allocation rules (Finance Manager owns that).

### 6.9 Gede — Security Lead
- Landing: `/app/access`.
- Sees access events, physical key log, can view camera live (project-scoped).
- Cannot see finance, ownership, or guest PII.

### 6.10 Emma — Investor (2 villas owned in Enso + 3% pool share)
- Landing: `/owner` portfolio dashboard.
- Sees her two villas' bookings (dates + amounts; guest initials), detailed monthly P&L, reserves, payouts.
- Sees her share of pool expenses (drilled to amount, not to other owner names).
- Can download signed statements; can approve large capex on her villas.
- Cannot see other investors; cannot see other villas' finance beyond the pool-aggregate.
- AI Investor Assistant available, grounded to her scope.

### 6.11 David — Agent / Broker
- Landing: `/app/crm/leads` filtered to his leads.
- Sees his pipeline and the commissions he's earned.
- Cannot see other agents' leads or portfolio finance.
- Cannot see guest PII beyond what's needed to confirm a booking.

### 6.12 Mr. Tanaka — Guest (token)
- Landing: `/stay/<token>` showing only his stay.
- Wi-Fi, guide, rules, services, concierge chat.
- Smart-lock code appears at T-24h.
- No other bookings, no villa financial info, no cameras.

### 6.13 Super Admin
- Landing: `/app` with system alerts card.
- All data, plus integrations and user/role management.
- Cameras-audit read exclusive to Super Admin and Director.
- Must use MFA; every destructive action double-confirmed.

---

## 7. Separation of Duties (SoD)

Hard rules encoded in policies:

| Action | Requires |
|---|---|
| Statement publish | `statements.generate` by one user + `statements.approve` by another with `finance_manager` or `director` role. |
| Payout send | `payouts.approve` by `finance_manager` + `payouts.send` by `director` (or two-person review via workflow flag). |
| Owner KYC verify | `owners.kyc.write` by a user who did not onboard the lead (prevents self-verification). |
| Allocation rule change | Proposed by `finance_manager`, approved by `director`; creates a new version — never edits the old. |
| Closed-period write | Requires explicit override with reason; generates a critical audit event; notifies Director. |

---

## 8. AI Permission Boundaries (summary; full details in AI doc)

- AI assistants run in the requesting user's auth context. They can never read what the user cannot read.
- Tool execution (any write) requires the user's permission for the underlying action + explicit user confirmation at the UI.
- Guest Concierge is the only AI reachable without a session — but always via a tokenized stay page scoped to one booking.
- AI cannot modify roles, permissions, statements, payouts, access codes, or camera access without a confirmed user action carrying those permissions.
- Report Writer can read broadly (per user) but cannot publish; drafts require approval.

---

## 9. Invitation & Lifecycle

- **Invitation:** Super Admin or Director invites a user by email with a role + scope. Invitee receives a magic link that creates the account and records the assignment.
- **Onboarding:** First login requires password + MFA setup for sensitive roles.
- **Suspension:** `users.suspend` freezes sessions immediately and revokes API keys; audit-logged.
- **Offboarding:** user archived, all role assignments end-dated to today; data retained for audit window; any in-flight tasks reassigned.
- **Role change:** creates a new `user_roles` row; old one end-dated. Historical queries still resolve correctly via `effective_at`.

---

## 10. Testing & Assurance

- A `tests/permissions/matrix.test.ts` suite impersonates each role and asserts the matrix row-by-row.
- `tests/rls/` uses `pgtap` to verify RLS policies match the matrix (expected allow/deny).
- CI gates: any change to `roles`, `permissions`, `role_permissions`, or RLS SQL must include a matrix test update in the same PR.
- Quarterly access review: Super Admin receives a report of all non-system role assignments and confirms / revokes.
