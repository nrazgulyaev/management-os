# Procurement Manager brief — Stage 10.H

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.H Procurement RFQ Matrix
**Existing surfaces (codebase):**
- `/development-os/procurement/purchase-requests`
- `/development-os/procurement/quotations`
- `/development-os/procurement/quotation-comparison`
- `/development-os/materials`, `/development-os/materials/[poCode]`, `/development-os/materials/deliveries`
- `/development-os/cabinets/procurement-manager`
- AI agent: `procurement_analyst` (Tier 3)
- Server actions: `src/lib/development/server/procurement/*`, `src/lib/development/server/materials/*`

---

## 1. Who is this person?

- **Title variants:** Procurement Manager, Buyer, Materials Manager
- **Tenure / skill profile:** 5-15 years; vendor-relationship-heavy; uses Excel + email + WhatsApp + sometimes Coupa/Procurify
- **Device profile:** desktop primary, phone for vendor follow-ups + on-site delivery acceptance
- **Working context:** mostly office; site visits for delivery acceptance + vendor meetings
- **Volume:** 5-15 active RFQs per week; 50-200 active POs per project; 20-50 vendors in rotation
- **Reports to:** project manager / director. Coordinates with: QS (specs), finance (payment), site supervisor (delivery).

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **RFQ → quote comparison → vendor selection** — currently Excel matrix + WhatsApp/email
2. **PO issuance + delivery tracking** — currently email PO + WhatsApp follow-up
3. **3-way match (PO ↔ delivery ↔ invoice)** — currently manual; biggest fraud-risk area

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: existing `/procurement/quotation-comparison` is form-driven. Real procurement happens in a side-by-side matrix view with vendor as columns and line items as rows — Excel-shaped. Anything that doesn't match that shape gets exported to Excel and the OS becomes write-only.

## 4. Refusal points (hypothesis — verify in interviews)

- Quote comparison that hides total / lead-time on hover (must be visible at-a-glance)
- RFQ that requires re-typing the spec for each vendor (one spec, many vendors)
- POs that don't link back to source RFQ + winning quote (audit fail)
- Delivery acceptance that requires a desktop (delivery happens at site)

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/procurement.md` (TBD by background research):
- **Pattern A** — RFQ matrix: line items × vendors, with cells showing unit price + lead time + total; auto-highlights winner per line, rolls up to "split award" suggestions
- **Pattern B** — vendor scorecard: on-time %, quality % (returns/disputes), price-trend — surfaced inline at award time
- **Pattern C** — 3-way-match auto-flag: PO + GR + invoice variance > tolerance triggers review queue

Anti-patterns:
- Quote comparison as separate per-vendor pages (defeats comparison)
- Award decision without surfacing vendor history
- Mobile delivery acceptance buried 4 taps deep

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: RFQ matrix (target: vendor selection in ≤10 min for 20-line RFQ × 5 vendors)

```
/procurement/quotation-comparison/[rfq] → 
  Header: RFQ scope, deadline, status
  Matrix: 
                Vendor A    Vendor B    Vendor C    Vendor D
  Cement 50bg   $250 ★      $268        $245 ★      $260
  Sand 1m³      $80         $75 ★       $82         $78
  ...           ...
  Delivery      14d         10d ★       21d         14d
  Total         $X,XXX      $X,XXX      $X,XXX      $X,XXX
  ★ = best in column
  Click cell → vendor scorecard popover
  "Award split" button: per line winner pre-selected; click to override; generates split POs
```

### Flow 2: Mobile delivery acceptance

```
On phone at site:
  Tap notification "Delivery from Vendor B arriving"
  → PO auto-loaded with line items
  → For each line: 
    [count delivered] [photo] [accept / partial / reject]
  Submit → posts to /materials/deliveries → notifies finance for invoice match
```

### Flow 3: 3-way-match exception queue

```
/procurement/exceptions → 
  list of POs where invoice $ ≠ delivery $ ≠ PO $
  card: PO + delivery + invoice side-by-side
  variance highlighted
  resolve actions: [request credit] [accept variance with note] [escalate]
```

## 7. Acceptance criteria (consumed by Stage 10.H)

- [ ] Procurement manager evaluates a 5-vendor × 20-line RFQ in ≤10 minutes (matrix view)
- [ ] Vendor scorecard surfaces inline; ≥3 historical metrics (on-time %, quality %, price trend)
- [ ] Split-award generates per-vendor POs in ≤3 clicks
- [ ] Mobile delivery acceptance: PO → photo → accept in ≤60 seconds per line
- [ ] 3-way-match exceptions auto-flag at 5% variance threshold (configurable per category)
- [ ] AI agent `procurement_analyst` answers "is this vendor's price competitive?" with cohort comparison

## 8. Out of scope for Stage 10

- Vendor self-service portal (vendor logs in to submit quotes) — Stage 11 candidate
- Auto-RFQ from QS BoQ change → vendor email blast — Stage 11 (cross-cuts QS phase 10.E)
- Sourcing optimization AI ("buy from C in dry season, A in monsoon") — Stage 12+
- Forex hedge UI (FX surface exists in `/finance/fx`)

## 9. Open questions

- Is split-award common in this market, or do they always single-source per RFQ?
- How are vendor relationships maintained — formal vetting, or trust-based long-term?
- Do they want WhatsApp send for RFQ, or email-only?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/procurement.md`
- Interview synthesis: `docs/ux-research/interviews/procurement/synthesis.md` (pending — 2-3 procurement managers)
