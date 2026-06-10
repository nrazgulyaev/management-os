"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contactRoles } from "@/lib/db/schema/contacts";
import { unitDevelopmentMeta } from "@/lib/db/schema/development";
import { projects, villas } from "@/lib/db/schema/projects";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  contractGroups,
  contractMilestones,
  contractTemplateComponents,
  contractTemplates,
  contracts,
  reservations,
  salesSchemeMilestones,
  salesSchemes,
} from "@/lib/db/schema/sales";
import {
  buildMilestoneInstances,
  splitContractAcrossComponents,
  type MilestoneInstanceTemplate,
} from "./contract-helpers";
import type { ContractTemplateComponentData } from "@/lib/development/types/contracts";
import { createPriceSnapshot } from "./pricing";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

const convertReservationSchema = z.object({
  reservationId: z.string().uuid(),
  templateId: z.string().uuid(),
  salesSchemeId: z.string().uuid(),
  totalContractValueUsdMinor: z.coerce.bigint().positive(),
  fxRateUsdToIdr: z.coerce.number().positive(),
  contractDate: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateContractGroupResult =
  | { ok: true; contractGroupId: string; contractIds: string[]; milestoneIds: string[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Converts a reservation into a contract group.
 *
 * Orchestrates:
 *   1. Loads template + components.
 *   2. Splits the total across the components (off-plan three-part).
 *   3. Loads the sales scheme + milestones.
 *   4. Inserts the contract group with all child contracts and all milestones.
 *   5. Marks the reservation `converted_to_contract`.
 *   6. Writes a `contract_locked` price snapshot.
 *
 * Group status is `pending_signature` — `signContract()` walks each child
 * to `signed`, and the final signing flips the group to `fully_signed`.
 */
export async function convertReservationToContract(
  formData: FormData,
): Promise<CreateContractGroupResult> {
  const parsed = convertReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
    templateId: formData.get("templateId"),
    salesSchemeId: formData.get("salesSchemeId"),
    totalContractValueUsdMinor: formData.get("totalContractValueUsdMinor"),
    fxRateUsdToIdr: formData.get("fxRateUsdToIdr"),
    contractDate: formData.get("contractDate") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const data = parsed.data;
  // TENANCY (migration 0163 prep): the caller's org stamps every row this
  // action writes (group + milestones). The reservation's project is the
  // anchor — confirm it belongs to the caller's org (mirrors signContract's
  // project→org IDOR guard) before stamping.
  const organizationId = await requireOrgId();

  // Load reservation.
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, data.reservationId))
    .limit(1);
  if (!reservation) {
    return { ok: false, error: "Reservation not found." };
  }
  const [reservationProject] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, reservation.projectId))
    .limit(1);
  if (!reservationProject || reservationProject.organizationId !== organizationId) {
    return { ok: false, error: "Reservation not found." };
  }
  if (!["active", "pending_payment"].includes(reservation.status)) {
    return {
      ok: false,
      error: `Reservation is in status '${reservation.status}' — cannot convert.`,
    };
  }

  // Confirm not already converted.
  const existing = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.reservationId, data.reservationId),
        isNull(contractGroups.cancelledAt),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error:
        "This reservation is already linked to a contract group. Cancel that group first.",
    };
  }

  const [template] = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, data.templateId))
    .limit(1);
  if (!template || !template.isActive) {
    return { ok: false, error: "Contract template not found or inactive." };
  }

  const componentRows = await db
    .select()
    .from(contractTemplateComponents)
    .where(eq(contractTemplateComponents.templateId, data.templateId));
  if (componentRows.length === 0) {
    return { ok: false, error: "Template has no components." };
  }

  const components: ContractTemplateComponentData[] = componentRows
    .sort((a, b) => a.sequence - b.sequence)
    .map((c) => ({
      id: c.id,
      templateId: c.templateId,
      sequence: c.sequence,
      componentType: c.componentType as ContractTemplateComponentData["componentType"],
      componentName: c.componentName,
      defaultAmountFormula:
        c.defaultAmountFormula as ContractTemplateComponentData["defaultAmountFormula"],
      defaultPercentValue:
        c.defaultPercentValue !== null ? Number(c.defaultPercentValue) : null,
      defaultFlatAmountUsdMinor: c.defaultFlatAmountUsdMinor,
      defaultTaxRate: Number(c.defaultTaxRate),
      defaultTaxBearer:
        c.defaultTaxBearer as ContractTemplateComponentData["defaultTaxBearer"],
      defaultSplitPercent:
        c.defaultSplitPercent !== null ? Number(c.defaultSplitPercent) : null,
      description: c.description,
    }));

  let split;
  try {
    split = splitContractAcrossComponents({
      totalContractValueUsdMinor: data.totalContractValueUsdMinor,
      fxRateUsdToIdr: data.fxRateUsdToIdr,
      components,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Split failed.",
    };
  }

  // Load scheme + milestones for instance creation.
  const [scheme] = await db
    .select()
    .from(salesSchemes)
    .where(eq(salesSchemes.id, data.salesSchemeId))
    .limit(1);
  if (!scheme) return { ok: false, error: "Sales scheme not found." };
  const schemeMilestones = await db
    .select()
    .from(salesSchemeMilestones)
    .where(eq(salesSchemeMilestones.salesSchemeId, data.salesSchemeId));

  const milestoneTpls: MilestoneInstanceTemplate[] = schemeMilestones
    .sort((a, b) => a.sequence - b.sequence)
    .map((m) => ({
      id: m.id,
      sequence: m.sequence,
      name: m.name,
      triggerType: m.triggerType,
      triggerValue: m.triggerValue !== null ? Number(m.triggerValue) : null,
      collectionPercent: Number(m.collectionPercent),
      preInvoiceDaysBeforeTrigger: m.preInvoiceDaysBeforeTrigger,
      dueDaysAfterInvoice: m.dueDaysAfterInvoice,
    }));

  const contractDate = data.contractDate
    ? new Date(data.contractDate)
    : new Date();
  const milestoneInstances = buildMilestoneInstances({
    totalContractValueUsdMinor: data.totalContractValueUsdMinor,
    fxRateUsdToIdr: data.fxRateUsdToIdr,
    contractDate,
    templates: milestoneTpls,
  });

  const totalIdrMinor = BigInt(
    Math.round(
      Number(data.totalContractValueUsdMinor) * data.fxRateUsdToIdr,
    ),
  );

  // Lock the price as a snapshot.
  const snap = await createPriceSnapshot({
    villaId: reservation.villaId,
    priceUsdMinor: data.totalContractValueUsdMinor,
    priceIdrMinor: totalIdrMinor,
    fxRateUsdToIdr: data.fxRateUsdToIdr,
    priceBasis: "contract_locked",
    triggeredBy: "contract_signed",
    notes: `Locked at contract group creation from reservation ${reservation.id}.`,
  });

  // Insert the group + child contracts + milestones.
  const [group] = await db
    .insert(contractGroups)
    .values({
      organizationId,
      contactId: reservation.contactId,
      villaId: reservation.villaId,
      projectId: reservation.projectId,
      templateId: data.templateId,
      reservationId: reservation.id,
      groupType:
        components.length >= 3 ? "off_plan_three_part" : "completed_leasehold",
      totalContractValueUsdMinor: data.totalContractValueUsdMinor,
      totalContractValueIdrMinor: totalIdrMinor,
      fxRateAtSigning: String(data.fxRateUsdToIdr),
      salesSchemeId: data.salesSchemeId,
      status: "pending_signature",
      marketPriceAtSigningUsdMinor: data.totalContractValueUsdMinor,
      priceSnapshotId: snap.id,
      contractDate: contractDate.toISOString().slice(0, 10),
      notes: data.notes ?? null,
    })
    .returning();

  const insertedContracts = await db
    .insert(contracts)
    .values(
      split.map((s) => ({
        contractGroupId: group.id,
        sequence: s.sequence,
        componentType: s.componentType,
        componentName: s.componentName,
        amountUsdMinor: s.amountUsdMinor,
        amountIdrMinor: s.amountIdrMinor,
        fxRate: String(data.fxRateUsdToIdr),
        taxRate: String(s.taxRate),
        taxBearer: s.taxBearer,
        taxAmountUsdMinor: s.taxAmountUsdMinor,
        netReceivedBySellerUsdMinor: s.netReceivedBySellerUsdMinor,
        status: "pending_signature" as const,
      })),
    )
    .returning({ id: contracts.id });

  const insertedMilestones = await db
    .insert(contractMilestones)
    .values(
      milestoneInstances.map((m) => ({
        organizationId,
        contractGroupId: group.id,
        sourceMilestoneId: m.sourceMilestoneId,
        sequence: m.sequence,
        name: m.name,
        triggerType: m.triggerType,
        triggerValue:
          m.triggerValue !== null ? String(m.triggerValue) : null,
        collectionPercent: String(m.collectionPercent),
        expectedAmountUsdMinor: m.expectedAmountUsdMinor,
        expectedAmountIdrMinor: m.expectedAmountIdrMinor,
        fxRateExpected: String(data.fxRateUsdToIdr),
        expectedDueDate: m.expectedDueDate,
        preInvoiceDate: m.preInvoiceDate,
        status: "pending" as const,
      })),
    )
    .returning({ id: contractMilestones.id });

  // Mark reservation converted.
  await db
    .update(reservations)
    .set({ status: "converted_to_contract", updatedAt: new Date() })
    .where(eq(reservations.id, reservation.id));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/reservations`);

  return {
    ok: true,
    contractGroupId: group.id,
    contractIds: insertedContracts.map((c) => c.id),
    milestoneIds: insertedMilestones.map((m) => m.id),
  };
}

const signContractSchema = z.object({
  contractId: z.string().uuid(),
  signedDocumentId: z.string().uuid().optional(),
});

/**
 * Marks a single child contract `signed`. Cascades:
 *   - Group goes to `partial_signed` if any sibling is unsigned.
 *   - Group goes to `fully_signed` (and triggers Lead→Buyer + freezes
 *     unit type + writes contract_price_minor) when ALL siblings are signed.
 */
export async function signContract(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; cascade?: "partial" | "fully_signed" }> {
  // AUTH: internal-only status write that cascades into Lead→Buyer + price
  // freeze. Throws for non-internal / cross-org callers.
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();

  const parsed = signContractSchema.safeParse({
    contractId: formData.get("contractId"),
    signedDocumentId: formData.get("signedDocumentId") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // SCOPE + STATE GUARD: resolve the contract via its group → project so we
  // can confirm tenancy (contracts/contract_groups carry no org column — the
  // project is the anchor; this kills the IDOR) and enforce the state
  // machine before flipping it to 'signed'.
  const [target] = await db
    .select({
      status: contracts.status,
      contractGroupId: contracts.contractGroupId,
      organizationId: projects.organizationId,
    })
    .from(contracts)
    .innerJoin(contractGroups, eq(contractGroups.id, contracts.contractGroupId))
    .innerJoin(projects, eq(projects.id, contractGroups.projectId))
    .where(eq(contracts.id, parsed.data.contractId))
    .limit(1);
  if (!target || target.organizationId !== organizationId) {
    return { ok: false, error: "Contract not found." };
  }
  if (target.status === "signed") {
    return { ok: false, error: "This contract is already signed." };
  }
  if (target.status === "cancelled") {
    return { ok: false, error: "A cancelled contract cannot be signed." };
  }
  if (!["draft", "pending_signature"].includes(target.status)) {
    return {
      ok: false,
      error: `Contract is '${target.status}' — it cannot be signed.`,
    };
  }

  const now = new Date();
  const [updated] = await db
    .update(contracts)
    .set({
      status: "signed",
      signedAt: now,
      signedDocumentId: parsed.data.signedDocumentId ?? undefined,
      updatedAt: now,
    })
    .where(
      and(
        eq(contracts.id, parsed.data.contractId),
        inArray(contracts.status, ["draft", "pending_signature"]),
      ),
    )
    .returning({ id: contracts.id, contractGroupId: contracts.contractGroupId });
  if (!updated) return { ok: false, error: "Contract not found." };

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "contract.sign",
    entityType: "contract",
    entityId: parsed.data.contractId,
    before: { status: target.status },
    after: { status: "signed" },
    metadata: { organizationId, contractGroupId: updated.contractGroupId },
  });

  const siblings = await db
    .select({ id: contracts.id, status: contracts.status })
    .from(contracts)
    .where(eq(contracts.contractGroupId, updated.contractGroupId));
  const allSigned = siblings.every((s) => s.status === "signed");
  const anySigned = siblings.some((s) => s.status === "signed");

  // Always mark first_signed_at on the first signature.
  const [groupRow] = await db
    .select()
    .from(contractGroups)
    .where(eq(contractGroups.id, updated.contractGroupId))
    .limit(1);
  if (!groupRow) return { ok: false, error: "Contract group missing." };

  const groupUpdate: Record<string, unknown> = { updatedAt: now };
  if (anySigned && !groupRow.firstSignedAt) groupUpdate.firstSignedAt = now;

  if (allSigned) {
    groupUpdate.status = "fully_signed";
    groupUpdate.fullySignedAt = now;
    await db
      .update(contractGroups)
      .set(groupUpdate)
      .where(eq(contractGroups.id, groupRow.id));

    // Lead → Buyer transition + freeze the villa.
    await transitionLeadToBuyer({
      contactId: groupRow.contactId,
      projectId: groupRow.projectId,
      villaId: groupRow.villaId,
      contractPriceUsdMinor: groupRow.totalContractValueUsdMinor,
      now,
    });

    revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
    revalidatePath(`${DEVELOPMENT_APP_PATH}/sales`);
    return { ok: true, cascade: "fully_signed" };
  }

  groupUpdate.status = "partial_signed";
  await db
    .update(contractGroups)
    .set(groupUpdate)
    .where(eq(contractGroups.id, groupRow.id));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  return { ok: true, cascade: "partial" };
}

async function transitionLeadToBuyer(args: {
  contactId: string;
  projectId: string;
  villaId: string;
  contractPriceUsdMinor: bigint;
  now: Date;
}): Promise<void> {
  const db = getDb()!;
  // End any active 'lead' role on this project for this contact.
  const activeLeadRoles = await db
    .select({ id: contactRoles.id })
    .from(contactRoles)
    .where(
      and(
        eq(contactRoles.contactId, args.contactId),
        eq(contactRoles.role, "lead"),
        eq(contactRoles.scopeProjectId, args.projectId),
        isNull(contactRoles.endedAt),
      ),
    );
  if (activeLeadRoles.length > 0) {
    await db
      .update(contactRoles)
      .set({
        status: "contract_signed",
        endedAt: args.now,
        endReason: "converted",
        updatedAt: args.now,
      })
      .where(
        inArray(
          contactRoles.id,
          activeLeadRoles.map((r) => r.id),
        ),
      );
  }
  // Open a buyer role.
  await db
    .insert(contactRoles)
    .values({
      contactId: args.contactId,
      role: "buyer",
      scope: "project",
      scopeProjectId: args.projectId,
      status: "active",
      notes: "Promoted from lead on full contract signing.",
    })
    .onConflictDoNothing();

  // Freeze the unit type and lock the contract price.
  await db
    .update(unitDevelopmentMeta)
    .set({
      unitTypeFrozen: true,
      contractPriceMinor: args.contractPriceUsdMinor,
      contractCurrency: "USD",
      updatedAt: args.now,
    })
    .where(eq(unitDevelopmentMeta.villaId, args.villaId));

  // Suppress unused-var TS lint for villas import (kept for future joins).
  void villas;
}

const cancelGroupSchema = z.object({
  contractGroupId: z.string().uuid(),
  reason: z.string().min(2).max(500),
});

export async function cancelContractGroup(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = cancelGroupSchema.safeParse({
    contractGroupId: formData.get("contractGroupId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const now = new Date();
  await db
    .update(contractGroups)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledReason: parsed.data.reason,
      updatedAt: now,
    })
    .where(eq(contractGroups.id, parsed.data.contractGroupId));
  await db
    .update(contracts)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(contracts.contractGroupId, parsed.data.contractGroupId),
        inArray(contracts.status, ["draft", "pending_signature"]),
      ),
    );
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  return { ok: true };
}
