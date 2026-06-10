/**
 * ID-TAX (0164) — direction classification for a tax type.
 *
 * Extracted from tax-actions.ts (a "use server" file may only export
 * async functions) so the e-Faktur export and the bukti potong register
 * classify tax types EXACTLY like report generation does.
 *
 * `tax_types` has no structural category column, so the ONLY honest
 * signal for "is this a VAT / a withholding tax" is the operator-set
 * type_key + display_name (seeded keys: 'ppn_indonesia',
 * 'pph23_withholding', 'lease_tax_bali', 'corporate_income_tax').
 * The match is documented + conservative: anything not recognisably
 * VAT/withholding stays 'general' (one direction-less report — exactly
 * the pre-0164 behaviour).
 */

export type TaxDirectionKind = "vat" | "withholding" | "general";

export function taxDirectionKind(t: {
  typeKey: string;
  displayName: string;
}): TaxDirectionKind {
  const key = `${t.typeKey} ${t.displayName}`.toLowerCase();
  if (key.includes("ppn") || key.includes("vat")) return "vat";
  if (key.includes("pph") || key.includes("withhold")) return "withholding";
  return "general";
}
