"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { roles, userRoles } from "@/lib/db/schema/identity";
import {
  contractGroups,
  unitDiscounts,
} from "@/lib/db/schema/sales";
import { unitDevelopmentMeta } from "@/lib/db/schema/development";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import {
  evaluateDiscountProposal,
} from "./discount-helpers";
import {
  getAllAuthorizationLimits,
  getRoleKeysForUser,
} from "./discounts";
import { createPriceSnapshot } from "./pricing";

const proposeSchema = z.object({
  villaId: z.string().uuid(),
  contactId: z.string().uuid(),
  proposedByUserId: z.string().uuid(),
  discountType: z.enum(["percent", "fixed_amount"]),
  discountPercent: z.coerce.number().positive().optional(),
  discountAmountUsdMinor: z.coerce.bigint().positive().optional(),
  appliedToOriginalPriceUsdMinor: z.coerce.bigint().positive(),
  reason: z.enum([
    "early_bird",
    "family_friend",
    "cash_payment",
    "bulk",
    "agent_negotiation",
    "returning_buyer",
    "investor_relationship",
    "other",
  ]),
  reasonNote: z.string().max(500).optional(),
});

export type ProposeDiscountResult =
  | {
      ok: true;
      discountId: string;
      status: "approved" | "pending_approval";
      escalateToRoleKey: string | null;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Proposes a discount. Computes the final price, evaluates the proposer's
 * authority via `evaluateDiscountProposal`, and writes a `unit_discounts`
 * row in either `approved` (within authority) or `pending_approval`
 * (escalation required) status.
 */
export async function proposeDiscount(
  formData: FormData,
): Promise<ProposeDiscountResult> {
  const parsed = proposeSchema.safeParse({
    villaId: formData.get("villaId"),
    contactId: formData.get("contactId"),
    proposedByUserId: formData.get("proposedByUserId"),
    discountType: formData.get("discountType"),
    discountPercent: formData.get("discountPercent") || undefined,
    discountAmountUsdMinor: formData.get("discountAmountUsdMinor") || undefined,
    appliedToOriginalPriceUsdMinor: formData.get(
      "appliedToOriginalPriceUsdMinor",
    ),
    reason: formData.get("reason"),
    reasonNote: formData.get("reasonNote") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  if (data.discountType === "percent" && data.discountPercent === undefined) {
    return { ok: false, error: "discountPercent required for percent discounts." };
  }
  if (
    data.discountType === "fixed_amount" &&
    data.discountAmountUsdMinor === undefined
  ) {
    return {
      ok: false,
      error: "discountAmountUsdMinor required for fixed_amount discounts.",
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // Compute absolute amount + percent in both terms.
  let percent = data.discountPercent ?? 0;
  let absoluteUsdMinor: bigint = data.discountAmountUsdMinor ?? 0n;
  if (data.discountType === "percent") {
    absoluteUsdMinor = BigInt(
      Math.round((Number(data.appliedToOriginalPriceUsdMinor) * percent) / 100),
    );
  } else {
    percent =
      Number(absoluteUsdMinor) === 0
        ? 0
        : (Number(absoluteUsdMinor) /
            Number(data.appliedToOriginalPriceUsdMinor)) *
          100;
  }
  const finalUsdMinor =
    data.appliedToOriginalPriceUsdMinor - absoluteUsdMinor;

  // Evaluate authority.
  const [proposerRoles, allLimits] = await Promise.all([
    getRoleKeysForUser(data.proposedByUserId),
    getAllAuthorizationLimits(),
  ]);
  const evaluation = evaluateDiscountProposal({
    proposerRoleKeys: proposerRoles,
    authorizationLimits: allLimits,
    discountPercent: percent,
    discountAbsoluteUsdMinor: absoluteUsdMinor,
  });

  const now = new Date();
  const status = evaluation.withinAuthority ? "approved" : "pending_approval";

  const [inserted] = await db
    .insert(unitDiscounts)
    .values({
      villaId: data.villaId,
      contactId: data.contactId,
      discountType: data.discountType,
      discountPercent:
        data.discountType === "percent" ? String(percent) : null,
      discountAmountUsdMinor:
        data.discountType === "fixed_amount"
          ? data.discountAmountUsdMinor!
          : null,
      appliedToOriginalPriceUsdMinor: data.appliedToOriginalPriceUsdMinor,
      finalPriceUsdMinor: finalUsdMinor,
      reason: data.reason,
      reasonNote: data.reasonNote ?? null,
      proposedBy: data.proposedByUserId,
      proposedAt: now,
      status,
      escalationRequired: !evaluation.withinAuthority,
      authorizedBy: evaluation.withinAuthority ? data.proposedByUserId : null,
      authorizedAt: evaluation.withinAuthority ? now : null,
      approvedBy: evaluation.withinAuthority ? data.proposedByUserId : null,
      approvedAt: evaluation.withinAuthority ? now : null,
      notes: evaluation.reason,
    })
    .returning({ id: unitDiscounts.id });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/discounts`);
  return {
    ok: true,
    discountId: inserted.id,
    status,
    escalateToRoleKey: evaluation.escalateToRoleKey,
  };
}

const approveSchema = z.object({
  discountId: z.string().uuid(),
  approverUserId: z.string().uuid(),
});

export async function approveDiscount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = approveSchema.safeParse({
    discountId: formData.get("discountId"),
    approverUserId: formData.get("approverUserId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [discount] = await db
    .select()
    .from(unitDiscounts)
    .where(eq(unitDiscounts.id, parsed.data.discountId))
    .limit(1);
  if (!discount) return { ok: false, error: "Discount not found." };
  if (discount.status !== "pending_approval" && discount.status !== "proposed") {
    return {
      ok: false,
      error: `Discount is in status '${discount.status}' — cannot approve.`,
    };
  }

  // Verify approver actually has authority for this discount.
  const approverRoles = await db
    .select({ roleKey: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, parsed.data.approverUserId));
  const allLimits = await getAllAuthorizationLimits();
  const evaluation = evaluateDiscountProposal({
    proposerRoleKeys: approverRoles.map((r) => r.roleKey),
    authorizationLimits: allLimits,
    discountPercent:
      discount.discountPercent !== null
        ? Number(discount.discountPercent)
        : (Number(discount.discountAmountUsdMinor ?? 0n) /
            Number(discount.appliedToOriginalPriceUsdMinor)) *
          100,
    discountAbsoluteUsdMinor:
      discount.discountAmountUsdMinor ??
      BigInt(
        Math.round(
          (Number(discount.appliedToOriginalPriceUsdMinor) *
            (discount.discountPercent !== null
              ? Number(discount.discountPercent)
              : 0)) /
            100,
        ),
      ),
  });
  if (!evaluation.withinAuthority) {
    return {
      ok: false,
      error: `Approver does not have sufficient authority. ${evaluation.reason}`,
    };
  }

  const now = new Date();
  await db
    .update(unitDiscounts)
    .set({
      status: "approved",
      approvedBy: parsed.data.approverUserId,
      approvedAt: now,
      authorizedBy: parsed.data.approverUserId,
      authorizedAt: now,
      updatedAt: now,
    })
    .where(eq(unitDiscounts.id, discount.id));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/discounts`);
  return { ok: true };
}

const rejectSchema = z.object({
  discountId: z.string().uuid(),
  approverUserId: z.string().uuid(),
  reason: z.string().min(2).max(500),
});

export async function rejectDiscount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = rejectSchema.safeParse({
    discountId: formData.get("discountId"),
    approverUserId: formData.get("approverUserId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const now = new Date();
  await db
    .update(unitDiscounts)
    .set({
      status: "rejected",
      approvedBy: parsed.data.approverUserId,
      approvedAt: now,
      rejectedReason: parsed.data.reason,
      updatedAt: now,
    })
    .where(eq(unitDiscounts.id, parsed.data.discountId));
  revalidatePath(`${DEVELOPMENT_APP_PATH}/discounts`);
  return { ok: true };
}

const applySchema = z.object({
  discountId: z.string().uuid(),
  contractGroupId: z.string().uuid(),
  fxRateUsdToIdr: z.coerce.number().positive(),
});

/**
 * Applies an approved discount to a contract group: links the discount to
 * the group, updates the group's `total_contract_value_*` to the discounted
 * amount, and writes a `discount_applied` price snapshot.
 */
export async function applyDiscountToContract(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = applySchema.safeParse({
    discountId: formData.get("discountId"),
    contractGroupId: formData.get("contractGroupId"),
    fxRateUsdToIdr: formData.get("fxRateUsdToIdr"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [discount] = await db
    .select()
    .from(unitDiscounts)
    .where(eq(unitDiscounts.id, parsed.data.discountId))
    .limit(1);
  if (!discount) return { ok: false, error: "Discount not found." };
  if (discount.status !== "approved") {
    return { ok: false, error: `Discount must be approved (currently ${discount.status}).` };
  }

  const [group] = await db
    .select()
    .from(contractGroups)
    .where(eq(contractGroups.id, parsed.data.contractGroupId))
    .limit(1);
  if (!group) return { ok: false, error: "Contract group not found." };

  const now = new Date();
  const newIdrMinor = BigInt(
    Math.round(Number(discount.finalPriceUsdMinor) * parsed.data.fxRateUsdToIdr),
  );

  await db
    .update(contractGroups)
    .set({
      totalContractValueUsdMinor: discount.finalPriceUsdMinor,
      totalContractValueIdrMinor: newIdrMinor,
      discountAppliedId: discount.id,
      updatedAt: now,
    })
    .where(eq(contractGroups.id, group.id));

  await db
    .update(unitDiscounts)
    .set({
      contractGroupId: group.id,
      status: "applied",
      appliedAt: now,
      updatedAt: now,
    })
    .where(eq(unitDiscounts.id, discount.id));

  await createPriceSnapshot({
    villaId: discount.villaId,
    priceUsdMinor: discount.finalPriceUsdMinor,
    priceIdrMinor: newIdrMinor,
    fxRateUsdToIdr: parsed.data.fxRateUsdToIdr,
    priceBasis: "discount_applied",
    triggeredBy: "discount_authorized",
    triggeredById: discount.id,
    notes: `Discount ${discount.id} applied to contract group ${group.id}.`,
  });

  // Suppress unused-var warning (kept for future: revert discount needs unitDevelopmentMeta).
  void unitDevelopmentMeta;

  revalidatePath(`${DEVELOPMENT_APP_PATH}/discounts`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  return { ok: true };
}
