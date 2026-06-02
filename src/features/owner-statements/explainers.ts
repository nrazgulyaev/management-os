/**
 * Phase 2.3 owner-02 — "Why this number?" explainer copy.
 *
 * Per-category prose the WhyDrawer surfaces. Keyed by the
 * statement-line `categoryKey` (matches the section-pill kinds
 * in mgmt-02 + a few owner-only entries). Real copy is authored
 * by accounting; this PR seeds the surface so the layout works.
 */

import * as React from "react";

export interface Explainer {
  title: string;
  /** One-sentence lede. */
  lede: string;
  /** Multi-paragraph body. Paragraphs split on blank line. */
  body: string;
  /** Optional worked example rendered in a side panel. */
  example?: React.ReactNode;
}

/**
 * Map a statement line to its explainer key. Keyed off the owner bucket
 * (line_type), with two refinements the granular `category` carries: PHR tax
 * lines and pool-allocated shared costs get their own copy.
 */
export function explainerKeyForLine(line: {
  lineType?: string | null;
  category?: string | null;
}): string {
  const lt = (line.lineType ?? "").trim();
  const cat = (line.category ?? "").toLowerCase();
  switch (lt) {
    case "revenue":
      return "revenue";
    case "fee":
      return "fees";
    case "tax":
      return cat.includes("phr") ? "phr" : "taxes";
    case "expense":
      return cat.includes("shared") ? "shared" : "expenses";
    case "management_fee":
      return "mgmt";
    case "reserve":
      return "reserves";
    default:
      return "expenses";
  }
}

export const EXPLAINERS: Record<string, Explainer> = {
  revenue: {
    title: "Booking revenue",
    lede: "Gross nightly + cleaning + extras, before channel and processing fees.",
    body: `This is the sum of every confirmed-and-paid booking against your villa during the period.

Cancellations after payment land here too (refunds are deducted later as a separate line so the audit trail stays clean).`,
  },
  fees: {
    title: "Channel + processing fees",
    lede: "What Airbnb / Booking.com / Stripe charged us to land the booking.",
    body: `Pass-through fees from the channels and payment processors. We don't mark these up — the rate you see is exactly what we paid.

Channel fee = the booking site's host service charge. Processing fee = the card / wire processor.`,
  },
  taxes: {
    title: "Government taxes",
    lede: "Indonesian VAT (PPN) + tourism tax, remitted on your behalf.",
    body: `PPN at 11% on gross revenue, plus the local tourism tax where applicable. We file these monthly with the relevant authorities — the line here is what was actually owed and remitted for this period.`,
  },
  expenses: {
    title: "Direct expenses",
    lede: "Costs incurred specifically for your villa during the period.",
    body: `Cleaning supplies, utility bills attributable to your unit, maintenance call-outs, replacements. Each line links to the underlying invoice — click through to see the vendor + line items.`,
  },
  shared: {
    title: "Shared costs",
    lede: "Your share of pool costs that benefit multiple villas.",
    body: `Examples: shared landscaping, the pool of an estate, security patrol, common-area utilities. Allocated by the share method declared in your management contract (usually weighted by villa-night count).`,
    example: "Estate landscaping cost the project $4,200 in March. Your share (8.3% by night-weighted occupancy) = $349.",
  },
  mgmt: {
    title: "Management fee",
    lede: "Our commission on net booking revenue.",
    body: `The percentage in your management contract, applied to (gross revenue − channel fees − processing fees). Taxes and direct expenses are NOT in the base — you're not paying us a cut of the tax bill.`,
  },
  reserves: {
    title: "Reserves",
    lede: "Money held back for upcoming maintenance, owner stays, or contingency.",
    body: `Per your contract we hold a small percentage (typically 5%) in reserve. This isn't lost — it's parked for the next quarterly maintenance cycle or a flagged repair. The reserve balance carries forward and you can see the running total in /owner/villas.`,
  },
  phr: {
    title: "PHR (Pajak Hiburan + Restoran)",
    lede: "Hospitality + restaurant tax on in-house F&B.",
    body: `When your guests order food/drinks through us during the stay, Indonesian PHR (10–15% depending on the regency) applies on top of PPN. The PHR shows here as a tax line distinct from PPN so the cross-check against the gov't filing stays simple.`,
  },
};
