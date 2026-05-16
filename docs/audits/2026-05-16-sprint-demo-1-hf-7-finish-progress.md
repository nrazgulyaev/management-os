# DEMO-1 + HF-7-FINISH — progress doc (partial ship + deferred tasks)

**Date**: 2026-05-16
**Status**: A4 (cross-links) + B1 (XLSX read) + B2 (seed script) shipped; A5 / A6 / A7 / B3 / B4 deferred to follow-up sprints per the context-pressure halt condition.

---

## Why this sprint stopped here

The brief was two full sprints squashed into one: 4 polish tasks + 4 seed-related tasks across 17 entity types. After ~17 prior sprints today, the highest-leverage subset is the seed script (it unlocks operator dogfooding) + the cabinet ↔ transactions cross-links (the smallest, most-requested UX fix). The rest needs fresh context.

## What shipped

### A4 ✅ — Transactions list ↔ cabinet cross-links
Added "+ Quick entry" + "Import CSV/XLSX" CTAs to the transactions list header in `src/app/(development-app)/development-os/finance/transactions/page.tsx`. The CFO/Accountant cabinet already had the reverse direction (quick-action strip linking to quick-entry + import + tax assistant) — this completes the bidirectional flow. No new components, just buttons.

### B1 ✅ — XLSX read + schema-fit check
Read `docs/reference/arconique-real-data-sample.xlsx` (43 MB, 4468 transaction rows). Extracted canonical lists:
- **6 real projects**: Prime Park Villas, Mexico Villas, Views Villas, Japanese Villas, Back Office, New Land (the "Total" row in the XLSX is a sum, excluded)
- **21 cost categories** — exact list from the XLSX, matches the spec's seed list (one rename: "Workplace and Infrastruktur" not "Workplace and Infrastructure" — kept the XLSX spelling)
- **3 real cash holders**: Pak Rachmat, Alyaa, KLNR Real Estate (the spec mentioned a 4th — "Paradise Properties Development" — which doesn't appear in the real data, so the seed script ships 3 + a 4th synthetic USD bank for KLNR)

**Schema fit**: the XLSX has TWO date columns (cash advance + actual). The current `dev_transactions` schema has only one date column. Per spec halt condition for a missing column, the operator decision is needed for a migration; the seed script uses the *actual* transaction date and drops the cash-advance date (the cleaner fallback per the spec).

### B2 ✅ — Seed script shipped at `scripts/seed-arconique-demo.ts`

Wired as:
```
npm run seed:arconique-demo               # insert
npm run seed:arconique-demo -- --wipe     # remove all DEMO- rows
npm run seed:arconique-demo -- --org=<id> # target a specific org
```

Idempotent (ON CONFLICT skip + WHERE-LIKE wipe). Seeds 5 entity types with `DEMO-` prefix on their unique code/slug fields:

| Entity | Count | Marker pattern |
|---|---|---|
| Projects | 6 | `slug: demo-prime-park-villas`, name: `[DEMO] Prime Park Villas` |
| Cost categories | 21 | `code: DEMO-MATERIAL`, name: `[DEMO] Material` |
| Bank accounts | 4 | `code: DEMO-HOLDER_RACHMAT_IDR` |
| Vendors | 15 | `code: DEMO-TOKO_BANGUNAN_SEJAHTERA` |
| Transactions | up to 100 | `code: DEMO-TXN-2026-000001`, sampled from the real XLSX |

Wipe matches `% DEMO-%` prefix and scopes by `organizationId` (TENANT-1 pattern), so it cannot touch a sibling tenant's data. **All inserts are TENANT-1 compliant** — every row carries `organizationId` and the HF-5 baseline is still empty after this sprint.

The transactions sampler walks the real XLSX (4468 rows), takes an evenly-distributed stride of 100, resolves each row's category/project/holder to the seeded FK ids, parses the Excel-serial date, computes USD-minor from the row's actual fx rate (16400–16900 range), and inserts. Rows that don't map to a known holder or category are skipped — no garbage in production.

## Deferred — sprint shapes for the next round

### A5 — Tax types Add functionality (~1–2 hours)
Audit `/development-os/finance/tax-types` first (route may not exist yet), then build the modal CRUD following the bank-account-modal-form pattern. Schema for tax types already has `organizationId` (TENANT-1 backfilled it).

### A6 — Invoices consolidation (investigation)
Three Invoices entries in sidebar (BUILD & SELL / CAPITAL / SERVICE FULFILMENT). Static investigation only — read each route's data layer, document whether 3 entities or 3 routes to one table. Ship a decision doc. No code change in the investigation; remediation is a follow-up.

### A7 — Admin "view as investor" preview (~½ day)
Touches middleware (session-cookie `preview_role` + role resolution). Banner across top + exit action. Recommend a focused sprint because it interacts with the auth flow which is the most security-sensitive surface in the codebase.

### B3 — Demo data management UI (~half day)
`/settings/demo-data` admin route showing per-entity counts + "Refresh" / "Wipe" buttons that call into the seed module. Need a thin server-action wrapper around the seed script (since the script reads the XLSX from disk, the wrapper needs to bundle the XLSX or move the canonical lists into a `.ts` constant file).

### B4 — Run seed against operator's org
Operator runs `npm run seed:arconique-demo` against the production DB once. The script is idempotent so re-running is safe; the `--wipe` flag tears it back down for a clean slate.

### Deferred entities (would-be DEMO-2)
12 entity types from the original spec couldn't ship in this sprint because they need either an `is_demo` schema column OR don't have a unique code field to prefix:
- villas, owners, bookings, investors, commitments, distributions, site reports, BoQ docs + sections + items, purchase requests + quotations + POs, materials + locations + movements, leads + sources + conversations, maintenance templates + plans + tasks, AI agent runs.

For DEMO-2, the cleanest path is one of:
1. Add an `is_demo boolean DEFAULT false` column to each table that needs it (small migration, would need operator sign-off per the spec's halt condition).
2. Use a magic substring in a free-text field (e.g. notes containing `[DEMO]`). Brittle; not recommended.

Recommended: schedule a migration sprint to add `is_demo` to ~12 tables, then DEMO-2 expands the seed script to the full 17-entity scope.

## Gates

| Gate | Result |
|---|---|
| Typecheck | exit 0 |
| RSC audit | 0 violations |
| Runtime config audit | 3/3 passed |
| HF-5 baseline | empty |
| Build | clean (carried) |
| Modal smoke | unchanged from HF-8 (12 passed / 2 skipped) |

## Files changed

```
src/app/(development-app)/development-os/finance/transactions/page.tsx  +12 / -0  (A4 cross-links)
scripts/seed-arconique-demo.ts                                          (new, ~360 lines)
package.json                                                            +1  (seed:arconique-demo script)
docs/audits/2026-05-16-sprint-demo-1-hf-7-finish-progress.md            (this file)
```

## Operator next steps

After this lands:

1. **Run the seed** against your local Arconique org:
   ```
   npm run seed:arconique-demo
   ```
   Then visit `/development-os/finance/transactions` and you should see 100 DEMO- prefixed rows distributed across 6 projects + 3 cash holders, in the same shape as the real XLSX.

2. **Decide on `is_demo` migration scope** for DEMO-2. The 12 unseeded entity types all need a way to mark demo rows for wipe. Cleanest is a small migration adding one column to each affected table.

3. **A5–A7 polish + B3/B4 management UI** are sized for the next sprint (each ~1–2 hours except A7 which is half a day).
