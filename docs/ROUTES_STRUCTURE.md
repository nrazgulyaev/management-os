# Arconique Management OS — Routes Structure

**Status:** v0 Blueprint
**Last revised:** 2026-04-24

This document lists every route across the five surfaces, with method, auth requirement, audience, and purpose. Route groups follow the App Router folder layout in `TECHNICAL_ARCHITECTURE.md §4`.

Conventions:
- `[id]`, `[slug]`, `[token]` are dynamic segments.
- `(group)` is a route group (no URL effect).
- **Auth column:**
  - `public` — no auth.
  - `token` — signed, time-boxed URL.
  - `session` — Supabase session cookie.
  - `api-key` — bearer token (for integrations).
- **Audience** indicates which role(s) may reach the URL. See `USER_ROLES_AND_PERMISSIONS.md` for the exact matrix.

---

## 1. Public Website (Marketing Surface)

Host: `management.arconique.com`
Route group: `app/(marketing)/`

| Route | Auth | Audience | Purpose |
|---|---|---|---|
| `/` | public | everyone | Home — editorial hero, trust signals, project showcase |
| `/villa-management` | public | prospective owners | Pillar: how we run your villa |
| `/owner-portal` | public | prospective owners | Demo of the owner experience |
| `/investor-reporting` | public | prospective investors | Statement-grade reporting explained |
| `/guest-experience` | public | prospective owners | What stays look like |
| `/operations` | public | prospective owners, trade | Tech behind the operation |
| `/portfolio` | public | everyone | Index of projects (Eternal, Enso, Ahau, future) |
| `/portfolio/[slug]` | public | everyone | Individual project page |
| `/case-studies` | public | everyone | Index |
| `/case-studies/[slug]` | public | everyone | Deep-dive story |
| `/contact` | public | everyone | Inbound lead form |
| `/apply` | public | prospective owners | Application to onboard a villa |
| `/pricing` | public | prospective owners | Management fee tiers *(v2)* |
| `/about` | public | everyone | Team, mission |
| `/careers` | public | candidates | Open roles *(v3)* |
| `/press` | public | media | Press kit |
| `/legal/privacy` | public | everyone | Privacy policy |
| `/legal/terms` | public | everyone | Terms |
| `/legal/cookies` | public | everyone | Cookie policy |
| `/sitemap.xml` | public | crawlers | Auto-generated |
| `/robots.txt` | public | crawlers | Auto-generated |
| `/manifest.webmanifest` | public | PWA | Install manifest |

---

## 2. Authentication

