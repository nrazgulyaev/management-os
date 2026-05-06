import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  residualInventoryUnits,
  residualUnitOwnershipShares,
} from "@/lib/db/schema/residual-inventory";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  computeOwnershipBySettlementMethod,
  type SettlementMethod,
} from "./residual-helpers";

const VALUATION_METHODS = [
  "list_price",
  "current_market_value",
  "conservative_liquidation_value",
  "internal_minimum_sale_price",
  "rental_income_valuation",
  "manual_valuation",
] as const;

const markResidualSchema = z.object({
  unitId: z.string().uuid(),
  projectId: z.string().uuid(),
  becameResidualAt: z.string().optional(),
  activationReason: z.string().nullable().optional(),
  activeValuationMethod: z.enum(VALUATION_METHODS).default("current_market_value"),
  activeValuationMinor: z.bigint(),
  activeValuationDate: z.string().optional(),
  activeValuationSource: z.string().nullable().optional(),
  listPriceMinor: z.bigint().nullable().optional(),
  currentMarketValueMinor: z.bigint().nullable().optional(),
  conservativeLiquidationValueMinor: z.bigint().nullable().optional(),
  internalMinimumSalePriceMinor: z.bigint().nullable().optional(),
  rentalIncomeValuationMinor: z.bigint().nullable().optional(),
  manualValuationMinor: z.bigint().nullable().optional(),
  currency: z.string().default("USD"),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
});

export async function markUnitAsResidual(
  input: z.input<typeof markResidualSchema>,
) {
  await requireInternalUser();
  const parsed = markResidualSchema.parse(input);
  const db = requireDb();
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .insert(residualInventoryUnits)
    .values({
      unitId: parsed.unitId,
      projectId: parsed.projectId,
      becameResidualAt: parsed.becameResidualAt ?? today,
      activationReason: parsed.activationReason ?? null,
      activeValuationMethod: parsed.activeValuationMethod,
      activeValuationMinor: parsed.activeValuationMinor,
      activeValuationDate: parsed.activeValuationDate ?? today,
      activeValuationSource: parsed.activeValuationSource ?? null,
      listPriceMinor: parsed.listPriceMinor ?? null,
      currentMarketValueMinor: parsed.currentMarketValueMinor ?? null,
      conservativeLiquidationValueMinor:
        parsed.conservativeLiquidationValueMinor ?? null,
      internalMinimumSalePriceMinor: parsed.internalMinimumSalePriceMinor ?? null,
      rentalIncomeValuationMinor: parsed.rentalIncomeValuationMinor ?? null,
      manualValuationMinor: parsed.manualValuationMinor ?? null,
      currency: parsed.currency,
      notes: parsed.notes ?? null,
      internalNotes: parsed.internalNotes ?? null,
      status: "unsold",
    })
    .returning();
  return row;
}

const SETTLEMENT_METHODS = [
  "by_unrecovered_capital",
  "by_economic_waterfall",
  "by_arconique_25_credit",
  "manual_override",
] as const;

const allocateOwnershipSchema = z.object({
  residualUnitId: z.string().uuid(),
  settlementMethod: z.enum(SETTLEMENT_METHODS),
  arconiqueUnrecoveredCapital: z.number().nonnegative(),
  investorAllocation: z
    .array(
      z.object({
        investorId: z.string().uuid(),
        unrecoveredCapital: z.number().nonnegative(),
      }),
    )
    .min(0),
  /** Required for manual_override; ignored otherwise. */
  manualShares: z
    .array(
      z.object({
        arconiqueShare: z.boolean(),
        investorId: z.string().uuid().nullable(),
        ownershipPercentage: z.number().positive().max(100),
      }),
    )
    .optional(),
  approvalReason: z.string().nullable().optional(),
});

/**
 * Allocate ownership of a residual unit between Arconique and investors,
 * using the chosen settlement method. Atomic: deletes any prior shares
 * and re-inserts based on the new method, all in one transaction. The
 * DEFERRABLE trigger enforces sum-to-100% at COMMIT.
 */
