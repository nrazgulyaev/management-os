# Portal Completeness Audit — 2026-06-17

Production-completeness audit of the **6 external-facing portals** (owner / investor / buyer / guest / field / vendor), mirroring the dev-OS audit. Each page checked on **3 dimensions**: functional completeness (STUB/DEAD_END/MOCK_DATA/MISSING_CRUD/BROKEN_DRILL/SHALLOW), **design-system** (does the DS CSS resolve), and **per-entity authz scoping** (is each read scoped to the authenticated entity, not just org). Read-only audit → adversarial verify.

## Headline

**Portals are functionally solid and the design-system is fine — the real finding is a security cluster.** Result: **18 confirmed (8 high, 10 med) + 9 low.**

| Type | n | Note |
|---|---:|---|
| **AUTHZ_SCOPE** | 8 | **6 high = client-facing cross-entity IDORs** (the story). No RLS on the connection → portal reads must filter by entity. |
| DEAD_END | 3 | field quick-actions → demo; vendor invoice submit throws in prod; field shell bell/avatar inert |
| MOCK_DATA | 2 | owner villa bedrooms/amenities hardcoded; investor forecasts decorative fabrication |
| SHALLOW | 2 | owner villa occupancy dead panel; vendor invoice no file upload |
| STUB | 1 | investor Q4 brief narrative placeholder |
| MISSING_CRUD | 1 | buyer KYC has no portal surface |
| BROKEN_DRILL | 1 | field inventory rows drill out into /dashboard |
| **DESIGN_SYSTEM** | **0** | **The "black buttons" was already fixed** — every portal sets `data-product` via its shell (owner="owner", guest StayShell="guest", buyer/field="management", investor/vendor="development"). |

## HIGH (8)

### Cross-entity IDORs — FIXED in PR #293
1. **Shared document download (owner + investor)** — `/api/documents/[id]/download` was org-only; any owner/investor could download another entity's docs (agreements, receipts, internal files). → per-entity scoped routes `/api/owner/documents/[id]/download` + `/api/investor-portal/documents/[id]/download`; shared route hardened to `requireInternalUser` (operators only).
2. **Owner distributions PDF** — linked to org-only `/api/finance/statements/[id]/pdf` → download another owner's statement. → repointed to owner-scoped `/owner/statements/[id]/pdf`.
3. **Buyer progress reports — list + detail + dashboard** — read `where status='published'` with no buyer filter (false "RLS scopes" comment) → every org's reports. → `src/lib/buyer-portal/reports.ts` scopes to the buyer's own projects; detail `notFound()`s foreign ids.

### Functional dead-ends — OPEN
4. **field quick-actions** (DEAD_END) — all 4 cards (`field-quick-actions.tsx`) hardcode `href="/field/tasks/demo"` → a real worker lands on the demo mock. Fix: point Damage report at the real route, build/remove the others.
5. **vendor invoice submit** (DEAD_END) — `createVendorInvoiceAction` calls `requirePermission('service_invoice.write')` + `requireOrgId()`, which throw for a token-only vendor (no session) → invoice can NEVER be submitted in a live tenant. Fix: a token-based `createVendorInvoiceFromTokenAction` (scope via `fulfilmentFromToken`), mirroring the other 5 vendor actions.

## MED (10)
owner villa bedrooms/amenities hardcoded (MOCK); owner villa "Occupancy · 6 months" permanent empty panel (SHALLOW); investor Q4 narrative card placeholder (STUB); investor forecasts assumptions/scenario-bars/fallback-IRR/ramp fabricated (MOCK, money surface); buyer KYC no portal surface (MISSING_CRUD); **guest 5 content pages (offline/house-rules/neighborhood/guide/emergency) skip the OTP-gate + rate-limit + access-log** the 6 siblings apply (AUTHZ — token-scoped, not cross-guest, so defense-in-depth); field task detail loader org-scoped but not assignee-scoped → cross-coworker read (AUTHZ med); field inventory rows drill into `/dashboard` (BROKEN_DRILL — shell escape); field shell bell + avatar inert (DEAD_END); vendor invoice form has no document upload (SHALLOW).

## LOW (9)
owner settings disabled edit/2FA/delegates (disclosed); investor two divergent session resolvers (impersonation breaks lib-layer pages); investor reinvest target-project picker loads ALL projects unscoped (names only); buyer Documents page hardcodes `stone-*` instead of DS tokens (the only DESIGN_SYSTEM finding); guest offline print uses `javascript:` URL; guest stay timeline has a hardcoded "Breakfast included" row; vendor invoice no confirmation artifact; vendor off-host design-token degradation; vendor guest-phone block permanently dead.

## What is production-deep
All 6 portals are largely production-deep and **correctly entity-scoped in their main flows** — the IDORs are specific outliers, not the norm. owner (getCurrentOwnerContext + per-detail ownership guards, working scoped statement PDF), investor (requireInvestorSession + investor_id WHERE on every read, exemplary write actions), buyer (the (buyerId,unitId) assignment gate before any unit read, real money flows re-validated, buyer download route already scoped), guest (token = entity key, sensitive reveals rate-limited + cross-checked), field (real task detail + offline capture + org-scoped writes), vendor (token-hash scoping + a genuine vendor-safe allow-list projection).

## Fix waves
- **Wave 1 — security (the 6 IDORs) ✅ PR #293.**
- **Wave 2 — functional:** field quick-actions, vendor token invoice action (+ upload), guest OTP-gate on the 5 content pages, field cross-coworker task gate + inventory drill, owner villa real data, investor narrative/forecasts honesty, buyer KYC.
- **Wave 3 — low polish.**