Route group: `app/(auth)/`

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/sign-in` | GET | public | Login page |
| `/sign-in` | POST (action) | public | Email + password |
| `/sign-in/magic-link` | POST (action) | public | Request magic link |
| `/sign-up` | GET / POST | public | Optional self-serve (disabled by default; enabled for owners via invitation) |
| `/auth/callback` | GET | token | OAuth / magic link callback → session |
| `/auth/reset` | GET / POST | public / session | Forgot password flow |
| `/auth/mfa/setup` | GET | session | TOTP setup |
| `/auth/mfa/verify` | POST | session | TOTP verify |
| `/auth/accept-invite/[token]` | GET | token | Invitation acceptance (owners, staff) |
| `/auth/sign-out` | POST | session | Log out |

---

## 3. Admin Dashboard (Internal Staff)

Host: `management.arconique.com/app`
Route group: `app/app/`
Auth: `session` (role-gated per page)

### 3.1 Portfolio & overview
| Route | Audience | Purpose |
|---|---|---|
| `/app` | admin roles | Portfolio overview — KPIs, alerts, today |
| `/app/portfolio` | admin roles | Cross-project view |
| `/app/projects` | admin roles | Projects list |
| `/app/projects/new` | super_admin, director | Create project |
| `/app/projects/[id]` | admin roles | Project overview |
| `/app/projects/[id]/settings` | super_admin, director, ops_mgr | Edit project |
| `/app/projects/[id]/villas` | admin roles | Project's villas |
| `/app/projects/[id]/pool` | super_admin, director, accountant | Pool rules & allocation |

### 3.2 Villas
| Route | Audience | Purpose |
|---|---|---|
| `/app/villas` | admin roles | All villas list + status board |
| `/app/villas/status-board` | admin roles | Live status board (realtime) |
| `/app/villas/new` | super_admin, director, ops_mgr | Add villa |
| `/app/villas/[id]` | admin roles | Villa overview |
| `/app/villas/[id]/calendar` | admin roles | Availability calendar |
| `/app/villas/[id]/bookings` | admin roles | Booking history |
| `/app/villas/[id]/finance` | accountant, director, property_mgr | Villa P&L |
| `/app/villas/[id]/operations` | admin roles | Tasks on this villa |
| `/app/villas/[id]/inventory` | admin roles, procurement | Stock at this villa |
| `/app/villas/[id]/access` | admin roles, security | Codes, keys |
| `/app/villas/[id]/cameras` | gated | Cameras at this villa |
| `/app/villas/[id]/documents` | admin roles, owner of villa | Documents |
| `/app/villas/[id]/owner` | admin roles | Ownership view |
| `/app/villas/[id]/guide` | admin roles | Internal guide (wifi, quirks, playbook) |
| `/app/villas/[id]/settings` | super_admin, director | Edit villa |

### 3.3 Ownership
| Route | Audience | Purpose |
|---|---|---|
| `/app/owners` | admin roles | Owners list |
| `/app/owners/new` | super_admin, director | Create owner |
| `/app/owners/[id]` | admin roles | Owner profile |
| `/app/owners/[id]/shares` | admin roles | Ownership shares held |
| `/app/owners/[id]/statements` | admin roles | All statements |
| `/app/owners/[id]/payouts` | admin roles | Payout history |
| `/app/owners/[id]/documents` | admin roles | Contracts, KYC |
| `/app/owners/[id]/approvals` | admin roles | Pending approvals from this owner |
| `/app/shares` | admin roles | All ownership shares |
| `/app/shares/[id]` | admin roles | Share detail (villa × owner × %) |

### 3.4 Bookings & Guests
| Route | Audience | Purpose |
|---|---|---|
| `/app/bookings` | admin roles | Bookings list |
| `/app/bookings/new` | concierge, property_mgr, ops_mgr | Manual booking |
| `/app/bookings/[id]` | admin roles | Booking detail |
| `/app/bookings/[id]/invoice` | accountant, admin roles | Invoice view / PDF |
| `/app/bookings/[id]/messages` | concierge, admin roles | Guest thread |
| `/app/bookings/calendar` | admin roles | Global calendar |
| `/app/guests` | admin roles | Guests list |
| `/app/guests/[id]` | admin roles | Guest profile + history |
| `/app/channels` | admin roles | Channels config (Airbnb, Booking, Agoda, Direct, Agent) |
| `/app/channels/[id]` | admin roles | Channel detail |

### 3.5 Finance
| Route | Audience | Purpose |
|---|---|---|
| `/app/finance` | accountant, director | Finance home |
| `/app/finance/revenue` | accountant, director | Revenue ledger |
| `/app/finance/revenue/[id]` | accountant | Revenue entry detail |
| `/app/finance/expenses` | accountant, director | Expense ledger |
| `/app/finance/expenses/new` | accountant | New expense |
| `/app/finance/expenses/[id]` | accountant | Expense detail |
| `/app/finance/fees` | accountant, director | Fees (OTA, payment, bank, FX) |
| `/app/finance/taxes` | accountant, director | Taxes (PPN, PHR) |
| `/app/finance/reserves` | accountant, director | Reserve funds |
| `/app/finance/payouts` | accountant, director | Payouts to owners |
| `/app/finance/payouts/new` | accountant, director | Create payout batch |
| `/app/finance/statements` | accountant, director | Owner statements |
| `/app/finance/statements/[id]` | accountant, director | Statement detail |
| `/app/finance/statements/[id]/preview` | accountant, director | PDF preview |
| `/app/finance/statements/generate` | accountant | Month-end generator |
| `/app/finance/close` | accountant, director | Monthly close workflow |
| `/app/finance/reconciliation` | accountant | Bank reconciliation |
| `/app/finance/bank-accounts` | accountant, director | Bank accounts |
| `/app/finance/currency` | accountant | FX rates, overrides |

### 3.6 Operations
| Route | Audience | Purpose |
|---|---|---|
| `/app/operations` | ops roles | Operations home |
| `/app/operations/status-board` | ops roles | Live villa status |
| `/app/operations/housekeeping` | housekeeping_sup, ops_mgr | HK schedule |
| `/app/operations/housekeeping/[id]` | housekeeping_sup | Task detail |
| `/app/operations/maintenance` | ops_mgr, tech | Ticket list |
| `/app/operations/maintenance/[id]` | ops_mgr, tech | Ticket detail |
| `/app/operations/maintenance/new` | ops roles | New ticket |
| `/app/operations/preventive` | ops_mgr | Preventive schedules |
| `/app/operations/preventive/[id]` | ops_mgr | Schedule detail |
| `/app/operations/tasks` | ops roles | All staff tasks |
| `/app/operations/tasks/[id]` | ops roles | Task detail |
| `/app/operations/damage-reports` | ops roles | Damage log |
| `/app/operations/lost-found` | ops roles, concierge | Lost & found |
| `/app/operations/complaints` | ops_mgr, concierge, director | Guest complaints |
| `/app/operations/staff` | ops_mgr, director | Staff roster |
| `/app/operations/staff/[id]` | ops_mgr, director | Staff performance |
| `/app/operations/rotas` | ops_mgr | Shift planning |

### 3.7 Inventory & Procurement
| Route | Audience | Purpose |
|---|---|---|
| `/app/inventory` | procurement, ops roles | Inventory home |
| `/app/inventory/items` | procurement | Item catalog |
| `/app/inventory/items/[id]` | procurement | Item detail |
| `/app/inventory/locations` | procurement | Warehouses & villa-assigned stock |
| `/app/inventory/movements` | procurement | Stock movements |
| `/app/inventory/alerts` | procurement | Low-stock alerts |
| `/app/inventory/writeoffs` | procurement, housekeeping_sup | Damage & linen write-offs |
| `/app/procurement` | procurement | Procurement home |
| `/app/procurement/requests` | procurement, ops roles | Purchase requests |
| `/app/procurement/requests/[id]` | procurement, approver | PR detail |
| `/app/procurement/orders` | procurement | Purchase orders |
| `/app/procurement/orders/[id]` | procurement | PO detail |
| `/app/procurement/orders/new` | procurement | New PO |
| `/app/suppliers` | procurement, accountant | Suppliers |
| `/app/suppliers/[id]` | procurement, accountant | Supplier detail |
| `/app/suppliers/new` | procurement | Add supplier |

### 3.8 Documents, CRM, Messaging
| Route | Audience | Purpose |
|---|---|---|
| `/app/documents` | role-gated | Document vault |
| `/app/documents/[id]` | role-gated | Document viewer |
| `/app/documents/upload` | role-gated | Upload |
| `/app/crm` | sales, director, ops_mgr | CRM home |
| `/app/crm/leads` | sales | Leads |
| `/app/crm/leads/[id]` | sales | Lead detail |
| `/app/crm/pipeline` | sales, director | Pipeline board |
| `/app/inbox` | concierge, sales, ops_mgr | Unified inbox |
| `/app/inbox/[threadId]` | concierge, sales, ops_mgr | Thread |
| `/app/inbox/templates` | concierge, sales | Reply templates |

### 3.9 Access & Cameras
| Route | Audience | Purpose |
|---|---|---|
| `/app/access` | ops_mgr, security, director | Access home |
| `/app/access/codes` | ops_mgr, security | All codes |
| `/app/access/codes/new` | ops_mgr | Issue code |
| `/app/access/codes/[id]` | ops_mgr, security | Code detail |
| `/app/access/keys` | security, ops_mgr | Physical keys |
| `/app/access/logs` | ops_mgr, security, director | Access logs |
| `/app/cameras` | gated | Camera registry |
| `/app/cameras/[id]` | gated | Camera live/feed |
| `/app/cameras/[id]/recordings` | gated | Archive |
| `/app/cameras/access-log` | super_admin, director | Who watched what, when |

### 3.10 Reports, AI, System
| Route | Audience | Purpose |
|---|---|---|
| `/app/reports` | director, accountant, ops_mgr | Reports hub |
| `/app/reports/[id]` | role-gated | Report detail |
| `/app/reports/scheduled` | director, accountant | Scheduled reports |
| `/app/reports/new` | director, accountant | Create ad-hoc report |
| `/app/ai` | all (scoped) | AI home — assistants picker |
| `/app/ai/operations` | ops roles | AI Operations Copilot |
| `/app/ai/finance` | accountant, director | AI Finance Analyst |
| `/app/ai/crm` | sales, concierge | AI CRM Assistant |
| `/app/ai/maintenance` | ops_mgr, tech | AI Maintenance Assistant |
| `/app/ai/procurement` | procurement | AI Procurement Assistant |
| `/app/ai/report-writer` | director, accountant | AI Report Writer |
| `/app/settings` | super_admin | Settings home |
| `/app/settings/company` | super_admin, director | Company info |
| `/app/settings/users` | super_admin | Users |
| `/app/settings/roles` | super_admin | Roles & permissions |
| `/app/settings/integrations` | super_admin | Integrations |
| `/app/settings/integrations/[name]` | super_admin | Integration config |
| `/app/settings/billing` | super_admin, director | OS billing |
| `/app/settings/api-keys` | super_admin | PATs |
| `/app/settings/webhooks` | super_admin | Outbound webhooks |
| `/app/settings/branding` | super_admin, director | Logo, colors for statements |
| `/app/settings/email` | super_admin | Email config |
| `/app/settings/notifications` | session | Personal notification prefs |
| `/app/settings/profile` | session | Personal profile |
| `/app/audit` | super_admin, director | Audit log viewer |
| `/app/audit/[id]` | super_admin, director | Audit event detail |

---

## 4. Owner / Investor Portal

Host: `management.arconique.com/owner`
Route group: `app/owner/`
Auth: `session` — owner or investor role.

| Route | Purpose |
|---|---|
| `/owner` | Portfolio dashboard — summary cards (total invested, this-month payout, YTD yield, occupancy) |
| `/owner/villas` | Owned / shared villas list |
| `/owner/villas/[id]` | Villa detail — bookings, P&L, photos, documents (scoped) |
| `/owner/villas/[id]/bookings` | Booking calendar (read-only) |
| `/owner/villas/[id]/finance` | Villa P&L — by month, drill-down |
| `/owner/villas/[id]/reserves` | Renovation + FF&E reserve balances |
| `/owner/villas/[id]/maintenance` | Maintenance history (summary) |
| `/owner/pool` | Pool participation — share, distribution history |
| `/owner/statements` | Statement archive |
| `/owner/statements/[id]` | Statement viewer + PDF |
| `/owner/payouts` | Payout history |
| `/owner/payouts/[id]` | Payout detail (bank ref, date) |
| `/owner/documents` | Contracts, KYC, certificates |
| `/owner/documents/[id]` | Document viewer |
| `/owner/approvals` | Pending approvals (capex over threshold, renovations) |
| `/owner/approvals/[id]` | Approval detail + action |
| `/owner/tax` | Tax summary, certificates |
| `/owner/assistant` | AI Investor Assistant |
| `/owner/settings/profile` | Profile |
| `/owner/settings/notifications` | Email/push preferences |
| `/owner/settings/payout-method` | Bank details (PII-protected) |
| `/owner/settings/currency` | Display currency (IDR/USD) |
| `/owner/settings/language` | EN/ID |
| `/owner/support` | Support contact + ticket |

---

## 5. Guest Portal

Host: `management.arconique.com/stay/[token]`
Auth: `token` (signed, time-boxed; scoped to one booking).

| Route | Purpose |
|---|---|
| `/stay/[token]` | Stay overview — villa hero, dates, welcome |
| `/stay/[token]/check-in` | Check-in instructions + smart-lock code (released T-24h) |
| `/stay/[token]/wifi` | Wi-Fi network + password |
| `/stay/[token]/guide` | Villa guide (amenities, how-to, neighborhood) |
| `/stay/[token]/rules` | House rules |
| `/stay/[token]/services` | Upsells catalog (transfer, massage, chef, laundry, scooter, driver, breakfast) |
| `/stay/[token]/services/[serviceId]` | Service detail + book |
| `/stay/[token]/requests` | Service requests (towels, repair) |
| `/stay/[token]/requests/new` | New request |
| `/stay/[token]/concierge` | Concierge chat (AI → WhatsApp handoff) |
| `/stay/[token]/issue` | Report a problem |
| `/stay/[token]/checkout` | Checkout instructions + review prompt |
| `/stay/[token]/review` | Post-stay review (opens after checkout) |
| `/stay/[token]/invoice` | Folio / invoice (if guest pays direct) |
| `/stay/[token]/contact` | Direct contact to villa host |

**Expiration:** token valid from T-14d pre-arrival to T+3d post-checkout, extendable by operator.

---

## 6. Staff Field Portal (PWA)

Host: `management.arconique.com/field`
Route group: `app/field/`
Auth: `session` (staff); PIN-gated after first magic-link sign-in.

| Route | Audience | Purpose |
|---|---|---|
| `/field` | all staff | Today's tasks (role-filtered) |
| `/field/tasks` | all staff | Task queue |
| `/field/tasks/[id]` | assigned staff | Task detail |
| `/field/tasks/[id]/complete` | assigned staff | Completion flow with photo upload |
| `/field/checklist/[id]` | housekeeping | Checklist runner |
| `/field/maintenance` | technician | Maintenance queue |
| `/field/maintenance/[id]` | assigned technician | Ticket detail |
| `/field/maintenance/[id]/resolve` | assigned technician | Resolution flow |
| `/field/preventive` | ops roles | Preventive list |
| `/field/preventive/[id]` | ops roles | Preventive run |
| `/field/damage-report` | all staff | Report damage |
| `/field/damage-report/[id]` | all staff | Report detail |
| `/field/lost-found` | all staff | Lost & found |
| `/field/inventory` | all staff | Inventory use logger |
| `/field/inventory/scan` | all staff | Scan-to-use (QR) |
| `/field/purchase-request` | ops roles | Request purchase |
| `/field/purchase-request/new` | ops roles | New PR |
| `/field/approvals` | supervisors | Items awaiting approval |
| `/field/approvals/[id]` | supervisors | Approve / reject |
| `/field/access` | security, ops | Quick-issue temp access code |
| `/field/schedule` | all staff | My shifts |
| `/field/settings` | all staff | Profile, language, PIN |
| `/field/offline-queue` | all staff | Pending sync items |

---

## 7. API (v1)

Host: `management.arconique.com/api/v1`
Auth: `api-key` (PAT) or `session` cookie. See `TECHNICAL_ARCHITECTURE.md §6.3`.

### 7.1 Core resources (CRUD patterns — not exhaustive)

| Path | Methods | Purpose |
|---|---|---|
| `/api/v1/projects` | GET POST | List / create projects |
| `/api/v1/projects/:id` | GET PATCH DELETE | Project |
| `/api/v1/villas` | GET POST | List / create villas |
| `/api/v1/villas/:id` | GET PATCH DELETE | Villa |
| `/api/v1/villas/:id/calendar` | GET | Availability |
| `/api/v1/villas/:id/status` | GET PATCH | Status board state |
| `/api/v1/owners` | GET POST | Owners |
| `/api/v1/owners/:id` | GET PATCH | Owner |
| `/api/v1/shares` | GET POST | Ownership shares |
| `/api/v1/bookings` | GET POST | Bookings |
| `/api/v1/bookings/:id` | GET PATCH DELETE | Booking |
| `/api/v1/bookings/:id/cancel` | POST | Cancel |
| `/api/v1/guests` | GET POST | Guests |
| `/api/v1/channels` | GET | Channels |
| `/api/v1/revenue` | GET POST | Revenue ledger |
| `/api/v1/expenses` | GET POST | Expenses |
| `/api/v1/expenses/:id/receipt` | POST | Upload receipt |
| `/api/v1/fees` | GET | Fees |
| `/api/v1/taxes` | GET POST | Taxes |
| `/api/v1/reserves` | GET POST | Reserve movements |
| `/api/v1/payouts` | GET POST | Payouts |
| `/api/v1/statements` | GET POST | Statements |
| `/api/v1/statements/:id/pdf` | GET | Download PDF |
| `/api/v1/tasks` | GET POST | Tasks |
| `/api/v1/tasks/:id` | GET PATCH | Task |
| `/api/v1/tasks/:id/complete` | POST | Complete |
| `/api/v1/tasks/:id/approve` | POST | Supervisor approve |
| `/api/v1/checklists` | GET POST | Checklist templates |
| `/api/v1/maintenance` | GET POST | Tickets |
| `/api/v1/maintenance/:id` | GET PATCH | Ticket |
| `/api/v1/preventive` | GET POST | Preventive schedules |
| `/api/v1/inventory/items` | GET POST | Items |
| `/api/v1/inventory/movements` | GET POST | Movements |
| `/api/v1/procurement/requests` | GET POST | PRs |
| `/api/v1/procurement/orders` | GET POST | POs |
| `/api/v1/suppliers` | GET POST | Suppliers |
| `/api/v1/documents` | GET POST | Documents |
| `/api/v1/documents/:id/signed-url` | POST | Signed URL |
| `/api/v1/access/codes` | GET POST | Codes |
| `/api/v1/access/keys` | GET POST PATCH | Physical keys |
| `/api/v1/access/logs` | GET | Access logs |
| `/api/v1/cameras` | GET POST | Cameras |
| `/api/v1/cameras/:id/stream` | GET | Signed RTSP proxy token |
| `/api/v1/messages` | GET POST | Unified inbox |
| `/api/v1/threads/:id` | GET | Thread |
| `/api/v1/leads` | GET POST | CRM leads |
| `/api/v1/notifications` | GET | Notifications |
| `/api/v1/audit/events` | GET | Audit log |
| `/api/v1/reports` | GET POST | Reports |

### 7.2 AI

| Path | Methods | Purpose |
|---|---|---|
| `/api/v1/ai/chat` | POST (SSE) | Streamed AI chat (assistant routed via payload) |
| `/api/v1/ai/summary` | POST | Summarize a booking / thread / task |
| `/api/v1/ai/explain-statement` | POST | Explain a line item (owner portal) |
| `/api/v1/ai/tools/:name` | POST | Tool execution (guarded) |
| `/api/v1/ai/feedback` | POST | Thumbs up/down + comment |

### 7.3 Integration webhooks (inbound)

| Path | Auth |
|---|---|
| `/api/v1/integrations/hostaway/webhook` | HMAC |
| `/api/v1/integrations/airbnb/webhook` | HMAC |
| `/api/v1/integrations/booking/webhook` | HMAC |
| `/api/v1/integrations/whatsapp/webhook` | Meta verify |
| `/api/v1/integrations/telegram/webhook` | secret token |
| `/api/v1/integrations/instagram/webhook` | Meta verify |
| `/api/v1/integrations/stripe/webhook` | signing secret |
| `/api/v1/integrations/xendit/webhook` | signing secret |
| `/api/v1/integrations/pricelabs/webhook` | HMAC |
| `/api/v1/integrations/smart-lock/:vendor/webhook` | HMAC |
| `/api/v1/integrations/email/inbound` | DKIM-verified |

### 7.4 System

| Path | Purpose |
|---|---|
| `/api/v1/health` | Liveness |
| `/api/v1/ready` | Readiness |
| `/api/v1/version` | Build info |
| `/api/v1/me` | Current user / session |

---

## 8. Realtime / SSE

| Path | Protocol | Purpose |
|---|---|---|
| `/api/v1/rt/status-board` | SSE | Villa status updates |
| `/api/v1/rt/inbox` | SSE | New messages |
| `/api/v1/rt/tasks` | SSE | Task changes |
| `/api/v1/rt/notifications` | SSE | Personal notifications |
| `/api/v1/ai/chat` | SSE | AI stream |

Supabase Realtime (Postgres changes) used under the hood for status-board, tasks, inbox. SSE is our fallback and the external contract.

---

## 9. Static / infra

| Path | Purpose |
|---|---|
| `/manifest.webmanifest` | PWA manifest (per-surface variants served with query: `?surface=field`) |
| `/sw.js` | Service worker |
| `/favicon.ico` | Favicon |
| `/og/*.png` | Open Graph images (cached) |
| `/icons/*.png` | App icons |
| `/.well-known/*` | ACME, Apple App Site Association (for universal links in v10) |

---

## 10. Middleware Rules (runtime redirects)

| Rule | Behavior |
|---|---|
| Unauthenticated access to `/app/*`, `/owner/*`, `/field/*` | Redirect to `/sign-in?next=<path>` |
| Role mismatch (e.g. owner hitting `/app/*`) | 404 (never 403 — no leak) |
| Invalid / expired `/stay/[token]` | Render `stay/invalid` with re-send link CTA |
| Missing MFA on sensitive role | Redirect to `/auth/mfa/setup` |
| Locked account | Redirect to `/auth/locked` |
| Switching project context (multi-project staff) | Set cookie `tenant.project=<id>` via `/app/settings/tenant` action |

---

## 11. Public-facing short URLs

Short, human-shareable aliases for guest UX:

| Route | Redirect target |
|---|---|
| `/go/checkin/[token]` | `/stay/[token]/check-in` |
| `/go/guide/[token]` | `/stay/[token]/guide` |
| `/go/concierge/[token]` | `/stay/[token]/concierge` |

These are used in SMS, email, WhatsApp confirmations where character count matters.
