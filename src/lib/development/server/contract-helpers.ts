/**
 * Pure helpers for contract math.
 *
 * Auto-splits a total contract value across the components defined in a
 * contract template (off-plan three-part: leasehold + construction
 * management + service fee). Computes the per-component net-to-seller
 * after the configured tax rate and bearer.
 *
 * Lives outside the server module so node:test specs can import it
 * without dragging the database client.
 */

import type {
  ContractComponentType,
  ContractTemplateComponentData,
  TaxBearer,
} from "@/lib/development/types/contracts";

export interface ComponentSplitResult {
  sequence: number;
  componentType: ContractComponentType;
  componentName: string;
  amountUsdMinor: bigint;
  amountIdrMinor: bigint;
  taxRate: number;
  taxBearer: TaxBearer;
  taxAmountUsdMinor: bigint;
  netReceivedBySellerUsdMinor: bigint;
}

export interface SplitContractInput {
  totalContractValueUsdMinor: bigint;
  fxRateUsdToIdr: number;
  components: ContractTemplateComponentData[];
}

/**
 * Splits a total across the template's components.
 *
 * Allocation rules:
 * - `percent_of_total`: amount = total × (defaultPercentValue / 100).
 * - `flat_amount`: amount = defaultFlatAmountUsdMinor.
 * - `computed_remainder`: amount = total minus the sum of all explicit
 *   amounts. Exactly one component per template should use this.
 *
 * Tax computation per component:
 * - taxAmountUsd = amount × taxRate / 100
 * - netReceivedBySeller depends on taxBearer:
 *   - 'buyer'  → seller keeps `amount` (buyer pays tax separately atop)
 *   - 'seller' → seller keeps `amount - tax`
 *   - 'split'  → seller keeps `amount - (tax × splitPercent/100)` where
 *                splitPercent is the seller's share of the tax burden
 *                (defaults to 50 if NULL).
 *
 * Throws when:
 * - components is empty.
 * - more than one `computed_remainder` row exists.
 * - any non-remainder row is missing the value its formula needs.
 * - the explicit components sum exceeds the total (no remainder to spread).
 */
export function splitContractAcrossComponents(
  input: SplitContractInput,
): ComponentSplitResult[] {
  const { totalContractValueUsdMinor, fxRateUsdToIdr, components } = input;

  if (components.length === 0) {
    throw new Error("Template has no components.");
  }
  const remainderRows = components.filter(
    (c) => c.defaultAmountFormula === "computed_remainder",
  );
  if (remainderRows.length > 1) {
    throw new Error(
      "Template has more than one computed_remainder component.",
    );
  }

  const explicit: { component: ContractTemplateComponentData; amount: bigint }[] =
    [];
  for (const c of components) {
    if (c.defaultAmountFormula === "computed_remainder") continue;
    if (c.defaultAmountFormula === "percent_of_total") {
      if (c.defaultPercentValue === null) {
        throw new Error(
          `Component ${c.componentName} has formula percent_of_total but no defaultPercentValue.`,
        );
      }
      const amount = BigInt(
        Math.round(
          (Number(totalContractValueUsdMinor) * Number(c.defaultPercentValue)) /
            100,
        ),
      );
      explicit.push({ component: c, amount });
    } else if (c.defaultAmountFormula === "flat_amount") {
      if (c.defaultFlatAmountUsdMinor === null) {
        throw new Error(
          `Component ${c.componentName} has formula flat_amount but no defaultFlatAmountUsdMinor.`,
        );
      }
      explicit.push({ component: c, amount: c.defaultFlatAmountUsdMinor });
    }
  }

  const explicitSum = explicit.reduce((s, e) => s + e.amount, 0n);

  let remainderAmount = 0n;
  if (remainderRows.length === 1) {
    if (explicitSum > totalContractValueUsdMinor) {
      throw new Error(
        "Explicit components sum exceeds total — no remainder to spread.",
      );
    }
    remainderAmount = totalContractValueUsdMinor - explicitSum;
  } else {
    // No remainder: explicit must equal total exactly.
    if (explicitSum !== totalContractValueUsdMinor) {
      throw new Error(
        `Explicit components sum (${explicitSum}) does not equal total (${totalContractValueUsdMinor}) and no remainder component is defined.`,
      );
    }
  }

  return components
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((c) => {
      let amount: bigint;
      if (c.defaultAmountFormula === "computed_remainder") {
        amount = remainderAmount;
      } else {
        const e = explicit.find((x) => x.component.id === c.id)!;
        amount = e.amount;
      }
      const amountIdr = BigInt(
        Math.round(Number(amount) * fxRateUsdToIdr),
      );
      const taxAmount = BigInt(
        Math.round((Number(amount) * Number(c.defaultTaxRate)) / 100),
      );
      let net: bigint;
      if (c.defaultTaxBearer === "buyer") {
        net = amount;
      } else if (c.defaultTaxBearer === "seller") {
        net = amount - taxAmount;
      } else {
        // split
        const sellerShare =
          c.defaultSplitPercent !== null ? Number(c.defaultSplitPercent) : 50;
        const sellerTax = BigInt(
          Math.round((Number(taxAmount) * sellerShare) / 100),
        );
        net = amount - sellerTax;
      }
      return {
        sequence: c.sequence,
        componentType: c.componentType,
        componentName: c.componentName,
        amountUsdMinor: amount,
        amountIdrMinor: amountIdr,
        taxRate: Number(c.defaultTaxRate),
        taxBearer: c.defaultTaxBearer,
        taxAmountUsdMinor: taxAmount,
        netReceivedBySellerUsdMinor: net,
      };
    });
}

