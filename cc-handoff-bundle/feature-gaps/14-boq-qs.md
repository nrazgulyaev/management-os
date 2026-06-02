# Feature gap · 14 · BOQ + QS (Dev P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Routes: `/development-os/boq` (`page.tsx` 4.7kb + `[code]`(+`export`/`import`) 6.9kb + `new` + `quick-entry`+form 8.5kb). Per-project BOQ also at `/development-os/projects/[slug]/boq`(+`[lineId]`). Feature: `boq/`. **Discard "not built".** Surviving: design↔code deltas (variance-pill logic, import wizard specifics) — verify against the BOQ feature layer.

**Design sources**
- Desktop: `cabinets/dev-p1/boq-qs.html`
- Phase: 2.2 dev-03 · commit `f29e8b6`

**Repo paths**
- Feature: `src/features/boq/` — 1 file (`schema.ts`). Very thin feature folder.
- Components: `src/components/boq/` — 8 files in repo
- Routes: `src/app/(development-app)/development-os/boq/` — 7 files
- Schema · BOQ + specs (mig 0055): BOQ items, specs
- Schema · methods + quality (mig 0056): methods statements, QA
- Schema · quality + warehouse (mig 0051): quality control + warehouse
- Schema · work packages + schedule (mig 0052): WP scheduling

## TL;DR

BOQ + QS is **the thinnest feature folder in Dev OS** (1 file: schema.ts) compensated by **rich schema across 4 migrations** (0051, 0052, 0055, 0056). The cabinet manages bill-of-quantities, methods statements, quality control, and work-package scheduling — heavy construction-domain workflows. The pure logic gap is notable: no `actions.ts`, no `services.ts`, no pure modules for the calculation-heavy BOQ flow. Components likely contain business logic inline (anti-pattern for a heavy domain). 8 components + 7 routes show that UI is built; the data + actions layer is the gap.

---

## Section-by-section (inferred)

### BOQ index + per-line

| Element | Status |
|---|---|
| BOQ items table | ✅ schema (mig 0055) |
| BOQ table component | ✅ `boq-table.tsx` (was in flat-imported set) |
| BOQ line edit + import modals | ✅ shipped |
| Variance tracking | ✅ via `variance-card.tsx` + `approve-variance-modal.tsx` + `reject-variance-modal.tsx` + `variance.ts` (pure module) |

### QS / quantity surveys

| Element | Status |
|---|---|
| Work-package tree (`wp-tree.tsx`) | ✅ shipped |
| Methods statements | ✅ schema (mig 0056) |
| Quality control | ✅ schema (mig 0051) |

---

## Cross-cutting

### Agents
None BOQ-specific.

### Cross-cabinet dependencies

| Cabinet | Direction |
|---|---|
| 12 Projects | BOQ per project |
| 13 CFO | BOQ feeds cashflow forecast |
| 15 Procurement | BOQ → RFQ → PO flow |
| 09 Site supervisor | site progress against BOQ |

---

## Recommended additions (prioritized)

### 🔥 P0
1. **Add `src/features/boq/{actions,services,queries}.ts`** — currently feature folder has only `schema.ts`. Heavy BOQ math (variance calc, progress against quantities) needs a pure-fn layer to be testable.
2. **Variance approval flow wiring** — modals exist, audit-log integration unclear.

### ⭐ P1
3. **BOQ → RFQ bridge** to procurement.
4. **Methods statement workflow** — schema exists, surface unclear.

---

## Open questions

- **Why no actions.ts** — is BOQ logic inlined in route page.tsx files? If so, refactor for testability.
- **Variance approval gate** — by whom? Director? PM? Confirm.
- **Quality control integration** — site reports flag defects; does that flow into QS retention amounts?
