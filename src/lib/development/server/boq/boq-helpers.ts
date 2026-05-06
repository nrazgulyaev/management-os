/**
 * Stage 5.A.2 — Pure BOQ math helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * The DB computes `boq_items.total_minor` as a GENERATED STORED column
 * (`quantity × unit_rate_minor`). These helpers roll those line totals
 * up into section subtotals + document grand totals, which the action
 * layer writes back into `boq_sections.subtotal_minor` and
 * `boq_documents.total_amount_minor` inside one Drizzle transaction.
 *
 * Section hierarchy: a section can have a `parent_section_id`. Section
 * subtotal = sum of own line items + sum of child section subtotals.
 */

export interface BoqItemInput {
  sectionId: string;
  totalMinor: number;
}

export interface BoqSectionInput {
  id: string;
  parentSectionId: string | null;
}

export interface BoqRollupResult {
  /** sectionId → subtotal in minor units */
  sectionSubtotals: Map<string, number>;
  /** Sum across all root sections — the document total */
  documentTotal: number;
}

export function rollupBoqTotals(
  sections: BoqSectionInput[],
  items: BoqItemInput[],
): BoqRollupResult {
  // 1) Sum line items per section.
  const lineSums = new Map<string, number>();
  for (const it of items) {
    if (!Number.isFinite(it.totalMinor)) {
      throw new Error(`boq: item total not finite for section ${it.sectionId}`);
    }
    lineSums.set(it.sectionId, (lineSums.get(it.sectionId) ?? 0) + it.totalMinor);
  }

  // 2) Build child-of-parent index.
  const childrenOf = new Map<string | null, string[]>();
  for (const s of sections) {
    const arr = childrenOf.get(s.parentSectionId) ?? [];
    arr.push(s.id);
    childrenOf.set(s.parentSectionId, arr);
  }

  // 3) DFS: subtotal(section) = lineSums[section] + Σ subtotal(child).
  //    Detect cycles defensively (a section claiming itself as ancestor
  //    would loop forever otherwise).
  const subtotals = new Map<string, number>();
  const visiting = new Set<string>();

  function visit(sectionId: string): number {
    if (visiting.has(sectionId)) {
      throw new Error(
        `boq: cycle detected in section hierarchy at ${sectionId}`,
      );
    }
    if (subtotals.has(sectionId)) return subtotals.get(sectionId)!;
    visiting.add(sectionId);
    let total = lineSums.get(sectionId) ?? 0;
    for (const childId of childrenOf.get(sectionId) ?? []) {
      total += visit(childId);
    }
    visiting.delete(sectionId);
    subtotals.set(sectionId, total);
    return total;
  }

  for (const s of sections) visit(s.id);

  // 4) Document total = sum of root-section subtotals (parent = null).
  let documentTotal = 0;
  for (const rootId of childrenOf.get(null) ?? []) {
    documentTotal += subtotals.get(rootId) ?? 0;
  }

  return { sectionSubtotals: subtotals, documentTotal };
}

/**
 * Compute the cost-adjusted unit rate for a BOQ item, including
 * waste/logistics/labor coefficients. Pure, returns minor units.
 */
export function computeAdjustedUnitRate(input: {
  unitRateMinor: number;
  wasteFactor?: number;
  logisticsFactor?: number;
  laborFactor?: number;
}): number {
  const w = input.wasteFactor ?? 0;
  const l = input.logisticsFactor ?? 0;
  const la = input.laborFactor ?? 0;
  if ([w, l, la].some((x) => !Number.isFinite(x) || x < 0)) {
    throw new Error("boq: factors must be non-negative finite");
  }
  return Math.round(input.unitRateMinor * (1 + w + l + la));
}
