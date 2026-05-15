"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devInvoices, devInvoiceLines } from "@/lib/db/schema/invoices";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Invoice actions. Invoices live in PARALLEL with capital_commitments
 * — commitments are capital pledges, invoices are bills /
 * milestone-billings / capital-call invoices.
 */

const lineSchema = z.object({
  lineNumber: z.number().int().min(1),
  description: z.string().min(1).max(1000),
  quantity: z.union([z.number(), z.string()]).default(1),
  unitOfMeasure: z.string().max(50).optional(),
  unitPriceMinor: z.union([z.bigint(), z.string(), z.number()]),
  costCategoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  taxTypeId: z.string().uuid().optional(),
  taxAmountMinor: z.union([z.bigint(), z.string(), z.number()]).optional(),
  isTaxIncluded: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

const createSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  invoiceType: z.enum(["payable", "receivable", "investor_call", "internal"]),
  vendorId: z.string().uuid().optional(),
  buyerContactId: z.string().uuid().optional(),
  investorId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  relatedPoId: z.string().uuid().optional(),
  relatedCommitmentId: z.string().uuid().optional(),
  relatedLandInstallmentId: z.string().uuid().optional(),
  relatedPermitId: z.string().uuid().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).default("USD"),
  taxTypeId: z.string().uuid().optional(),
  paymentTerms: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1),
});

/**
 * Atomic: insert invoice header + all lines + compute subtotal/total
 * from line totals + line tax amounts. Header tax_total_minor +
 * total_minor are derived from lines so they always reconcile.
 */
export async function createInvoice(
  input: z.input<typeof createSchema>,
): Promise<{ id: string; lineCount: number; totalMinor: string }> {
  const parsed = createSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  // Compute subtotal + tax_total from lines.
  let subtotal = 0n;
  let taxTotal = 0n;
  for (const l of parsed.lines) {
    const qty = Number(l.quantity ?? 1);
    const unit = toBig(l.unitPriceMinor);
    const lineSub = BigInt(Math.round(qty * Number(unit)));
    subtotal += lineSub;
    if (l.taxAmountMinor != null) {
      taxTotal += toBig(l.taxAmountMinor);
    }
  }
  const total = subtotal + taxTotal;
  if (total < 0n) throw new Error("Computed total cannot be negative");

  return await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(devInvoices)
      .values({
        organizationId,
        invoiceNumber: parsed.invoiceNumber,
        invoiceType: parsed.invoiceType,
        vendorId: parsed.vendorId ?? null,
        buyerContactId: parsed.buyerContactId ?? null,
        investorId: parsed.investorId ?? null,
        projectId: parsed.projectId ?? null,
        unitId: parsed.unitId ?? null,
        relatedPoId: parsed.relatedPoId ?? null,
        relatedCommitmentId: parsed.relatedCommitmentId ?? null,
        relatedLandInstallmentId: parsed.relatedLandInstallmentId ?? null,
        relatedPermitId: parsed.relatedPermitId ?? null,
        issueDate: parsed.issueDate,
        dueDate: parsed.dueDate,
        subtotalMinor: subtotal,
        taxTotalMinor: taxTotal,
        totalMinor: total,
        currency: parsed.currency,
        taxTypeId: parsed.taxTypeId ?? null,
        paymentTerms: parsed.paymentTerms ?? null,
        notes: parsed.notes ?? null,
        internalNotes: parsed.internalNotes ?? null,
      })
      .returning({ id: devInvoices.id });

    for (const l of parsed.lines) {
      await tx.insert(devInvoiceLines).values({
        organizationId,
        invoiceId: inv.id,
        lineNumber: l.lineNumber,
        description: l.description,
        quantity: String(l.quantity ?? 1),
        unitOfMeasure: l.unitOfMeasure ?? null,
        unitPriceMinor: toBig(l.unitPriceMinor),
        costCategoryId: l.costCategoryId ?? null,
        unitId: l.unitId ?? null,
        taxTypeId: l.taxTypeId ?? null,
        taxAmountMinor:
          l.taxAmountMinor != null ? toBig(l.taxAmountMinor) : 0n,
        isTaxIncluded: l.isTaxIncluded ?? false,
        notes: l.notes ?? null,
      });
    }

    return {
      id: inv.id,
      lineCount: parsed.lines.length,
      totalMinor: total.toString(),
    };
  });
}

