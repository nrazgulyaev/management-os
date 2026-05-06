# Management OS v1 — Product Map

> Version: pre-launch (post-Prompt 115).
> Status: feature-complete for v1. Polish, scope freeze, launch
> readiness only beyond this point — see ADR-0038.

## Executive summary

**Management OS v1** is the operating plane for premium Bali villa
assets. It coordinates five audiences on one data core:

| Audience | Surface | Primary value |
|---|---|---|
| Internal staff | `/dashboard/**` | Single operating cockpit for bookings, finance, ops, security, AI |
| Owner / investor | `/owner/**` | Family-office-grade transparency without operator-only data |
| Guest | `/stay/[token]/**`, `/book/hold/[token]/**` | Tokenised stay portal + direct-booking hold flow |
| Field staff | `/field/**` | Mobile-first task runner with photo + checklist gating |
| Vendor | `/vendor/service/[token]/**` | Token-scoped service-fulfilment view |

**Out of scope for v1** (see scope freeze for the full list):
real PSP / channel-manager / smart-lock integrations, WhatsApp /
Telegram, AI write tools, FX conversion, full i18n, full PWA offline.

---

## Core modules

For each module: purpose · key routes · key tables · primary roles ·
status · known limitations · post-v1 upgrades.

### 1. Admin dashboard
- **Purpose:** unified operating cockpit for staff. Houses every
  internal CRUD, settings, security, and system-health surface.
- **Key routes:** `/dashboard`, `/dashboard/villas`, `/dashboard/owners`,
  `/dashboard/bookings`, `/dashboard/settings/**`, `/dashboard/system/**`.
- **Key tables:** `app_users`, `roles`, `permissions`, `user_roles`,
  `villas`, `owners`, `villa_units`, `audit_events`.
- **Primary roles:** super_admin, director, operations_manager.
- **Status:** production-ready (with caveats — see Notifications, AI).
- **Known limitations:** UI is English-only; no light theme.
- **Post-v1:** i18n, theme toggle, density toggle.

### 2. Owner portal
- **Purpose:** owner / investor self-service. Shows portfolio,
  calendar, bookings, revenue, statements, owner stays.
- **Key routes:** `/owner`, `/owner/calendar`, `/owner/bookings`,
  `/owner/revenue`, `/owner/statements`, `/owner/stays`,
  `/owner/inbox`, `/owner/villas`.
- **Key tables:** `owners`, `owner_villa_links`, `bookings`,
  `owner_statements`, `owner_booking_summaries`,
  `direct_booking_holds` (filtered).
- **Primary roles:** investor_owner, investor_viewer, owner_delegate.
- **Status:** demo-ready / staging-ready.
- **Known limitations:** IDR only (no FX); no owner mobile native app;
  no in-portal messaging (operator-side only in v1).
- **Post-v1:** FX, owner mobile PWA polish, owner-side messaging UI.

### 3. Guest stay portal
- **Purpose:** tokenised stay landing pages — guide, Wi-Fi, services,
  concierge, requests, emergency, house rules, neighborhood.
- **Key routes:** `/stay/[token]`, `/stay/[token]/guide`,
  `/stay/[token]/wifi`, `/stay/[token]/services`,
  `/stay/[token]/requests`, `/stay/[token]/concierge`,
  `/stay/[token]/check-in`, `/stay/[token]/verify`,
  `/stay/[token]/emergency`, `/stay/[token]/offline`.
- **Key tables:** `guest_stay_tokens`, `wifi_encryption_keys`,
  `guest_service_requests`, `guest_ai_conversations`.
- **Primary roles:** guest (token-scoped, no formal role).
- **Status:** demo-ready / staging-ready.
- **Known limitations:** smart-lock issuance is a stub; full PWA
  offline is partial.
- **Post-v1:** real smart-lock provider; full offline-first runner.

### 4. Direct booking flow
- **Purpose:** capture direct-booking holds + deposits + checkout
  without OTA commission.
- **Key routes:** `/book/hold/[token]`, `/book/hold/[token]/payment`,
  `/book/hold/[token]/status`, `/book/hold/[token]/messages`,
  `/dashboard/direct-bookings/**`, `/api/v1/holds/**`,
  `/api/v1/quote`.
- **Key tables:** `direct_booking_holds`, `direct_booking_requests`,
  `direct_booking_finance_links`, `direct_booking_messages`.
- **Primary roles:** booking_manager, revenue_manager (admin-side);
  guest (token-scoped).
- **Status:** demo-ready (manual PSP stub).
- **Known limitations:** no real PSP; no real refund call; no guest
  email confirmation send-out.
- **Post-v1:** Stripe / Xendit / Midtrans + webhook secrets; refund
  pipeline; confirmation emails.

### 5. Field app
- **Purpose:** mobile-first task runner for housekeepers / technicians /
  security.
- **Key routes:** `/field`, `/field/inventory`, `/field/tasks/[id]`,
  `/field/tasks/demo`.
