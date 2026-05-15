# Route inventory — 2026-05-15

Hotfix HF-3 Task 2.1–2.2. Inventory of every routable surface produced
by the Next.js 15 App Router under `src/app/`. Counts are `page.tsx`
files (one per URL). Route groups in parentheses are organizational
folders and **do not** appear in the URL.

**Totals**: 627 page files, 155 API routes, 9 root layouts. Build
manifest reports a successful compile of all routes (`next build`
exit 0, zero errors, zero warnings on 2026-05-15).

---

## (auth) → top-level

- Pages: 6
- Sections:
  - `/login`
  - `/sign-up`
  - `/setup/admin-bootstrap`
  - `/setup/mfa`, `/setup/mfa/verify`, `/setup/mfa/recovery-codes`
- Anomalies: none

## (buyer-portal) → `/buyer-portal`

- Pages: 6
- Sections:
  - `/buyer-portal` — overview
  - `/buyer-portal/dashboard/*`
  - `/buyer-portal/login`
  - `/buyer-portal/reports`
  - `/buyer-portal/units`
- Anomalies: none

## (dashboard) → `/dashboard` (Mgmt-OS)

- Pages: 273
- Sections:
  - `/dashboard` — Mgmt-OS owner overview
  - `/dashboard/ai/*`
  - `/dashboard/audit/*`
  - `/dashboard/availability/*`
  - `/dashboard/billing/*` (layout-only — see anomaly)
  - `/dashboard/bookings/*` (13 pages)
  - `/dashboard/channels/*`
  - `/dashboard/concierge/*`
  - `/dashboard/finance/*`
  - `/dashboard/front-office`, `/dashboard/owner`, `/dashboard/owners`
  - `/dashboard/guests/*`
  - `/dashboard/integrations/*` (7 pages — automation, calendar-events, calendar-feeds, conflicts)
  - `/dashboard/inventory/*`
  - `/dashboard/jobs/*`
  - `/dashboard/operations/*`
  - `/dashboard/settings/*` (11 pages — account-security, ai-agents, integrations, team, users)
  - `/dashboard/system/*` (layout-only — see anomaly)
  - `/dashboard/villas/*` (5 pages)
- Anomalies:
  - `/dashboard/billing` and `/dashboard/system` are **layout-only** (no root `page.tsx`); their children resolve, but the root URL would 404. Investigate whether they should redirect or render an index.
  - **Owner duplicate**: both `/dashboard/owner` and `/dashboard/owners` exist. Likely intentional (one is the cabinet apex, the other a list) — confirm visually during smoke check.

## (development-app) → `/development-os` (Dev-OS)

- Pages: 247
- Sections:
  - `/development-os` — Dev-OS apex
  - `/development-os/ai-agents/*` — 14 dynamic agent dashboards + memory + inbox
  - `/development-os/assets/*`
  - `/development-os/buyers/*`
  - `/development-os/cabinets/*` (9 cabinet apexes — cfo-accountant, project-manager, qs, procurement-manager, sales-manager, marketing-staff, site-supervisor, warehouse-manager + Mgmt-OS my-cabinet)
  - `/development-os/contracts/*`
  - `/development-os/dashboard/*`
  - `/development-os/finance/*` (26 pages)
  - `/development-os/integrations/*`
  - `/development-os/investors/*` (4 pages)
  - `/development-os/marketing/*` (layout-only — see anomaly; 9 subsections — campaigns, content, dashboard, etc.)
  - `/development-os/operations/*` (layout-only — see anomaly; site-reports subsection)
  - `/development-os/platform/*` (layout-only — see anomaly)
  - `/development-os/projects/*` (27 pages, dynamic `[slug]`)
  - `/development-os/reservations/*`
  - `/development-os/site-reports/*`
  - `/development-os/specifications/*`
  - `/development-os/settings/*` — including `/development-os/settings/whatsapp`
  - `/development-os/vendors/*`
  - `/development-os/whatsapp/*`
- Anomalies:
  - **Layout-only folders**: `/development-os/marketing`, `/development-os/operations`, `/development-os/platform`, `/development-os/cabinets` have layouts but no root `page.tsx`. Same pattern as Mgmt-OS `/dashboard/billing` — children resolve, root URL would 404. Pre-existing Mega-Sprint structure; not regressions.