const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountMinor: z.union([z.bigint(), z.string(), z.number()]),
});

/**
 * Apply a payment to an invoice. Updates `paid_minor` and the status
 * accordingly:
 *   - paid_minor < total_minor → 'partial_paid'
 *   - paid_minor >= total_minor → 'paid'
 */
export async function recordInvoicePayment(
  input: z.input<typeof recordPaymentSchema>,
): Promise<{ ok: true; status: "partial_paid" | "paid" }> {
  const parsed = recordPaymentSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [inv] = await tx
      .select({
        id: devInvoices.id,
        totalMinor: devInvoices.totalMinor,
        paidMinor: devInvoices.paidMinor,
        status: devInvoices.status,
      })
      .from(devInvoices)
      .where(eq(devInvoices.id, parsed.invoiceId))
      .limit(1);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "cancelled" || inv.status === "voided") {
      throw new Error(
        `Cannot record payment on a ${inv.status} invoice`,
      );
    }
    const newPaid = BigInt(inv.paidMinor) + toBig(parsed.amountMinor);
    const total = BigInt(inv.totalMinor);
    if (newPaid > total) {
      throw new Error(
        `Payment would exceed invoice total: paid ${newPaid} > total ${total}`,
      );
    }
    const newStatus: "partial_paid" | "paid" =
      newPaid >= total ? "paid" : "partial_paid";
    await tx
      .update(devInvoices)
      .set({
        paidMinor: newPaid,
        status: newStatus,
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devInvoices.id, parsed.invoiceId),
          eq(devInvoices.organizationId, organizationId),
        ),
      );
    return { ok: true as const, status: newStatus };
  });
}

const voidSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function voidInvoice(
  input: z.input<typeof voidSchema>,
): Promise<{ ok: true }> {
  const parsed = voidSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  await db
    .update(devInvoices)
    .set({
      status: "voided",
      statusChangedAt: new Date(),
      internalNotes: sql`COALESCE(${devInvoices.internalNotes} || E'\n', '') || ${'[VOID] ' + parsed.reason}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devInvoices.id, parsed.invoiceId),
        eq(devInvoices.organizationId, organizationId),
      ),
    );
  return { ok: true };
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function listInvoices(opts?: {
  invoiceType?: string;
  status?: string;
  vendorId?: string;
  projectId?: string;
  limit?: number;
}) {
  const db = requireDb();
  const conditions = [];
  if (opts?.invoiceType) conditions.push(eq(devInvoices.invoiceType, opts.invoiceType));
  if (opts?.status) conditions.push(eq(devInvoices.status, opts.status));
  if (opts?.vendorId) conditions.push(eq(devInvoices.vendorId, opts.vendorId));
  if (opts?.projectId) conditions.push(eq(devInvoices.projectId, opts.projectId));
  const where = conditions.length > 0 ? and(...conditions) : sql`true`;
  return await db
    .select()
    .from(devInvoices)
    .where(where)
    .orderBy(desc(devInvoices.issueDate))
    .limit(opts?.limit ?? 100);
}

export async function getInvoice(invoiceId: string) {
  const db = requireDb();
  const [inv] = await db
    .select()
    .from(devInvoices)
    .where(eq(devInvoices.id, invoiceId))
    .limit(1);
  if (!inv) return null;
  const lines = await db
    .select()
    .from(devInvoiceLines)
    .where(eq(devInvoiceLines.invoiceId, invoiceId))
    .orderBy(devInvoiceLines.lineNumber);
  return { invoice: inv, lines };
}

function toBig(v: bigint | string | number): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
}
