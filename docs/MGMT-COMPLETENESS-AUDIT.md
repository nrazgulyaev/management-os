# Management-App Completeness Audit — 2026-06-18

Production-completeness audit of the **management app** (`/dashboard`, ~303 pages, 48 sections) — the internal operator product — across 15 cabinet clusters. Per surface: functional completeness + **org-scoping/authz** + money correctness. Read-only audit → adversarial verify.

## Headline

**The product is broad and mostly production-deep, but the audit found a SECURITY cluster the tenancy sweep missed.** Result: **53 confirmed (21 high, 32 med) + 29 low.**

| Type | n | Note |
|---|---:|---|
| **AUTHZ_SCOPE** | **22** | **Cross-tenant leaks** (BYPASSRLS → every read/write must filter `organization_id`). The #273-280 sweep got most of the surface; these are the stragglers — same lesson as the portal audit. |
| SHALLOW | 10 | missing filter/export/transition/tab |
| MISSING_CRUD | 6 | view-only on an entity the operator must act on (action exists, no UI) |
| STUB / DEAD_END | 5 / 5 | placeholder / can't-finish flow |
| MOCK_DATA | 3 | hardcoded numbers on a real surface |
| BROKEN_DRILL | 2 | link 404s / lands wrong |

## ⚠️ Security — 22 cross-tenant leaks (Wave 1, fix-now)

The worst is **`direct-bookings`** — the whole feature is largely unscoped: `listDirectBookingHolds` / `listDirectBookingRequests` (no org → every tenant's holds/requests/PII/pricing), `getHoldById` / `getRequestDetailById` (foreign-id resolves), and **`cancelDirectBookingHoldAction` — a cross-tenant WRITE-IDOR**: an operator in org A can cancel org B's hold and release its calendar inventory. (6 leaks.)

Other confirmed cross-tenant reads/writes:
- **`security`/`system` section ungated** — no cabinet gate on `/dashboard/security/*` + `/dashboard/system/*`; login-attempts reader + both AI copilot loaders (security, front-office) miss the org filter; `system/health` exposes catalog-wide stats.
- maintenance (`listSuggestionsForPlan`, `scanMaintenanceRisks`), inventory (`upsertStockLevel` insert not org-stamped), owner-intelligence (calendar-prefs query + 9 sub-pages missing the cabinet gate), concierge handoffs query, villa-guides (4 insert paths accept cross-org villa/project ids), jobs (3 readers), owner-stays (create accepts cross-org FK + "global" null-FK policies leak across tenants — **needs a migration** to add `organization_id`), guest-journey (suggestion dismiss/click not org-checked), integrations (calendar events + conflicts inserted with NULL org).

These are the **fix-immediately** class (live cross-tenant exposure on the operator app). Most are mechanical (`requireOrgId()` + `eq(org)` / FK-in-org check); 1-2 need a small migration.

## High functional (Wave 2)
- **`bookings/[id]/edit` DATA-LOSS** — `getBookingById` doesn't return channel/guest/source-ref/notes/pax, so the form defaults them to null and `updateBookingAction` writes null **unconditionally**: editing a date silently wipes the booking's channel link, guest link, notes, and pax counts on every save. (Data-integrity — folded into Wave 1.)
- **finance ledgers** (revenue/fees/expenses/taxes) MISSING_CRUD — no void/reverse/edit; a posted money line (flows into owner statements) is permanently immutable; the schema's `voided`/`reversed` states are unreachable.
- **`bookings/[id]/charges/[chargeId]`** MOCK_DATA — hardcoded $1,200 + dead refund button + orphaned route.
- **operations command center** STUB — two `return []` stubs (housekeeping progress, service requests) → empty cards.
- **`/dashboard/billing`** BROKEN_DRILL — Stripe `success_url` lands on a non-existent/blank page.
- **integrations calendar conflicts** — events/conflicts written with NULL org → conflicts never surface (also an org-stamp bug).

## Med (32) / Low (29)
Scattered SHALLOW (missing filters/exports/transitions), more MISSING_CRUD (action-without-UI), cabinet-gate parity on sub-pages, and polish. Full set in the audit JSON.

## What is production-deep
Most cabinets are genuinely deep: finance (GL/statements/payouts/tax with state-machines), bookings core (5-tab detail + party/charges/settlement), operations tasks, inventory movements, owners (statements/stays/inbox), guest-stays + concierge (token-scoped, rate-limited), pricing, payroll. The gaps are the direct-booking feature's missing org-scoping, a handful of unscoped readers/inserts, and edge functional surfaces.

## Fix waves
- **Wave 1 — security + data-loss (fix-now):** the 22 AUTHZ_SCOPE leaks + the bookings-edit data-loss bug. (+ migration for owner-stays global policies.)
- **Wave 2 — high functional:** finance void/reverse, bookings charges, operations stubs, billing landing, integrations conflicts.
- **Wave 3 — med + low.**