## (field) → `/field`

- Pages: 4
- Sections:
  - `/field` — overview
  - `/field/inventory`
  - `/field/tasks/[id]`, `/field/tasks/demo`
- Anomalies: none

## (guest) → `/stay`

- Pages: 27
- Sections:
  - `/stay/[token]` — dynamic guest portal entry (token-gated)
  - `/stay/[token]/*` — guide, wifi, check-in, concierge, emergency, requests, services, neighborhood, offline, house-rules, verify
  - `/stay/[token]/requests/[code]`, `/stay/[token]/requests/[code]/stream`
  - `/stay/[token]/services/orders`, `/stay/[token]/services/orders/[id]`
  - `/stay/demo/*` — same subsections as `[token]`, no auth (public demo tenant)
- Anomalies: none

## (investor-portal) → `/investor-portal`

- Pages: 14
- Sections:
  - `/investor-portal` — overview
  - `/investor-portal/commitments`, `/investor-portal/commitments/[id]`
  - `/investor-portal/dashboard/*`
  - `/investor-portal/distributions`, `/investor-portal/distributions/[id]`
  - `/investor-portal/documents`
  - `/investor-portal/forecasts`
  - `/investor-portal/login`
  - `/investor-portal/profile`
  - `/investor-portal/requests`
  - `/investor-portal/wallet/[commitmentId]`, `/investor-portal/wallet/reinvest`, `/investor-portal/wallet/withdraw`
- Anomalies: none

## (owner) → `/owner`

- Pages: 17
- Sections:
  - `/owner` — owner-portal overview
  - `/owner/bookings`, `/owner/bookings/[id]`
  - `/owner/calendar`
  - `/owner/inbox`
  - `/owner/preferences/calendar`
  - `/owner/revenue`
  - `/owner/statements`, `/owner/statements/[id]`, `/owner/statements/[id]/pdf`
  - `/owner/stays`, `/owner/stays/[id]`, `/owner/stays/new`
  - `/owner/villas`, `/owner/villas/[id]/calendar`, `/owner/villas/[id]/health`, `/owner/villas/[id]/revenue`, `/owner/villas/[id]/timeline`
- Anomalies: none

## (platform-app) → `/platform`

- Pages: 6
- Sections:
  - `/platform` — platform-admin overview
  - `/platform/[orgCode]` — per-org admin view
  - `/platform/audit`
  - `/platform/organizations`
  - `/platform/revenue`
  - `/platform/usage`
- Anomalies: none

## (public) → `/` (marketing)

- Pages: 25
- Sections:
  - `/` — homepage
  - `/accept-invitation/[token]`
  - `/book/hold/[token]/*` — purchase-flow (payment, status, messages)
  - `/case-studies`
  - `/contact`
  - `/features/development-os`, `/features/management-os` (Sprint LD-2 deep-dives)
  - `/guest-experience`
  - `/investor-reporting`
  - `/legal/privacy`, `/legal/terms`
  - `/operations`
  - `/owner-portal`
  - `/portfolio`
  - `/pricing`
  - `/products/development-os`, `/products/management-os`
  - `/signup`
- Anomalies: none

## (vendor) → `/vendor`

- Pages: 2
- Sections:
  - `/vendor/service/[token]`
  - `/vendor/service/[token]/invoice`
- Anomalies: none

---

## `/api`

155 route files total. Grouped by top-level subfolder:

| Subfolder | Routes | Purpose |
|---|---|---|
| `/api/billing` | 2 | Subscription + payment webhook handling |
| `/api/cron` | 104 | Scheduled jobs — Dev-OS digests, subscription billing, bank sync, alerts |
| `/api/development` | 1 | Internal Dev-OS surface |
| `/api/oauth` | 2 | OAuth callback handlers |
| `/api/offline-sync` | 1 | Offline data sync (mobile/guest portal) |
| `/api/onboarding` | 1 | First-run onboarding flow |
| `/api/push` | 3 | Push notification service |
| `/api/team` | 1 | Team management |
| `/api/v1` | 16 | Versioned public API — holds, investors, leads, projects, quote, transactions, webhooks |
| `/api/webhooks` | 19 | Inbound webhooks — banking, billing, channels, marketing, messaging, payments |
| `/api/whatsapp` | 1 | WhatsApp integration |