- **Key tables:** `operation_tasks`, `task_attachments`,
  `checklist_items`, `inventory_movements`.
- **Primary roles:** housekeeping_supervisor, housekeeper, technician,
  security.
- **Status:** demo-ready.
- **Known limitations:** online-first; PWA offline cache is partial.
- **Post-v1:** full offline-first task runner with sync.

### 6. Vendor portal
- **Purpose:** token-scoped vendor view of service requests, ETA,
  invoice metadata, attachments.
- **Key routes:** `/vendor/service/[token]`,
  `/vendor/service/[token]/invoice`.
- **Key tables:** `service_fulfilments`, `service_fulfilment_invoices`,
  `service_fulfilment_attachments`.
- **Primary roles:** vendor (token-scoped).
- **Status:** demo-ready.
- **Known limitations:** no payouts; no rating workflow visible to the
  vendor.
- **Post-v1:** payout rails (Wise / Indonesian banks); vendor rating
  surface.

### 7. Finance engine
- **Purpose:** money capture, owner statements, transparency, fees,
  payouts, expenses, taxes.
- **Key routes:** `/dashboard/finance/**`,
  `/dashboard/finance/transparency/**`.
- **Key tables:** `owner_statements`, `statement_lines`,
  `statement_source_groups`, `statement_explanation_snapshots`,
  `expenses`, `fees`, `payouts`, `revenue_entries`, `taxes`.
- **Primary roles:** finance_manager, accountant, director.
- **Status:** production-ready.
- **Known limitations:** IDR only; no Xero / QuickBooks export.
- **Post-v1:** FX rates; accounting-package export; period close
  workflow polish.

### 8. Owner statements
- **Purpose:** the legal / accounting record per owner per period.
- **Key routes:** `/owner/statements`, `/owner/statements/[id]`,
  `/owner/statements/[id]/pdf`,
  `/dashboard/finance/statements/[id]`.
- **Key tables:** `owner_statements`, `statement_lines`,
  `owner_statement_source_groups`,
  `statement_explanation_snapshots`.
- **Primary roles:** finance_manager, investor_owner.
- **Status:** production-ready.
- **Known limitations:** rebuild is operator-triggered, not automatic
  on every line change.
- **Post-v1:** automatic rebuild + signing workflow.

### 9. Operations runtime
- **Purpose:** task queue, housekeeping, maintenance, damage reports,
  service requests, preventive plans.
- **Key routes:** `/dashboard/operations/**`,
  `/dashboard/front-office/**`.
- **Key tables:** `operation_tasks`, `maintenance_tickets`,
  `damage_reports`, `housekeeping_assignments`, `preventive_plans`.
- **Primary roles:** operations_manager, property_manager, concierge.
- **Status:** demo-ready.
- **Post-v1:** SLA tracking; auto-assignment; vendor SLA enforcement.

### 10. Maintenance intelligence
- **Purpose:** preventive maintenance + utility risk scanning.
- **Key routes:** `/dashboard/maintenance-intelligence/**`,
  `/dashboard/utilities/**`.
- **Key tables:** `preventive_plans`, `preventive_tasks`,
  `utility_readings`, `utility_risks`.
- **Primary roles:** technician, operations_manager.
- **Status:** demo-ready.

### 11. Inventory + Procurement
- **Purpose:** consumables stock, supplier orders, count-based
  movements.
- **Key routes:** `/dashboard/inventory/**`,
  `/dashboard/procurement/**`.
- **Key tables:** `inventory_items`, `inventory_movements`,
  `inventory_counts`, `procurement_orders`,
  `procurement_requests`, `suppliers`.
- **Primary roles:** procurement_manager, housekeeping_supervisor.
- **Status:** demo-ready.

### 12. Guest services / fulfilment
- **Purpose:** in-stay upsell catalog, orders, finance bridge.
- **Key routes:** `/dashboard/guest-services/**`,
  `/dashboard/service-fulfilment/**`,
  `/stay/[token]/services/**`.
- **Key tables:** `guest_service_catalog`, `guest_service_orders`,
  `service_fulfilments`, `service_fulfilment_invoices`.
- **Primary roles:** concierge, finance_manager (bridge).
- **Status:** demo-ready.

### 13. Dynamic pricing
- **Purpose:** rate plans, seasons, overrides, a quote engine, and
  channel-push *simulation*.
- **Key routes:** `/dashboard/pricing/**`,
  `/dashboard/bookings/rates/**`.
- **Key tables:** `rate_plans`, `rate_seasons`, `rate_overrides`,
  `pricing_logs`.
- **Primary roles:** revenue_manager.
- **Status:** demo-ready (channel push is a simulation).
- **Post-v1:** PriceLabs / Hostex / Hostaway integration.

### 14. Integrations / calendar sync
- **Purpose:** inbound iCal sync, conflict detection, automation
  triggers.
