# Design coverage map — where we are (2026-05-29)

> Cross-references **every app surface in `nrazgulyaev/management-os@main`** against **every design file in this project**. Answers: what's designed, what's built, what still needs designing. Built-status verified via GitHub pull (route trees). Design-status = files in `cabinets/`, `design/`, `*.html` at project root.

## The 12 route groups (whole app)

| Route group | Built (pages) | In design scope? | Design status |
|---|---|---|---|
| `(auth)` — login/signup/MFA | 9 | **was never called out** | 🔴 **NOT DESIGNED** — see Gap 1 |
| `(dashboard)` — Management OS | 299 | ✅ yes | 🟡 major cabinets designed, ~15 secondary not |
| `(development-app)` — Development OS | 58 roots | ✅ yes | 🟡 major cabinets designed, several not |
| `(owner)` — Owner Portal | 21 | ✅ yes | ✅ 7 cabinets designed |
| `(platform-app)` — super-admin | 12 | ✅ yes (Phase 2.5) | 🟡 designed (11 screens) · build pending + diverges |
| `(public)` — marketing/pricing/legal/direct-book | 27 | partial (subscription landing + pricing only) | 🟡 landing+pricing designed; rest not |
| `(guest)` — guest stay portal | 28 | ❌ NOT in scope | ⚪ out of scope (Field/Guest later) |
| `(field)` — field staff | 5 | ❌ NOT in scope | ⚪ out of scope |
| `(investor-portal)` — investor | 20 | ❌ NOT in scope | ⚪ out of scope |
| `(buyer-portal)` — buyer | 7 | ❌ NOT in scope | ⚪ out of scope |
| `(vendor)` — vendor service | 2 | ❌ NOT in scope | ⚪ out of scope |
| `(product-landings)` | — | partial | ⚪ marketing |

---

## A · DESIGNED + BUILT (done — verified live)

These have both a design file here AND a live route in `main`. The audits 01–23 cover the design↔code gap for each.

### Management OS (`cabinets/mgmt-p1` + `mgmt-p2` + `new`)
| Design file | Route | Notes |
|---|---|---|
| `mgmt-p1/bookings.html` | `/dashboard/bookings` (12.6kb +deep) | audit 05 |
| `mgmt-p1/finance.html` | `/dashboard/finance` (31 pages) | audit 06 |
| `mgmt-p1/operations.html` | `/dashboard/operations` (17 pages) | audit 08 |
| `mgmt-p1/owners.html` | `/dashboard/owners` | audit 07 |
| `mgmt-p2/channels.html` | `/dashboard/channels` + integrations | audit 02 |
| `mgmt-p2/concierge.html` | `/dashboard/concierge` | audit 04 |
| `mgmt-p2/dynamic-pricing.html` | `/dashboard/pricing` (8 pages) | audit 03 |
| `mgmt-p2/front-office.html` | `/dashboard/front-office` (17.4kb) | audit 01 |
| `new/mgmt-workspace.html` | `/dashboard` Overview (16.9kb) | audit 23 — **redesign** of existing |
| `new/mgmt-documents.html` | `/dashboard/documents` | built |
| `new/mgmt-inventory-procurement.html` | `/dashboard/inventory` + `/procurement` | built |
| `new/mgmt-owner-intelligence.html` | `/dashboard/owner-intelligence` | built |
| `new/mgmt-utilities.html` | `/dashboard/utilities` (7 pages) | built — was wrongly called "orphaned" in audit 08 |

### Development OS (`cabinets/dev-p1` + `dev-p2` + `new`)
| Design file | Route | Notes |
|---|---|---|
| `dev-p1/projects.html` | `/development-os/projects/[slug]` (41.7kb hub, 32 pages) | audit 12 |
| `dev-p1/cfo.html` | `/development-os/cfo` (11.6kb) | audit 13 |
| `dev-p1/boq-qs.html` | `/development-os/boq` | audit 14 |
| `dev-p1/procurement.html` | `/development-os/procurement` | audit 15 |
| `dev-p2/investors.html` | `/development-os/investors` | audit 11 |
| `dev-p2/sales.html` | `/development-os/sales` | audit 10 |
| `dev-p2/site-supervisor.html` | `/development-os/site-reports` (15–19kb pages) | audit 09 |
| `new/dev-executive.html` | `/development-os` overview (12.9kb) | built |
| `new/dev-marketing.html` | `/development-os/marketing` | built |
| `new/dev-warehouse.html` | `/development-os/materials` / `inventory` | built (verify exact route) |
| `new/dev-workspace.html` | `/development-os/dashboard` | built (verify) |

