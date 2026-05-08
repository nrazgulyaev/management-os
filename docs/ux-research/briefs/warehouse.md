# Warehouse Manager brief — Stage 10 backlog

**Status:** draft (interviews pending) — Stage 10 backlog (not in 10.C–10.K phase set)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** (none directly; informs Stage 10.M Mobile Optimization + future stages)
**Existing surfaces (codebase):**
- `/development-os/inventory`, `/inventory/items`, `/inventory/locations`, `/inventory/movements`, `/inventory/stocktake`
- `/development-os/cabinets/warehouse-manager`
- `/development-os/asset-types`, `/development-os/assets`
- Server actions: `src/lib/development/server/inventory/*`

---

## 1. Who is this person?

- **Title variants:** Warehouse Manager, Stock Controller, Storekeeper
- **Tenure / skill profile:** 3-10 years; physical role; barcode-scanner literate
- **Device profile:** mobile primary (warehouse floor); desktop secondary (admin, reporting)
- **Working context:** physical warehouse / storeroom; receives, picks, transfers
- **Volume:** 100-500 SKUs (mix of construction materials + operations consumables); 5-30 transactions/day
- **Reports to:** procurement / operations manager.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Receive incoming PO** — count, photo, accept/partial — currently paper + WhatsApp
2. **Issue / transfer** — pick for villa or vendor — currently paper requisition
3. **Stocktake** — periodic count vs. system — currently spreadsheet

## 3. Friction (hypothesis)

Pattern hypothesis: existing inventory surface is desktop-grid-shaped; warehouse manager needs a phone app with barcode scan as primary input. Without that, they keep a paper book and re-key into the desktop weekly.

## 4. Refusal points (hypothesis)

- Mobile UI that's just a shrunk desktop grid (per ref-app anti-pattern from Sortly/Fishbowl/Cin7 research)
- Mandatory pre-existing barcodes (must allow add-on-the-fly)
- Hidden in-transit stock between locations
- One-SKU-per-location restriction

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/warehouse.md` (research complete):
- **Pattern A** (Sortly) — mobile-first photo + scannable code as primary identifiers
- **Pattern B** (Cin7) — separate dedicated floor app from desktop admin (different mental model)
- **Pattern C** (Fishbowl) — transfer-as-first-class lifecycle object (not a single update)

## 6. Proposed flow (sketch — defer to backlog phase)

To be detailed when scheduled. Stage 10.M Mobile Optimization should make the existing `/inventory/*` surfaces tablet-usable as a partial step.

## 7. Acceptance criteria (placeholder)

To be defined.

## 8. Out of scope for Stage 10

- Custom barcode label printing
- Demand forecasting AI
- RFID hardware integration

## 9. Open questions

- Does the org already have barcode scanners, or is phone-camera scan acceptable?
- How much overlap between construction-materials warehouse and operations-consumables warehouse — same person, same tool, or different?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/warehouse.md`
- Interview synthesis: `docs/ux-research/interviews/warehouse/synthesis.md` (pending — 1-2 sessions when scheduled)