- **Key routes:** `/dashboard/integrations/**`.
- **Key tables:** `booking_channels`, `calendar_feeds`,
  `calendar_events`, `automation_rules`.
- **Primary roles:** booking_manager.
- **Status:** demo-ready (iCal in only).
- **Post-v1:** iCal write-out; OTA write API.

### 15. Notifications
- **Purpose:** in-app inbox + email (Resend) + SMS (Twilio) +
  preferences + delivery worker.
- **Key routes:** `/dashboard/notifications/**`, `/owner/inbox`.
- **Key tables:** `notifications`, `notification_deliveries`,
  `notification_templates`, `notification_preferences`,
  `in_app_notifications`.
- **Primary roles:** all (per role-scoped routes).
- **Status:** production-ready (default dry-run).
- **Known limitations:** no WhatsApp / Telegram; default dry-run.
- **Post-v1:** WhatsApp Business API + Telegram bot.

### 16. AI Operations Co-pilot
- **Purpose:** read-only analytical assistant for operators (insights,
  summaries, anomaly explanations).
- **Key routes:** `/dashboard/ai/**`.
- **Key tables:** `ai_runs`, `ai_messages`.
- **Primary roles:** director, operations_manager.
- **Status:** demo-ready (Anthropic dry-run by default).
- **Known limitations:** read-only — no write tools.
- **Post-v1:** approval-gated write tools.

### 17. Guest AI Concierge
- **Purpose:** guest-facing concierge with handoff to staff at low
  confidence.
- **Key routes:** `/stay/[token]/concierge`,
  `/dashboard/guest-ai/**`.
- **Key tables:** `guest_ai_conversations`, `guest_ai_handoffs`,
  `guest_ai_handoff_replies`.
- **Primary roles:** concierge.
- **Status:** demo-ready (Anthropic dry-run by default).

### 18. Security / MFA / audit
- **Purpose:** TOTP MFA, recovery codes, login throttle, sensitive-table
  audit, security events log.
- **Key routes:** `/dashboard/security/**`, `/auth/setup/mfa/**`,
  `/auth/setup/admin-bootstrap`.
- **Key tables:** `auth_mfa_factors`, `auth_mfa_recovery_codes`,
  `auth_login_attempts`, `auth_security_events`.
- **Primary roles:** super_admin, security.
- **Status:** production-ready (with WebAuthn deferred).
- **Post-v1:** WebAuthn / passkeys; full server-side throttle.

### 19. Jobs / cron
- **Purpose:** durable background-job runner with per-job locks.
  16 cron routes today.
- **Key routes:** `/dashboard/jobs/**`, `/api/cron/**`.
- **Key tables:** `cron_job_catalog`, `job_runs`, `job_locks`.
- **Primary roles:** super_admin, operations_manager.
- **Status:** production-ready.
- **Auth:** every cron route is gated by `Authorization: Bearer
  <CRON_SECRET>` (production) — see check:cron-auth.

### 20. Deployment readiness
- **Purpose:** static checks, env validation, production gates, system
  health, storage health.
- **Key routes:** `/dashboard/system/deployment`,
  `/dashboard/system/health`, `/dashboard/system/storage`.
- **Scripts:** `npm run check:env`, `check:storage`, `check:cron`,
  `check:cron-auth`, `check:migrations`, `smoke:routes`,
  `staging:report`, `preflight:deploy`.
- **Primary roles:** super_admin.
- **Status:** production-ready.

---

## Module ↔ table cross-reference (high level)

This is a sketch — the canonical list is `drizzle/schema/**`.

| Module group | Tables (representative) |
|---|---|
| Identity & access | app_users · roles · permissions · user_roles · access_grants |
| Owners & villas | owners · villas · owner_villa_links · villa_units |
| Bookings | bookings · booking_channels · booking_holds · rate_plans |
| Direct booking | direct_booking_holds · direct_booking_requests · direct_booking_finance_links · direct_booking_messages |
| Finance & statements | owner_statements · statement_lines · statement_source_groups · expenses · fees · payouts · revenue_entries · taxes |
| Operations | operation_tasks · maintenance_tickets · checklist_items · damage_reports |
| Guest experience | guest_stay_tokens · guest_service_requests · guest_ai_conversations · guest_ai_handoffs |
| Notifications | notifications · notification_deliveries · notification_templates · in_app_notifications |
| Jobs & cron | cron_job_catalog · job_runs · job_locks |
| Security | auth_mfa_factors · auth_mfa_recovery_codes · auth_login_attempts · auth_security_events |

---

## Status legend

- **production-ready** — module passes its tests + RLS + auth gates;
  safe to use in production once env is configured.
- **demo-ready / staging-ready** — module is functionally complete on
  mock + real-DB paths but depends on a stub (PSP, smart-lock,
  channel-push) that ships in stub form for v1.
- **stub** — module shape exists in code; live integration deferred.
- **deferred** — not present in v1; tracked in the post-v1 backlog.