/**
 * Builds the milestone instances for a contract group from a sales scheme.
 *
 * - `expectedAmount` is `total × collectionPercent / 100`.
 * - `expectedDueDate` is computed for the simple cases (`on_signing` =
 *   contract date; `days_after_signing` = contract date + days). More
 *   complex triggers (progress-based, days-after-previous, handover-based)
 *   leave `expectedDueDate` null until the trigger event fires elsewhere.
 * - `preInvoiceDate` is `expectedDueDate - preInvoiceDaysBeforeTrigger`
 *   when the date is known.
 */
export interface MilestoneInstanceTemplate {
  id: string;
  sequence: number;
  name: string;
  triggerType: string;
  triggerValue: number | null;
  collectionPercent: number;
  preInvoiceDaysBeforeTrigger: number;
  dueDaysAfterInvoice: number;
}

export interface MilestoneInstanceResult {
  sourceMilestoneId: string;
  sequence: number;
  name: string;
  triggerType: string;
  triggerValue: number | null;
  collectionPercent: number;
  expectedAmountUsdMinor: bigint;
  expectedAmountIdrMinor: bigint;
  expectedDueDate: string | null;
  preInvoiceDate: string | null;
}

export function buildMilestoneInstances(args: {
  totalContractValueUsdMinor: bigint;
  fxRateUsdToIdr: number;
  contractDate: Date;
  templates: MilestoneInstanceTemplate[];
}): MilestoneInstanceResult[] {
  return args.templates
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((t) => {
      const amount = BigInt(
        Math.round(
          (Number(args.totalContractValueUsdMinor) * Number(t.collectionPercent)) /
            100,
        ),
      );
      const amountIdr = BigInt(
        Math.round(Number(amount) * args.fxRateUsdToIdr),
      );
      let expectedDueDate: string | null = null;
      if (t.triggerType === "on_signing") {
        expectedDueDate = isoDate(args.contractDate);
      } else if (t.triggerType === "days_after_signing" && t.triggerValue) {
        const d = new Date(args.contractDate);
        d.setDate(d.getDate() + Number(t.triggerValue));
        expectedDueDate = isoDate(d);
      } else if (t.triggerType === "fixed_date_offset" && t.triggerValue) {
        const d = new Date(args.contractDate);
        d.setDate(d.getDate() + Number(t.triggerValue));
        expectedDueDate = isoDate(d);
      }
      let preInvoiceDate: string | null = null;
      if (expectedDueDate) {
        const d = new Date(expectedDueDate);
        d.setDate(d.getDate() - t.preInvoiceDaysBeforeTrigger);
        preInvoiceDate = isoDate(d);
      }
      return {
        sourceMilestoneId: t.id,
        sequence: t.sequence,
        name: t.name,
        triggerType: t.triggerType,
        triggerValue: t.triggerValue,
        collectionPercent: t.collectionPercent,
        expectedAmountUsdMinor: amount,
        expectedAmountIdrMinor: amountIdr,
        expectedDueDate,
        preInvoiceDate,
      };
    });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