export async function allocateResidualOwnership(
  input: z.input<typeof allocateOwnershipSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = allocateOwnershipSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [unit] = await tx
      .select()
      .from(residualInventoryUnits)
      .where(eq(residualInventoryUnits.id, parsed.residualUnitId))
      .limit(1);
    if (!unit) throw new Error(`residual unit ${parsed.residualUnitId} not found`);

    // Wipe prior shares — DEFERRABLE constraint allows transient zero-row state.
    await tx
      .delete(residualUnitOwnershipShares)
      .where(
        eq(
          residualUnitOwnershipShares.residualUnitId,
          parsed.residualUnitId,
        ),
      );

    if (parsed.settlementMethod === "manual_override") {
      if (!parsed.manualShares || parsed.manualShares.length === 0) {
        throw new Error("manual_override requires manualShares");
      }
      const sum = parsed.manualShares.reduce(
        (acc, s) => acc + s.ownershipPercentage,
        0,
      );
      if (Math.abs(sum - 100) > 0.001) {
        throw new Error(
          `manual_override shares must sum to 100, got ${sum.toFixed(4)}`,
        );
      }
      await tx.insert(residualUnitOwnershipShares).values(
        parsed.manualShares.map((s) => ({
          residualUnitId: parsed.residualUnitId,
          arconiqueShare: s.arconiqueShare,
          investorId: s.arconiqueShare ? null : s.investorId,
          ownershipPercentage: String(s.ownershipPercentage),
          economicClaimMinor: BigInt(
            Math.round(
              (Number(unit.activeValuationMinor) * s.ownershipPercentage) /
                100,
            ),
          ),
          settlementMethod: "manual_override",
          settlementBasis: { manual: true },
          isApproved: true,
          approvedBy: ctx.appUser?.id ?? null,
          approvedAt: new Date(),
          approvalReason: parsed.approvalReason ?? null,
          effectiveDate: new Date().toISOString().slice(0, 10),
        })),
      );
      return { residualUnitId: parsed.residualUnitId, method: "manual_override" };
    }

    // Aggregate investor unrecovered capital — caller may have multiple investors.
    const investorTotal = parsed.investorAllocation.reduce(
      (acc, i) => acc + i.unrecoveredCapital,
      0,
    );
    const result = computeOwnershipBySettlementMethod({
      method: parsed.settlementMethod as Exclude<SettlementMethod, "manual_override">,
      arconiqueUnrecoveredCapital: parsed.arconiqueUnrecoveredCapital,
      investorUnrecoveredCapital: investorTotal,
      remainingInventoryValue: Number(unit.activeValuationMinor),
    });

    const today = new Date().toISOString().slice(0, 10);

    // Arconique share row.
    const arcPct = result.arconiqueOwnership.percentage;
    if (arcPct > 0) {
      await tx.insert(residualUnitOwnershipShares).values({
        residualUnitId: parsed.residualUnitId,
        arconiqueShare: true,
        investorId: null,
        ownershipPercentage: String(arcPct),
        economicClaimMinor: BigInt(result.arconiqueOwnership.economicClaim),
        settlementMethod: parsed.settlementMethod,
        settlementBasis: {
          arconiqueUnrecoveredCapital: parsed.arconiqueUnrecoveredCapital,
          investorUnrecoveredTotal: investorTotal,
          remainingInventoryValue: Number(unit.activeValuationMinor),
        },
        isApproved: false,
        effectiveDate: today,
      });
    }

    // Distribute investor side proportionally to each investor's
    // unrecovered capital share within the investor pool.
    if (investorTotal > 0 && parsed.investorAllocation.length > 0) {
      const investorPoolPct = result.investorOwnership.percentage;
      const investorPoolClaim = result.investorOwnership.economicClaim;
      let allocatedClaim = 0;
      let allocatedPct = 0;
      for (let i = 0; i < parsed.investorAllocation.length; i++) {
        const inv = parsed.investorAllocation[i];
        const share = inv.unrecoveredCapital / investorTotal;
        const isLast = i === parsed.investorAllocation.length - 1;
        const pct = isLast
          ? investorPoolPct - allocatedPct
          : Math.round(investorPoolPct * share * 10_000) / 10_000;
        const claim = isLast
          ? investorPoolClaim - allocatedClaim
          : Math.round(investorPoolClaim * share);
        if (pct > 0) {
          await tx.insert(residualUnitOwnershipShares).values({
            residualUnitId: parsed.residualUnitId,
            arconiqueShare: false,
            investorId: inv.investorId,
            ownershipPercentage: String(pct),
            economicClaimMinor: BigInt(claim),
            settlementMethod: parsed.settlementMethod,
            settlementBasis: {
              investorShareOfPool: share,
              poolPct: investorPoolPct,
              poolClaim: investorPoolClaim,
            },
            isApproved: false,
            effectiveDate: today,
          });
        }
        allocatedPct += pct;
        allocatedClaim += claim;
      }
    }

    return {
      residualUnitId: parsed.residualUnitId,
      method: parsed.settlementMethod,
      reasoning: result.reasoning,
    };
  });
}

export async function transferResidualUnitToManagement(input: {
  residualUnitId: string;
}) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(residualInventoryUnits)
    .set({
      status: "transferred_to_management",
      transferredToManagementAt: new Date(),
    })
    .where(eq(residualInventoryUnits.id, input.residualUnitId))
    .returning();
  return row;
}

export async function recordResidualUnitSold(input: {
  residualUnitId: string;
  soldPriceMinor: bigint;
}) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(residualInventoryUnits)
    .set({
      status: "sold_later",
      soldAt: new Date(),
      soldPriceMinor: input.soldPriceMinor,
    })
    .where(eq(residualInventoryUnits.id, input.residualUnitId))
    .returning();
  return row;
}
