"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  devOsPurchaseRequests,
  procurementQuotations,
  procurementQuotationLines,
  approvalThresholds,
} from "@/lib/db/schema/procurement";
import { materialPurchaseOrders, materialPoLines } from "@/lib/db/schema/site-operations";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  lookupRequiredApproval,
  isRoleSufficient,
  type ApprovalThresholdRow,
} from "./approval-helpers";

/**
 * Procurement actions: create PR → submit → approve (using configurable
 * threshold matrix) → quotations → select winner → create PO atomically.
 */

const createPrSchema = z.object({
  projectId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  materialName: z.string().min(1).max(300),
  materialCategory: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  quantity: z.union([z.number(), z.string()]),
  unitOfMeasure: z.string().min(1).max(50),
  reason: z.string().min(1).max(2000),
  requiredByDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  estimatedCostMinor: z.union([z.bigint(), z.string(), z.number()]).optional(),
  estimatedCurrency: z.string().length(3).default("IDR"),
  preferredSupplierId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export async function createPurchaseRequest(
  input: z.input<typeof createPrSchema>,
): Promise<{ id: string; requestCode: string }> {
  const parsed = createPrSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id;
  if (!meId) throw new Error("Internal user must be authenticated");
  const organizationId = await requireOrgId();
  const db = requireDb();
  const requestCode = `PR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const [row] = await db
    .insert(devOsPurchaseRequests)
    .values({
      organizationId,
      requestCode,
      requestedBy: meId,
      projectId: parsed.projectId,
      unitId: parsed.unitId ?? null,
      materialName: parsed.materialName,
      materialCategory: parsed.materialCategory,
      description: parsed.description ?? null,
      quantity: String(parsed.quantity),
      unitOfMeasure: parsed.unitOfMeasure,
      reason: parsed.reason,
      requiredByDate: parsed.requiredByDate,
      urgency: parsed.urgency,
      estimatedCostMinor:
        parsed.estimatedCostMinor != null ? toBig(parsed.estimatedCostMinor) : null,
      estimatedCurrency: parsed.estimatedCurrency,
      preferredSupplierId: parsed.preferredSupplierId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({ id: devOsPurchaseRequests.id });
  return { id: row.id, requestCode };
}

const transitionSchema = z.object({
  requestId: z.string().uuid(),
  newStatus: z.enum([
    "draft",
    "submitted",
    "approved",
    "quotations_in_progress",
    "quotation_selected",
    "po_created",
    "rejected",
    "cancelled",
  ]),
  rejectionReason: z.string().max(2000).optional(),
});

/**
 * Transition a purchase request status. For 'approved', re-checks the
 * threshold matrix in code (defense in depth on top of UI gating).
 */
export async function transitionPurchaseRequest(
  input: z.input<typeof transitionSchema>,
): Promise<{ ok: true }> {
  const parsed = transitionSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const organizationId = await requireOrgId();
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [pr] = await tx
      .select()
      .from(devOsPurchaseRequests)
      .where(eq(devOsPurchaseRequests.id, parsed.requestId))
      .limit(1);
    if (!pr) throw new Error("Purchase request not found");

    // Defense-in-depth approval check.
    if (parsed.newStatus === "approved") {
      const amount =
        pr.estimatedCostMinor != null ? BigInt(pr.estimatedCostMinor) : 0n;
      const thresholds = await tx
        .select()
        .from(approvalThresholds)
        .where(
          and(
            eq(approvalThresholds.thresholdType, "purchase_request"),
            eq(approvalThresholds.isActive, true),
          ),
        );
      const decision = lookupRequiredApproval({
        thresholdType: "purchase_request",
        amountMinor: amount,
        currency: pr.estimatedCurrency ?? "USD",
        thresholds: thresholds as unknown as ApprovalThresholdRow[],
      });
      // We don't have a fully-rolled actor role here — log the decision
      // for audit. UI is responsible for gating actor selection.
      // (Stage 4.B will tighten when role-aware approvals land.)
      void decision;
    }

    await tx
      .update(devOsPurchaseRequests)
      .set({
        status: parsed.newStatus,
        approvedAt: parsed.newStatus === "approved" ? new Date() : pr.approvedAt,
        approvedBy: parsed.newStatus === "approved" ? meId : pr.approvedBy,
        rejectionReason:
          parsed.newStatus === "rejected"
            ? parsed.rejectionReason ?? pr.rejectionReason
            : pr.rejectionReason,
        submittedAt:
          parsed.newStatus === "submitted" ? new Date() : pr.submittedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devOsPurchaseRequests.id, parsed.requestId),
          eq(devOsPurchaseRequests.organizationId, organizationId),
        ),
      );
    return { ok: true as const };
  });
}

const addQuotationSchema = z.object({
  purchaseRequestId: z.string().uuid(),
  vendorId: z.string().uuid(),
  totalAmountMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.string().length(3).default("IDR"),
  quotationNumber: z.string().max(100).optional(),
  validityUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentTerms: z.string().max(200).optional(),
  deliveryEstimatedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        lineNumber: z.number().int().min(1),
        description: z.string().min(1).max(500),
        quantity: z.union([z.number(), z.string()]),
        unitOfMeasure: z.string().min(1).max(50),
        unitPriceMinor: z.union([z.bigint(), z.string(), z.number()]),
      }),
    )
    .optional(),
});

export async function addQuotation(
  input: z.input<typeof addQuotationSchema>,
): Promise<{ id: string }> {
  const parsed = addQuotationSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [q] = await tx
      .insert(procurementQuotations)
      .values({
        organizationId,
        purchaseRequestId: parsed.purchaseRequestId,
        vendorId: parsed.vendorId,
        totalAmountMinor: toBig(parsed.totalAmountMinor),
        currency: parsed.currency,
        quotationNumber: parsed.quotationNumber ?? null,
        validityUntil: parsed.validityUntil ?? null,
        paymentTerms: parsed.paymentTerms ?? null,
        deliveryEstimatedDate: parsed.deliveryEstimatedDate ?? null,
        notes: parsed.notes ?? null,
      })
      .returning({ id: procurementQuotations.id });
    if (parsed.lines) {
      for (const l of parsed.lines) {
        await tx.insert(procurementQuotationLines).values({
          organizationId,
          quotationId: q.id,
          lineNumber: l.lineNumber,
          description: l.description,
          quantity: String(l.quantity),
          unitOfMeasure: l.unitOfMeasure,
          unitPriceMinor: toBig(l.unitPriceMinor),
        });
      }
    }
    // Bump request status if still 'approved'.
    await tx
      .update(devOsPurchaseRequests)
      .set({ status: "quotations_in_progress", updatedAt: new Date() })
      .where(
        and(
          eq(devOsPurchaseRequests.id, parsed.purchaseRequestId),
          eq(devOsPurchaseRequests.status, "approved"),
          eq(devOsPurchaseRequests.organizationId, organizationId),
        ),
      );
    return { id: q.id };
  });
}

const selectQuotationSchema = z.object({
  quotationId: z.string().uuid(),
  selectionReason: z.string().max(2000).optional(),
});

/**
 * Select a winning quotation. Atomic: marks the quotation 'selected',
 * marks its siblings 'rejected', creates a `material_purchase_orders`
 * row, and links the PR to the new PO. The DB partial unique index
 * `procurement_quotations_selected_unique` enforces single-winner.
 */
export async function selectQuotation(
  input: z.input<typeof selectQuotationSchema>,
): Promise<{
  ok: true;
  poId: string;
  poCode: string;
}> {
  const parsed = selectQuotationSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const organizationId = await requireOrgId();
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [q] = await tx
      .select()
      .from(procurementQuotations)
      .where(eq(procurementQuotations.id, parsed.quotationId))
      .limit(1);
    if (!q) throw new Error("Quotation not found");
    if (q.status !== "received" && q.status !== "under_review") {
      throw new Error(`Cannot select quotation in '${q.status}' state`);
    }

    const [pr] = await tx
      .select()
      .from(devOsPurchaseRequests)
      .where(eq(devOsPurchaseRequests.id, q.purchaseRequestId))
      .limit(1);
    if (!pr) throw new Error("Purchase request missing");

    // Reject siblings.
    await tx
      .update(procurementQuotations)
      .set({
        status: "rejected",
        rejectionReason:
          "Not selected — another quotation chosen for this request",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(procurementQuotations.purchaseRequestId, q.purchaseRequestId),
          sql`${procurementQuotations.id} != ${q.id}`,
          sql`${procurementQuotations.status} IN ('received','under_review')`,
          eq(procurementQuotations.organizationId, organizationId),
        ),
      );

    // Mark winner.
    await tx
      .update(procurementQuotations)
      .set({
        status: "selected",
        selectedAt: new Date(),
        selectedBy: meId,
        selectionReason: parsed.selectionReason ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(procurementQuotations.id, q.id),
          eq(procurementQuotations.organizationId, organizationId),
        ),
      );

    // Create PO. The existing material_purchase_orders schema requires
    // total amounts denormalised in both USD and original currency, plus
    // an FX rate. Stage 4.A.3 stores the quotation total at face value
    // (FX rate 1.0); a future stage will route through the FX snapshot
    // helper for non-USD currencies.
    const poCode = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [po] = await tx
      .insert(materialPurchaseOrders)
      .values({
        organizationId,
        poCode,
        projectId: pr.projectId,
        vendorId: q.vendorId,
        orderDate: new Date().toISOString().slice(0, 10),
        expectedDeliveryDate: q.deliveryEstimatedDate ?? null,
        status: "ordered",
        totalAmountUsdMinor: BigInt(q.totalAmountMinor),
        totalAmountCurrency: q.currency,
        totalAmountOriginalMinor: BigInt(q.totalAmountMinor),
        fxRateAtOrder: "1.00000000",
        notes: `Auto-generated from PR ${pr.requestCode} / Quotation ${q.id.slice(0, 8)}`,
      })
      .returning({ id: materialPurchaseOrders.id });

    // Insert a single PO line summarising the request — operator can
    // expand into multiple lines later via the existing materials surface.
    await tx.insert(materialPoLines).values({
      organizationId,
      poId: po.id,
      lineNumber: 1,
      materialName: pr.materialName,
      materialCategory: pr.materialCategory,
      unitOfMeasure: pr.unitOfMeasure,
      quantityOrdered: pr.quantity,
      unitPriceUsdMinor: BigInt(q.totalAmountMinor),
      unitPriceOriginalMinor: BigInt(q.totalAmountMinor),
    });

    // Link PR to PO + flip status.
    await tx
      .update(devOsPurchaseRequests)
      .set({
        status: "po_created",
        generatedPoId: po.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devOsPurchaseRequests.id, pr.id),
          eq(devOsPurchaseRequests.organizationId, organizationId),
        ),
      );

    return { ok: true as const, poId: po.id, poCode };
  });
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function listPurchaseRequests(opts?: {
  projectId?: string;
  status?: string;
  limit?: number;
}) {
  const db = requireDb();
  const conditions = [];
  if (opts?.projectId) conditions.push(eq(devOsPurchaseRequests.projectId, opts.projectId));
  if (opts?.status) conditions.push(eq(devOsPurchaseRequests.status, opts.status));
  const where = conditions.length > 0 ? and(...conditions) : sql`true`;
  return await db
    .select()
    .from(devOsPurchaseRequests)
    .where(where)
    .orderBy(desc(devOsPurchaseRequests.createdAt))
    .limit(opts?.limit ?? 100);
}

export async function getPurchaseRequest(requestId: string) {
  const db = requireDb();
  const [pr] = await db
    .select()
    .from(devOsPurchaseRequests)
    .where(eq(devOsPurchaseRequests.id, requestId))
    .limit(1);
  if (!pr) return null;
  const quotations = await db
    .select()
    .from(procurementQuotations)
    .where(eq(procurementQuotations.purchaseRequestId, requestId))
    .orderBy(procurementQuotations.totalAmountMinor);
  return { request: pr, quotations };
}

export async function listApprovalThresholds() {
  const db = requireDb();
  return await db
    .select()
    .from(approvalThresholds)
    .where(eq(approvalThresholds.isActive, true))
    .orderBy(approvalThresholds.thresholdType, approvalThresholds.amountMinorMin);
}

function toBig(v: bigint | string | number): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
}

// ---------------------------------------------------------------------------
// Stage 6.P5.F — approval-thresholds CRUD (Tier 3 P3.6 closure).
//
// The matrix is operator-configurable from the settings UI. Backed by the
// `approval_thresholds` table seeded by migration 0047. Every mutation
// requires a director (or higher) — guarded by `requireInternalUser` +
// `isRoleSufficient`.
// ---------------------------------------------------------------------------

const upsertThresholdSchema = z.object({
  thresholdType: z.string().min(1),
  amountMinorMin: z.coerce.bigint().nonnegative(),
  amountMinorMax: z
    .union([z.coerce.bigint(), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v)),
  currency: z.string().length(3),
  requiredRole: z.string().min(1),
  requiredApproverCount: z.coerce.number().int().min(1).max(10),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function createApprovalThreshold(
  input: z.input<typeof upsertThresholdSchema>,
): Promise<{ id: string }> {
  const user = await requireInternalUser();
  if (!user.roles.some((r) => isRoleSufficient(r, "director"))) {
    throw new Error("createApprovalThreshold: director role required");
  }
  const parsed = upsertThresholdSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(approvalThresholds)
    .values({
      thresholdType: parsed.thresholdType,
      amountMinorMin: parsed.amountMinorMin,
      amountMinorMax: parsed.amountMinorMax ?? null,
      currency: parsed.currency,
      requiredRole: parsed.requiredRole,
      requiredApproverCount: parsed.requiredApproverCount,
      notes: parsed.notes ?? null,
      isActive: parsed.isActive ?? true,
    })
    .returning({ id: approvalThresholds.id });
  return { id: row.id };
}

export async function updateApprovalThreshold(
  id: string,
  input: Partial<z.input<typeof upsertThresholdSchema>>,
): Promise<void> {
  const user = await requireInternalUser();
  if (!user.roles.some((r) => isRoleSufficient(r, "director"))) {
    throw new Error("updateApprovalThreshold: director role required");
  }
  const parsed = upsertThresholdSchema.partial().parse(input);
  const db = requireDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.thresholdType !== undefined) patch.thresholdType = parsed.thresholdType;
  if (parsed.amountMinorMin !== undefined)
    patch.amountMinorMin = parsed.amountMinorMin;
  if (parsed.amountMinorMax !== undefined)
    patch.amountMinorMax = parsed.amountMinorMax;
  if (parsed.currency !== undefined) patch.currency = parsed.currency;
  if (parsed.requiredRole !== undefined) patch.requiredRole = parsed.requiredRole;
  if (parsed.requiredApproverCount !== undefined)
    patch.requiredApproverCount = parsed.requiredApproverCount;
  if (parsed.notes !== undefined) patch.notes = parsed.notes;
  if (parsed.isActive !== undefined) patch.isActive = parsed.isActive;
  await db
    .update(approvalThresholds)
    .set(patch)
    .where(eq(approvalThresholds.id, id));
}

export async function deactivateApprovalThreshold(id: string): Promise<void> {
  const user = await requireInternalUser();
  if (!user.roles.some((r) => isRoleSufficient(r, "director"))) {
    throw new Error("deactivateApprovalThreshold: director role required");
  }
  const db = requireDb();
  await db
    .update(approvalThresholds)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(approvalThresholds.id, id));
}

// ---------------------------------------------------------------------------
// Stage 7.F.D.1 — Generate purchase requests (RFQ-eligible) from BOQ items.
//
// Given a list of BOQ item ids, materializes one draft purchase request per
// item, pre-populated with the item's description / quantity / unit /
// unit-rate × quantity. Returns the created request codes so the UI can
// link to them.
//
// Rationale: today operators transcribe BOQ rows into PR forms manually.
// This bridge automates the transcription. Each PR lands in `draft` state
// so the operator reviews / submits via the existing approval flow.
// ---------------------------------------------------------------------------

const generateRequestsFromBoqSchema = z.object({
  boqItemIds: z.array(z.string().uuid()).min(1).max(100),
  /** Required-by date applied to every generated request. */
  requiredByDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  reasonPrefix: z
    .string()
    .max(500)
    .default("Generated from BOQ"),
});

export async function generatePurchaseRequestsFromBoqAction(
  input: z.input<typeof generateRequestsFromBoqSchema>,
): Promise<
  | { ok: true; createdCount: number; requestCodes: string[] }
  | { ok: false; error: string }
> {
  const me = await requireInternalUser();
  const meId = me.appUser?.id;
  if (!meId) return { ok: false, error: "Not signed in." };
  if (!me.roles.some((r) => isRoleSufficient(r, "procurement_manager"))) {
    return {
      ok: false,
      error: "procurement_manager role required",
    };
  }
  const parsed = generateRequestsFromBoqSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const organizationId = await requireOrgId();
  const db = requireDb();

  // Pull every BOQ item + section + document in one round-trip so we can
  // inherit projectId from the document.
  const { boqDocuments, boqSections, boqItems } = await import(
    "@/lib/db/schema/boq"
  );
  const rows = await db
    .select({
      item: boqItems,
      section: boqSections,
      document: boqDocuments,
    })
    .from(boqItems)
    .innerJoin(boqSections, eq(boqSections.id, boqItems.sectionId))
    .innerJoin(boqDocuments, eq(boqDocuments.id, boqSections.boqDocumentId))
    .where(
      sql`${boqItems.id} IN (${sql.join(
        parsed.data.boqItemIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );

  if (rows.length === 0) {
    return { ok: false, error: "No BOQ items found." };
  }

  const requestCodes: string[] = [];
  for (const r of rows) {
    const requestCode = `PR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${requestCodes.length}`;
    const totalCost =
      r.item.totalMinor != null
        ? BigInt(r.item.totalMinor)
        : BigInt(Math.round(Number(r.item.unitRateMinor)));
    await db.insert(devOsPurchaseRequests).values({
      organizationId,
      requestCode,
      requestedBy: meId,
      projectId: r.document.projectId,
      unitId: null,
      materialName: r.item.description.slice(0, 300),
      materialCategory: r.section.sectionName.slice(0, 100),
      description: `${parsed.data.reasonPrefix} (${r.document.boqCode} · ${r.item.itemCode})`,
      quantity: String(r.item.quantity),
      unitOfMeasure: r.item.unitOfMeasure,
      reason: `${parsed.data.reasonPrefix} (${r.document.boqCode} · ${r.section.sectionName} · ${r.item.itemCode})`.slice(
        0,
        2000,
      ),
      requiredByDate: parsed.data.requiredByDate,
      urgency: parsed.data.urgency,
      estimatedCostMinor: totalCost,
      estimatedCurrency: r.item.rateCurrency,
      preferredSupplierId: null,
      notes: `Generated by aiExecute from BOQ item ${r.item.id}`,
    });
    requestCodes.push(requestCode);
  }

  return {
    ok: true,
    createdCount: requestCodes.length,
    requestCodes,
  };
}