### Owner Portal (`cabinets/owner-p1`)
| Design file | Route | Notes |
|---|---|---|
| `owner-p1/01-home.html` | `/owner` (15.9kb) | audit 16 |
| `owner-p1/02-statement.html` | `/owner/statements` (+pdf) | audit 17 |
| `owner-p1/03-villas.html` | `/owner/villas` (+health/calendar/revenue/timeline) | audit 18 |
| `owner-p1/04-calendar.html` | `/owner/calendar` (14.4kb) | audit 19 |
| `owner-p1/05-inbox.html` | `/owner/inbox` + `owner_threads`/`owner_messages` (0114) | audit 20 |
| `owner-p1/06-documents.html` | `/owner/documents` | audit 21 |
| `owner-p1/07-settings.html` | `/owner/preferences` + `owner_notification_prefs` (0114) | audit 22 — verify 2FA payout |

---

## B · DESIGNED + BUILD PENDING (Phase 2.5)

### Platform super-admin (`cabinets/super-admin/` — 11 screens) vs `(platform-app)` (12 files built)
**Design is ahead of build here.** The design has 10 screens + hub; the repo `(platform-app)` is thinner and uses different cuts.

| Design screen | Repo route | Status |
|---|---|---|
| `01-organizations.html` | `/platform/organizations` (7.9kb) + `/platform/[orgCode]` | ✅ built |
| `02-users.html` | — (no `/platform/users`) | 🔴 not built |
| `03-plans.html` | — (plans live under `(public)/pricing` + subscription_plans seed) | 🟡 different model |
| `04-billing.html` | `/platform/revenue` (5.5kb) | 🟡 partial overlap |
| `05-feature-flags.html` | — | 🔴 not built |
| `06-support-inbox.html` | — | 🔴 not built |
| `07-audit-log.html` | `/platform/audit` (3.6kb) | ✅ built |
| `08-system-health.html` | `/platform/usage` (5.1kb) | 🟡 partial |
| `09-ai-overview.html` | `/platform/agents` (+`[id]` **39kb!**, `new`, test-chat) | ✅ built — repo is RICHER here |
| `10-mobile.html` | — | mobile pass |
| (no design) | `/platform` root (7kb) | built, design = hub.html |

