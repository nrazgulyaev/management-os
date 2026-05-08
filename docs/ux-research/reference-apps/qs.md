# Quantity Surveyor reference apps

Role context: Quantity Surveyor doing on-screen takeoff measurement on architectural drawings (PDF, DWG, sometimes IFC/Revit), generating a Bill of Quantities, and reconciling actuals against the budgeted BoQ as construction progresses. Specialised desktop role on a high-resolution monitor; tablet sometimes used on-site for verification. Biggest frictions: (1) drawings revise mid-project and the QS has to re-measure only what changed, (2) BoQ rates and quantities live in different tools and drift, (3) site-actuals reporting back to the BoQ is usually manual paperwork.

## CostX (RIB / Exactal)

### Positioning
The category-defining QS desktop platform, originated in Australia, now owned by RIB. Built specifically for quantity surveyors (not for general contractors), with takeoff and costing workbooks live-linked so a re-measure on the drawing updates the BoQ value automatically. Standard tool in commercial QS firms across AU, NZ, SEA, ME.

### Top 3 patterns
- **Live-linked takeoff -> workbook -> BoQ chain.** A measurement drawn on the PDF/DWG flows into a named takeoff, which is referenced by formula in the workbook (rate x quantity), which feeds the BoQ. Change the drawing, the BoQ value updates. For Arconique villa development, this is the right model: every measurement on the architect's plan should be a live cell behind the budget, not a copy-pasted number.
- **Revision-comparison overlay between drawing versions.** Load v3 over v2 and the changed regions are highlighted automatically, so the QS only re-measures what moved. Mid-construction this is a 10x time saver — Arconique should support drawing-revision overlay as a first-class workflow because Bali architectural revisions are constant.
- **Named-property takeoff groups with auto-aggregation.** Each measurement is tagged with subject (wall, slab, finish) and attributes (room, level, finish-type) so quantities aggregate by any dimension without re-measuring. The workbook then pivots by tag. Arconique should adopt the tag-driven aggregation model — measure once, report by villa / level / finish / phase.

### Pricing
$$$ — Perpetual licence from ~US$4,500 one-time for the entry tier (Takeoff 2D), full CostX much higher; annual maintenance on top. Enterprise-only pricing in practice.

### Why useful for Arconique
CostX is the reference for what serious QS workflow looks like end-to-end. Arconique won't replicate the desktop power, but the live-link model (drawing -> measurement -> workbook -> BoQ -> actual) is the architecture Arconique's villa-development module should mirror, even if simplified.

## Bluebeam Revu

### Positioning
The construction industry's standard PDF markup and measurement tool, used by architects, engineers, contractors, and QSs alike. Not a dedicated estimating tool — but its Count / Length / Area markup tools plus the Markups List export make it the de-facto takeoff app for anyone who already has the PDFs and doesn't want a full QS suite.

### Top 3 patterns
- **Tool Sets: reusable, named markup palettes per project / per material.** The QS builds a tool set ("Tile - 600x600 porcelain", "Wall - 200mm hollow block", "Door - DR-01 Teak") once, and every subsequent count or length measurement uses the right symbol, colour, and metadata. Arconique should support per-villa-type tool sets so that measurements come pre-tagged with material and unit cost.
- **Count tool with auto-incrementing legend on the drawing.** Click each instance of a fixture; a running count appears on the drawing and as a live legend block (which updates as you add/remove counts). The legend stays on the sheet so the QS, contractor, and architect see the same number. Adopt the on-drawing legend pattern for Arconique site walks — the count belongs visible on the plan, not buried in a sidebar.
- **Markups List as a structured spreadsheet view of every annotation.** Every count, length, and area is a row with sortable columns (subject, label, count, length, area, status, author, date). Sort, filter, group, export to CSV/Excel. This is the bridge between drawing-world and spreadsheet-world; Arconique's takeoff data model should be designed so the same row-per-measurement view is always available.

### Pricing
$$ — Subscription: Basics ~US$260/yr, Core ~US$330/yr, Complete ~US$440/yr per user (2026). Perpetual licences phased out.

### Why useful for Arconique
Revu is the tool the architects and engineers on a Bali villa project already use to mark up drawings. Arconique should ingest Revu's output (PDF with markups, exported Markups List CSV) rather than ask the team to re-measure in a new tool. The tool-set + count + markups-list triad is the reference for ergonomic on-screen measurement.

## Buildxact

