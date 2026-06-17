"use server";

/**
 * Wire-up — "use server" adapters for the server-only residual-inventory
 * lifecycle actions (residual-actions.ts). Each normalizes to
 * {ok} | {ok:false,error} and revalidates the affected residual paths.
 *
 * The underlying actions already enforce requireInternalUser + requireOrgId
 * and scope-check the supplied project / unit / residual-unit ids against the
 * caller's org. These wrappers add NO authority — they adapt the call shape
 * for the client modals and convert user-entered *major* valuations to the
 * *minor* (bigint) units the actions expect. Never forward a client org id.
 */

import { revalidatePath } from "next/cache";
import {
  markUnitAsResidual,
  allocateResidualOwnership,
  transferResidualUnitToManagement,
  recordResidualUnitSold,
} from "@/lib/development/server/residual-inventory/residual-actions";

const LIST_PATH = "/development-os/residual-inventory";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

/** Major-unit string ("250000.50") → minor-unit bigint. USD = 2 decimals. */
function majorToMinorBigint(major: string): bigint {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Valuation must be a non-negative number.");
  }
  return BigInt(Math.round(n * 100));
}

function majorToMinorOrNull(major: string): bigint | null {
  const t = major.trim();
  if (t === "") return null;
  return majorToMinorBigint(t);
}

const VALUATION_METHODS = [
  "list_price",
  "current_market_value",
  "conservative_liquidation_value",
  "internal_minimum_sale_price",
  "rental_income_valuation",
  "manual_valuation",
] as const;
type ValuationMethod = (typeof VALUATION_METHODS)[number];

export interface MarkResidualFormInput {
  unitId: string;
  projectId: string;
  activeValuationMethod: string;
  activeValuationMajor: string;
  activationReason?: string | null;
  notes?: string | null;
}

export async function markUnitAsResidualAction(
  input: MarkResidualFormInput,
): Promise<ActionResult> {
  try {
    const method = input.activeValuationMethod as ValuationMethod;
    if (!VALUATION_METHODS.includes(method)) {
      throw new Error("Unsupported valuation method.");
    }
    const minor = majorToMinorBigint(input.activeValuationMajor);
    await markUnitAsResidual({
      unitId: input.unitId,
      projectId: input.projectId,
      activeValuationMethod: method,
      activeValuationMinor: minor,
      // Stamp the chosen method's column too, so the detail valuations table
      // shows the figure the operator entered.
      ...(method === "list_price" ? { listPriceMinor: minor } : {}),
      ...(method === "current_market_value"
        ? { currentMarketValueMinor: minor }
        : {}),
      ...(method === "conservative_liquidation_value"
        ? { conservativeLiquidationValueMinor: minor }
        : {}),
      ...(method === "internal_minimum_sale_price"
        ? { internalMinimumSalePriceMinor: minor }
        : {}),
      ...(method === "rental_income_valuation"
        ? { rentalIncomeValuationMinor: minor }
        : {}),
      ...(method === "manual_valuation" ? { manualValuationMinor: minor } : {}),
      activationReason: input.activationReason || null,
      notes: input.notes || null,
    });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to mark unit as residual.");
  }
}

const SETTLEMENT_METHODS = [
  "by_unrecovered_capital",
  "by_economic_waterfall",
  "by_arconique_25_credit",
  "manual_override",
] as const;
type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

export interface AllocateOwnershipFormInput {
  residualUnitId: string;
  settlementMethod: string;
  /** Major-unit capital figures for the computed methods. */
  arconiqueUnrecoveredCapitalMajor?: string;
  investorAllocation?: Array<{
    investorId: string;
    unrecoveredCapitalMajor: string;
  }>;
  /** For manual_override only — explicit percentages that must sum to 100. */
  manualShares?: Array<{
    arconiqueShare: boolean;
    investorId: string | null;
    ownershipPercentage: number;
  }>;
  approvalReason?: string | null;
}

export async function allocateResidualOwnershipAction(
  input: AllocateOwnershipFormInput,
): Promise<ActionResult> {
  try {
    const method = input.settlementMethod as SettlementMethod;
    if (!SETTLEMENT_METHODS.includes(method)) {
      throw new Error("Unsupported settlement method.");
    }

    if (method === "manual_override") {
      const manualShares = (input.manualShares ?? []).filter(
        (s) => Number.isFinite(s.ownershipPercentage) && s.ownershipPercentage > 0,
      );
      if (manualShares.length === 0) {
        throw new Error("Add at least one ownership share.");
      }
      await allocateResidualOwnership({
        residualUnitId: input.residualUnitId,
        settlementMethod: "manual_override",
        arconiqueUnrecoveredCapital: 0,
        investorAllocation: [],
        manualShares,
        approvalReason: input.approvalReason || null,
      });
    } else {
      // Computed methods take *major-unit* capital → number for the helper.
      const arconiqueUnrecoveredCapital =
        Number(input.arconiqueUnrecoveredCapitalMajor ?? "0") || 0;
      const investorAllocation = (input.investorAllocation ?? [])
        .map((i) => ({
          investorId: i.investorId,
          unrecoveredCapital: Number(i.unrecoveredCapitalMajor) || 0,
        }))
        .filter((i) => i.investorId && i.unrecoveredCapital > 0);
      await allocateResidualOwnership({
        residualUnitId: input.residualUnitId,
        settlementMethod: method,
        arconiqueUnrecoveredCapital,
        investorAllocation,
        approvalReason: input.approvalReason || null,
      });
    }
    revalidatePath(`${LIST_PATH}/${input.residualUnitId}`);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to allocate ownership.");
  }
}

export async function transferResidualUnitToManagementAction(
  residualUnitId: string,
): Promise<ActionResult> {
  try {
    await transferResidualUnitToManagement({ residualUnitId });
    revalidatePath(`${LIST_PATH}/${residualUnitId}`);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to transfer unit to management.");
  }
}

export async function recordResidualUnitSoldAction(
  residualUnitId: string,
  soldPriceMajor: string,
): Promise<ActionResult> {
  try {
    const minor = majorToMinorOrNull(soldPriceMajor);
    if (minor == null) {
      throw new Error("Enter the sold price.");
    }
    await recordResidualUnitSold({ residualUnitId, soldPriceMinor: minor });
    revalidatePath(`${LIST_PATH}/${residualUnitId}`);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to record sale.");
  }
}
