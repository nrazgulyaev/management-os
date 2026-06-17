import { redirect } from "next/navigation";

/**
 * `/development-os/quantity-surveying` was a static "Coming Soon" placeholder.
 * The real Quantity Surveying work is already live across two surfaces:
 *
 *   - `/development-os/cabinets/qs`  — the QS / Cost Analyst desk: WP rollup,
 *     variance review queue (boq_items vs boq_actuals), BOQ top-lines editor,
 *     RFQ matrix, and the qs-cost-analyst anomaly band.
 *   - `/development-os/boq`          — the full Bill of Quantities document
 *     module (documents, sections, line items, takeoff, quick-entry).
 *
 * The QS desk already cross-links to the full BOQ list, quick-entry and the
 * import wizard, so it is the correct landing surface. We redirect here rather
 * than duplicate that page; the `quantity-surveying` nav entry keeps working.
 */
export const dynamic = "force-dynamic";

export default function QuantitySurveyingRedirectPage() {
  redirect("/development-os/cabinets/qs");
}