→ **Action:** Phase 2.5 reconciliation — the design and build diverge. Decide canonical set: design proposes users/feature-flags/support-inbox (not built); repo has a deep agents console (richer than design's ai-overview). Re-scope before building.

---

## C · BUILT but NOT DESIGNED — **in-scope design gaps** (the real to-design list)

### 🔴 Gap 1 — AUTH / sign-in (HIGHEST PRIORITY · every user hits it first)
`(auth)` is fully built but **never received the design-system treatment**:
- `/login` (5.2kb) + form
- `/sign-up` (6.7kb)
- `/setup/admin-bootstrap` (7.6kb) — first-run admin creation
- `/setup/mfa` + `/setup/mfa/verify` + `/setup/mfa/recovery-codes` — 2FA enrollment
- (also `(investor-portal)/login`, `(buyer-portal)/login` — portal-specific logins)

**No design file exists for any of these.** This is the single most-seen surface in the product and the most obvious omission. Recommend designing: sign-in, sign-up, MFA enrollment + verify, recovery codes, admin-bootstrap, plus the password-reset/forgot flow (verify if built). Should use Layer B tokens + Mgmt display font; mobile-first.

### 🟡 Gap 2 — Mgmt secondary cabinets (built, no dedicated design)
The 14-group nav exposes ~60 items; design covers the headline cabinets. Built-but-undesigned mgmt surfaces:
- **Guest stays cluster**: `/dashboard/guest-stays` (+tokens), `/dashboard/guest-services` (+orders), `/dashboard/guest-journey`, `/dashboard/guest-ai` — built, no design
- **Direct bookings**: `/dashboard/direct-bookings` (+deposits) — built, no design
- **Service fulfilment**: `/dashboard/service-fulfilment` — built, no design
- **Payments**: `/dashboard/payments` (+webhooks) — built, no design
- **Integrations**: `/dashboard/integrations` (+conflicts/automation) — built, no design
- **Security · System**: `/dashboard/security` (+auth), `/dashboard/jobs`, `/dashboard/system/health`, `/dashboard/notifications`, `/dashboard/audit`, `/dashboard/settings` — built, no design
- **Portfolio**: `/dashboard/villas`, `/dashboard/projects` (mgmt side), `/dashboard/shares` — built, no design
- **Availability/Readiness**: `/dashboard/availability` (+blocks), `/dashboard/readiness` — built, no design
- **Maintenance-intelligence**: `/dashboard/maintenance-intelligence` (8 pages) — built, no dedicated design (audit 08 covers conceptually)
- **AI/Digests**: `/dashboard/ai` (catalog+runs), `/dashboard/digests` — built, partial design (mgmt-workspace references)

→ These are likely the **Phase 2.6/2.7 (P3/P4)** design targets. Most are built and functional; design would be polish/consistency, not net-new capability.

### 🟡 Gap 3 — Dev secondary cabinets (built, no dedicated design)
`(development-app)` has 58 route roots; design covers ~10. Undesigned built dev surfaces include: `banking`, `cashflow-forecast`, `profitability`, `contracts`, `discounts`, `distributions`, `commitments`, `drawings`, `method-statements`, `knowledge`, `productivity`, `project-cycle`, `assets`/`asset-types`, `bulk-import`, `communications`, `inbox`, `invoices`, `platform`, `channels`(dev), `integrations`(dev), `agents`/`ai-agents`/`agent-digests`.

→ Same as Gap 2: Phase 2.6/2.7 targets; built, design = polish.

### 🟡 Gap 4 — Public/marketing (partial scope)
Per CLAUDE.md, subscription = **landing + `/pricing` only, already designed**. Built but possibly undesigned in `(public)`: `case-studies`, `contact` (7kb), `features/management-os`, `features/development-os`, `guest-experience`, `investor-reporting`, `operations`, `owner-portal`, `portfolio`, `legal/{privacy,terms}`, and the `book/hold/[token]` direct-booking guest flow (8 pages). **Confirm with product** whether these marketing pages are in design scope or stay as-is.

---

## D · BUILT but explicitly OUT OF SCOPE (per CLAUDE.md — do NOT design now)

| Portal | Built | CLAUDE.md scope |
|---|---|---|
| `(guest)` stay portal | 28 pages (check-in, concierge, services, wifi, emergency, guide, requests) | "Field/Guest get their own UI later" |
| `(field)` staff app | 5 pages (tasks, inventory) | NOT in current scope |
| `(investor-portal)` | 20 pages (capital, commitments, distributions, wallet, forecasts) | "Investor… NOT in current scope" |
| `(buyer-portal)` | 7 pages (units, reports, dashboard) | "Buyer… NOT in current scope" |
| `(vendor)` | 2 pages (service token, invoice) | NOT in scope |

These are real, built, functional — but the design wave deliberately excludes them.

---

## E · The honest "where we are" summary

**Built:** ~470 pages across 12 route groups. Nearly the entire product is implemented and live-wired, including auth, all portals, and the phase-2 data layer (`drizzle/0112–0115`).

**Designed (this project):** ~42 cabinet HTML files covering the in-scope mgmt + dev + owner headline cabinets + super-admin + 9 "new" cabinets, plus the design system (`design-system.html`, `ds/`) and mobile passes.

**The design coverage gaps that matter, prioritized:**
1. 🔴 **Auth / sign-in suite** — built, never designed. Highest user-facing visibility. **Top recommendation to design next.**
2. 🟡 **Platform super-admin reconciliation** — design ahead of build but they diverge; re-scope for Phase 2.5.
3. 🟡 **Mgmt + Dev secondary cabinets** — ~30 built surfaces with no dedicated design (Phase 2.6/2.7 polish).
4. 🟡 **Public/marketing pages** — confirm scope.
5. ⚪ Guest/Field/Investor/Buyer/Vendor portals — built, out of scope by decision.

**Real engineering gaps (from the rollup re-validation, not design):** severity vocab (cab 08), `computeSlaStatus` fn + scan job, cross-cabinet attention feed (cab 23), stubbed Overview tiles, P2-cabinet storage-model decisions, owner-settings 2FA verify.

---

## Recommended next design targets (in order)

1. **Auth suite** — sign-in, sign-up, MFA enroll/verify/recovery, admin-bootstrap, forgot-password. One cohesive set, Layer B tokens, mobile-first. Closes the most glaring gap.
2. **Attention/triage feed** (cab 23 headline P0) — the one genuinely-absent product capability; design it as a real Overview module.
3. **Platform super-admin** — reconcile design vs build, then finish Phase 2.5.
4. Phase 2.6/2.7 secondary-cabinet polish passes (mgmt guest-stays cluster, dev finance cluster).
