# Quantity Surveyor brief — Stage 10.E

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.E QS Drawing-Aware Measurement
**Existing surfaces (codebase):**
- `/development-os/quantity-surveying` — landing
- `/development-os/drawings`, `/development-os/drawings/[code]`, `/development-os/drawings/new` — drawing register
- `/development-os/boq`, `/development-os/boq/[code]` — Bills of Quantity
- `/development-os/materials` — material POs
- `/development-os/cabinets/qs` — composite QS landing
- AI agent: `qs_cost_analyst` (Tier 3)
- Server actions: `src/lib/development/server/qs/*-actions.ts`, `src/lib/development/server/drawings/*`

---

## 1. Who is this person?

- **Title variants:** Quantity Surveyor, QS, cost engineer, estimator
- **Tenure / skill profile:** 5-15 years; specialist; CAD / PDF measurement-tool literate (CostX, Bluebeam, Buildxact). Math-heavy, detail-oriented.
- **Device profile:** desktop primary (large monitor for drawings); tablet sometimes used on-site for verification
- **Working context:** office-bound during takeoff phase, on-site for verification + variation orders
- **Volume:** 1-3 active projects, each with 50-200 BoQ line items. Drawing revisions frequent.
- **Reports to:** project manager / cost controller. Often solo on a project.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Drawing takeoff** — measure quantities from PDF/DWG → BoQ line items — currently CostX or manual Bluebeam + Excel
2. **Variation orders** — drawing rev'd → re-measure delta → update BoQ → PM approval
3. **Actual vs. budget reconciliation** — site progress vs. BoQ to flag overruns

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: takeoff is happening **outside** the OS in CostX / Excel, and the BoQ is hand-entered after — meaning Arconique's BoQ surface is downstream of the work, not the work itself. That's the biggest leverage point.

## 4. Refusal points (hypothesis — verify in interviews)

- Anything that doesn't accept their existing PDF/DWG drawing files
- Measurement tools less precise than CostX (units, scale calibration, polygon area, count)
- BoQ that can't import from / export to Excel (every cost engineer has Excel template inheritance)
- No revision tracking on drawings — they need to know "what changed since rev 7"

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/qs.md` (TBD by background research):
- **Pattern A** — overlay-on-PDF measurement tool with scale calibration + colored takeoff strokes
- **Pattern B** — auto-roll-up: measurement strokes feed line items, line items feed BoQ totals (no double-entry)
- **Pattern C** — drawing revision overlay: rev N+1 superimposed on rev N with diff highlights

Anti-patterns:
- Manual transcription from drawing → BoQ
- BoQ that loses link back to source measurement
- Locking out PDF/DWG editing (must allow markup, not just view)

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Drawing-aware measurement (target: takeoff happens INSIDE Arconique)

```
Open drawing → measurement toolbar:
  [↗ length] [⬜ area] [⊙ count] [scale: 1:50]
Click-drag to measure → captured stroke shows length/area
Right panel: "Add to BoQ" → pick category → quantity auto-fills → save
Stroke persists on drawing layer (revision-aware)
```

### Flow 2: BoQ sync from measurements

```
BoQ line item view shows:
  - Quantity: 145.2 m² [from drawings/A-101 rev 3, 4 strokes]
  - Click → drawing opens with strokes highlighted
  - Edit stroke → BoQ auto-updates (audit trail preserves prior value)
```

### Flow 3: Variation order on revision

```
Upload rev 4 → diff overlay vs. rev 3:
  - Strokes that no longer hit anything: flagged
  - New regions without strokes: flagged
  - Generate VO draft → line-item delta → PM approval flow
```

## 7. Acceptance criteria (consumed by Stage 10.E)

- [ ] QS completes takeoff for a 200-line BoQ in ≤8 hours INSIDE Arconique (vs. CostX + Excel today)
- [ ] BoQ line items have ≥90% drawing-stroke provenance (click-through to source measurement)
- [ ] Drawing revision diff surfaces ≥95% of geometry changes (validated against 5 historical project rev pairs)
- [ ] Variation order flow: rev upload → VO draft in ≤3 clicks
- [ ] Excel import/export round-trips a 200-line BoQ without data loss (operator sanity check)
- [ ] AI agent `qs_cost_analyst` can answer "why did line N change?" with stroke-level evidence

## 8. Out of scope for Stage 10

- DWG (CAD-native) editing — PDF + raster overlays only in 10.E
- 3D model takeoff (BIM/IFC) — Stage 11+
- Auto-classification of drawing elements via vision AI — Stage 11+
- Sub-contractor BoQ comparison (overlap with 10.H Procurement RFQ matrix)

## 9. Open questions

- Do QS staff currently pay for CostX seats? If yes, replacing it is a hard sell unless feature-parity is high.
- How much DWG-vs-PDF mix? Some sites are still DWG-native.
- Are takeoff strokes considered IP that the QS keeps after engagement, or work-for-hire?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/qs.md`
- Interview synthesis: `docs/ux-research/interviews/qs/synthesis.md` (pending — sample 2-3 QS practitioners)