### Positioning
SMB-focused estimating + project management for residential builders, strongest in AU/NZ/US. Aimed at the builder-owner who does their own takeoffs (not a dedicated QS), so the UI optimises for "fast enough, accurate enough" over the full audit-grade workflow CostX gives. Recently added an AI takeoff assistant ("Blu") that pre-measures uploaded plans.

### Top 3 patterns
- **Takeoff measurement that auto-links to a price-book line item.** Drawing a length on a wall doesn't just produce a number — it produces "47.2 m of 200mm hollow block @ Rp 185,000/m = Rp 8,732,400," because the material is selected before measuring. For Arconique villa development this is the right default: the QS picks the material first, then measures, and the cost is computed live.
- **Real-time supplier price feeds wired into the price book.** Local-dealer integrations push current prices into the estimate so the BoQ reflects today's rates, not last quarter's. Arconique should wire Bali supplier pricing (timber, concrete, steel, finishes) into the BoQ so the budget moves with the market — manual price-list maintenance is the failure mode.
- **AI-assisted plan pre-measurement (Blu).** The QS uploads the plan; the AI auto-detects walls, doors, fixtures and pre-populates measurements for the QS to verify and adjust. Even at 70% accuracy, the time saved on the easy 70% lets the QS focus on the hard 30%. Arconique should treat AI pre-measurement as a near-term feature, not a sci-fi one.

### Pricing
$$ — Foundation US$199/mo (US$169/mo annual), Pro US$399/mo (US$339/mo annual), Master US$599/mo (US$509/mo annual) (2026).

### Why useful for Arconique
Buildxact is the reference for "QS workflow without a QS" — exactly the situation Arconique faces with villa owners who don't have a full estimating department. The material-first measurement flow and live supplier pricing are directly applicable; the AI takeoff hint sets the bar for where Arconique should aim within 12-24 months.

## Top 3 cross-app patterns to adopt

1. **Live link from on-drawing measurement to BoQ cell.** All three (CostX, Revu via Markups List, Buildxact) treat the measurement as a structured object that flows into a tabular view, not a static annotation. Arconique's data model must store every measurement as a typed row with material, dimension, location, and source-drawing-revision so it can be aggregated and re-priced without re-measuring.
2. **Reusable, project-scoped tool sets / item libraries.** CostX has named takeoff subjects, Revu has Tool Sets, Buildxact has price-book items. The QS builds the palette once per project (or imports a villa-type template), then measurements are pre-tagged with material and unit cost. Arconique should ship villa-type templates (3-bed pool villa, 5-bed compound, etc.) as starter tool sets.
3. **Drawing revision diff as a first-class workflow.** CostX's revision-mode and Revu's compare-documents both highlight what changed between drawing versions so the QS only re-measures the delta. For Bali projects where architectural drawings revise weekly, Arconique must support drawing-revision diff — without it, every revision is a full re-measurement.

## Anti-patterns to avoid

- **Forcing the QS to leave the drawing to update a quantity.** CostX gets this right (workbook is a side panel); lesser tools require closing the drawing, opening a spreadsheet, typing a number, saving, reopening. Any context switch between measure and price kills throughput.
- **Static PDF annotations with no structured data behind them.** Marking up a PDF without tagging the markup with subject/material/unit means the data dies on the drawing — you can't aggregate, can't re-price, can't compare to actuals. Every measurement must be a structured row, never just a coloured shape.
- **Separate "estimate" and "actual" tools that don't reconcile.** Most builders maintain the BoQ in one tool and site-actuals in another, then manually compare at month-end. Arconique should keep budget and actual in the same row from day one — variance is a column, not a separate workbook.
- **Mouse-only measurement with no keyboard modifiers.** Pro QS work needs Shift-snap-to-orthogonal, Alt-equal-segments, Esc-to-end-polyline, number-typed scale entry. Tools that require dragging for everything force the QS into RSI-territory at scale.
- **>5 clicks to add a new measurement type.** If "I need to start measuring tile area in this bathroom" takes opening a settings dialog, defining a unit, picking a colour, saving, and only then drawing — the QS skips the structure and uses a generic markup, and the data is lost. Adding a new measurement type must be inline, ~2 clicks.
- **Tablet-only or phone-only takeoff UIs.** Takeoff is a high-resolution, two-handed, keyboard-shortcut activity. A tablet is a verification surface, not a primary tool — anyone who ships QS tooling as mobile-first has misread the role.
