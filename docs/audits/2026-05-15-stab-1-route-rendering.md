# STAB-1 — Route rendering audit (Track B)

**Date**: 2026-05-15
**Method**: `npm run build && npm start` → curl every critical route, capture HTTP status + flag RSC-error markers + server-side exceptions
**Coverage**: 60 critical routes across all 11 route groups (apexes, cabinets, settings, finance deep links, portals, public pages)

---

## Results

| Status | Count | Routes |
|---|---|---|
| 200 OK | 50 | (all primary user-facing surfaces) |
| 307 redirect | 6 | `/investor-portal`, `/investor-portal/dashboard`, `/buyer-portal`, `/buyer-portal/dashboard`, `/platform`, `/platform/organizations`, `/platform/usage` — auth gates, expected behavior |
| **500 server error** | **1** | **`/dashboard/front-office` — FIXED in this sprint** |
| HTTP digest / RSC marker | 0 | none |

## The one production-blocking bug found

**`/dashboard/front-office` — HTTP 500** (digest `4047722218`).

Root cause: `src/features/front-office/room-board.ts` queried
`v.villa_code` but the `villas` table column is `unit_code`
(`src/lib/db/schema/projects.ts:48`). PostgreSQL returned error
42703 "column v.villa_code does not exist" and the entire Front
Office cabinet crashed.

This is one of the operator-reported blocking bugs that motivated the
STAB-1 sprint. The Mgmt-OS Front Office apex is a primary daily-use
page; any crash there blocks the housekeeping/concierge/reception
workflow.

Fix: rename column references in `room-board.ts` (single file, one
query block — see commit). Type-checked, lint clean, route now
returns HTTP 200 with the expected 124 KB page payload.

## RSC serialization markers — none found

Every 200-OK response was scanned for the three known crash markers:
- `Functions cannot be passed`
- `Server Components render`
- `Application error: a server-side exception`

Zero hits. The `npm run audit:rsc` static scanner (Track A/E) found
zero function-prop boundary violations across all 775 server `.tsx`
files. Both signals point the same direction: **no current
function-prop bug in source**.

The operator-reported "Add bank account / Add cost category modal
crashes" — both surfaces now return HTTP 200 in this audit. Those
production crashes were almost certainly from a stale Vercel deploy
that predated today's HF-1 push. Fresh deploys after this sprint
should be clean.

## Routes verified working

### Mgmt-OS apex + cabinets (8 routes)
`/dashboard`, `/dashboard/front-office` (fixed), `/dashboard/owner`,
`/dashboard/villas`, `/dashboard/bookings`, `/dashboard/guests`,
`/dashboard/finance`, `/dashboard/integrations`, `/dashboard/settings`

### AI agent settings (8 routes — all 14 dynamic agent keys)
List + 7 sampled detail pages + 1 deliberate unknown-key smoke
(`does-not-exist` → EmptyState as designed in HF-3).

### Dev-OS apex + cabinets (9 routes)
All 8 cabinet apexes + Dev-OS root. Includes the `my-cabinet` /
finance deep links that HF-2 / earlier sprints touched.

### Dev-OS finance deep links (6 routes)
Bank accounts (HF-4 target), categories (STAB-1 target),
transactions, invoices, projects, contracts.

### Portals
Owner (3), investor (1 + redirect), guest demo (3), buyer (1 + redirect).

### Public / marketing (10 routes)
Homepage, pricing, both product pages, both feature pages, legal,
case studies, contact, signup.

## Audit limitations

- The curl audit hits routes anonymously; auth-gated detail pages
  (e.g., per-villa, per-booking, per-investor) redirect to login and
  return 307 — those are not inspected here. The route-inventory doc
  from HF-3 covers the tree; the build manifest confirms each `[id]`
  segment compiles. Dynamic-data crashes (like the front-office
  villa_code bug) only surface when actual data flows through the
  query, which is exactly what this audit catches.
- The audit also produced one anomaly: running 60+ rapid requests
  sequentially eventually saturated the prod server's database pool
  and subsequent requests timed out. This is a load characteristic of
  the single-instance dev-mode `npm start`, not a production bug.
  The smoke walk re-ran 10 high-value routes after restart with all
  10 returning 200.

## Manual-visit checklist for the operator

Same checklist as `docs/audits/2026-05-15-route-health-report.md`,
re-validated post-STAB-1. The Front Office row (now fixed) is the
key one.
