# Feature gap · 15 · Procurement + Vendors (Dev P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built deep. Route `/development-os/procurement`: `purchase-requests`(+`[code]` 8kb/`new`) · `quotation-comparison`(+`[requestCode]` 7.7kb + `matrix-island` 11.5kb) · `quotations`(+`import` wizard **23kb**). **Discard "not built".** Surviving: design↔code deltas (vendor-reliability scoring, quote-matrix specifics) — verify against the procurement feature layer + `procurement_analyst` agent (real, mig 0062).

**Design sources**
- Desktop: `cabinets/dev-p1/procurement.html`
- Phase: 2.2 dev-04 · commit `978bef9`

**Repo paths**
- Feature: `src/features/procurement/` — 4 files (~modest)
- Components: 17 files in repo (rich UI: order-form, award-po-modal, quote-compare, vendor-card, vendor-score, register-vendor-modal, receive-line-form, new-rfq-modal, etc.)
- Routes: 10 files in repo under `procurement/`
- Schema · inventory + procurement (mig 0006): inventory tables + procurement attachments
- Schema · stage 4.A operational workflows (mig 0047): vendor + PO workflows

## TL;DR

Procurement is the **richest UI-side cabinet in Dev OS** (17 components + 10 routes), modest feature folder (4 files). Handles the RFQ → quote-compare → PO award → receiving lifecycle plus vendor scoring. The component set (`order-add-button`, `order-form`, `award-po-modal`, `quote-compare`, `register-vendor-modal`, `receive-line-form`, `new-rfq-modal`, `vendor-card`, `vendor-score`) shows complete workflow coverage. The feature folder is small (4 files) so likely the pattern is similar to BOQ: business logic in components rather than pure modules. **0 P0 if scoring + RFQ math live in components**; otherwise needs pure-module extraction.

---

## Section-by-section

### Vendor management
| Element | Status |
|---|---|
| Vendor CRUD | ✅ via register-vendor-modal + vendor-card |
| Vendor scoring | ✅ vendor-score.tsx — likely composite rating |
| Schema · vendors table | ✅ mig 0047 |

### RFQ → quote compare → PO award
| Element | Status |
|---|---|
| RFQ creation | ✅ new-rfq-modal.tsx |
| Multi-vendor quote intake | ✅ quote-compare.tsx |
| PO award | ✅ award-po-modal.tsx |
| Order tracking | ✅ order-form + order-add-button |

### Receiving + payments
| Element | Status |
|---|---|
| Goods receiving | ✅ receive-line-form.tsx |
| Quality at receipt | ✅ link to cabinet 14 QS via schema |
| Vendor payment | ✅ cross-cabinet to cabinet 13 CFO |

---

## Cross-cutting

### Agents
None procurement-specific.

### Cross-cabinet dependencies
| Cabinet | Direction |
|---|---|
| 12 Projects | POs per project |
| 13 CFO | vendor obligations feed cashflow |
| 14 BOQ + QS | BOQ → RFQ; receiving updates BOQ progress |
| 09 Site supervisor | materials receiving triggers site delivery events |

---

## Recommended additions (prioritized)

### 🔥 P0 — none

### ⭐ P1
1. **Extract scoring + RFQ math** to pure modules for testability.
2. **Vendor scoring algorithm** verification — likely weighted sum (on-time delivery, quality, price competitiveness).
3. **Audit-log integration** for PO award + receiving events (money-touching).

### 💭 P2
4. **Bulk RFQ creation** from BOQ lines.
5. **Vendor performance dashboard** rollup.

---

## Open questions

- **Quote-compare workflow** — does it auto-pick winner or always operator-decided?
- **Vendor approval gate** — director sign-off threshold?
- **PO cancellation policy** — partial receiving + cancel reverse flow?
