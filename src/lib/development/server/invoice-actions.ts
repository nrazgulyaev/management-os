"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
  invoices,
} from "@/lib/db/schema/sales";
import { documents } from "@/lib/db/schema/documents";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import { renderInvoicePdfFromInvoice } from "@/lib/development/pdf/render-invoice-pdf";
import { sendDevOsEmail } from "./email";
import { contacts } from "@/lib/db/schema/contacts";

/**
 * Generates the next sequential invoice number for the current calendar year.
 * Format: ARC-YYYY-NNNN (zero-padded).
 *
 * Uses a simple "max + 1" approach. Two concurrent inserts could collide;
 * in that case the unique constraint on `invoices.invoice_number` makes the
 * second one fail, and the caller can retry.
 */
async function nextInvoiceNumber(): Promise<string> {
  const db = getDb()!;
  const year = new Date().getUTCFullYear();
  const prefix = `ARC-${year}-`;
  const [row] = await db
    .select({ max: sql<string>`max(${invoices.invoiceNumber})` })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} like ${prefix + "%"}`);
  let next = 1;
  if (row?.max) {
    const tail = row.max.slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return prefix + String(next).padStart(4, "0");
}

const issueInvoiceSchema = z.object({
  milestoneId: z.string().uuid(),
  invoiceType: z
    .enum([
      "pre_invoice",
      "standard_invoice",
      "final_invoice",
      "late_fee_invoice",
      "credit_note",
    ])
    .default("standard_invoice"),
  language: z.enum(["en", "ru", "id"]).default("en"),
});

export type IssueInvoiceResult =
  | { ok: true; invoiceId: string; invoiceNumber: string }
  | { ok: false; error: string };

/**
 * Creates an invoice row for a milestone. PDF generation is left to a
 * follow-up step (`generateInvoicePDF`) — this action only persists the
 * `invoices` row in `draft` status with `documentId=null`.
 */
export async function issueInvoiceForMilestone(
  formData: FormData,
): Promise<IssueInvoiceResult> {
  const parsed = issueInvoiceSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
    invoiceType: formData.get("invoiceType") ?? "standard_invoice",
    language: formData.get("language") ?? "en",
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  await requireInternalUser();
  const organizationId = await requireOrgId();

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY — invoices has no org column; org is anchored on the parent
  // milestone + contract group. Scope both lookups to the caller's org so a
  // foreign milestoneId cannot seed an invoice.
  const [milestone] = await db
    .select()
    .from(contractMilestones)
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!milestone) return { ok: false, error: "Milestone not found." };

  const [group] = await db
    .select()
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.id, milestone.contractGroupId),
        eq(contractGroups.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!group) return { ok: false, error: "Contract group not found." };

  const number = await nextInvoiceNumber();
  const dueDate =
    milestone.expectedDueDate ??
    new Date().toISOString().slice(0, 10);

  const [inserted] = await db
    .insert(invoices)
    .values({
      contractMilestoneId: milestone.id,
      contractGroupId: group.id,
      contactId: group.contactId,
      invoiceNumber: number,
      invoiceType: parsed.data.invoiceType,
      dueDate,
      amountUsdMinor: milestone.expectedAmountUsdMinor,
      amountIdrMinor: milestone.expectedAmountIdrMinor,
      fxRate: milestone.fxRateExpected,
      currency: "USD",
      language: parsed.data.language,
      status: "draft",
    })
    .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/contracts`);
  return {
    ok: true,
    invoiceId: inserted.id,
    invoiceNumber: inserted.invoiceNumber,
  };
}

const generateInvoicePdfSchema = z.object({
  invoiceId: z.string().uuid(),
});

export type GenerateInvoicePdfResult =
  | { ok: true; documentId: string; filename: string }
  | { ok: false; error: string };

/**
 * Renders the invoice PDF, indexes a `documents` row, and links it on
 * the `invoices.documentId`. Idempotent: if a document already exists
 * for this invoice the call returns the existing row.
 *
 * Storage: stores bytes inline in `documents.fileName` metadata only —
 * actual byte upload to Supabase Storage / R2 is deferred to the same
 * pattern Management OS uses (signed URL upload via the storage SDK).
 * For Checkpoint 2, the PDF is rendered on demand by the read action;
 * the byte buffer is held in memory of the request.
 */
export async function generateInvoicePDF(
  formData: FormData,
): Promise<GenerateInvoicePdfResult> {
  const parsed = generateInvoicePdfSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  await requireInternalUser();
  const organizationId = await requireOrgId();

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [invoiceRow] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, parsed.data.invoiceId))
    .limit(1);
  if (!invoiceRow) return { ok: false, error: "Invoice not found." };

  // TENANCY — invoices has no org column; resolve org via its contract group
  // and reject a cross-org invoiceId before rendering/indexing/mutating, so a
  // foreign invoice cannot get a PDF (PII) rendered or its row mutated.
  const [ownerGroup] = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.id, invoiceRow.contractGroupId),
        eq(contractGroups.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!ownerGroup) return { ok: false, error: "Invoice not found." };

  if (invoiceRow.documentId) {
    const [existing] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, invoiceRow.documentId))
      .limit(1);
    if (existing) {
      return {
        ok: true,
        documentId: existing.id,
        filename: existing.fileName ?? `invoice-${invoiceRow.invoiceNumber}.pdf`,
      };
    }
  }

  const rendered = await renderInvoicePdfFromInvoice(parsed.data.invoiceId);
  if (!rendered)
    return { ok: false, error: "Could not render invoice (data missing)." };

  // Store metadata only (Checkpoint 2 — byte upload follows the same
  // Supabase Storage / R2 path Management OS uses; the buffer can be
  // streamed back via a download endpoint later in this checkpoint).
  // TENANCY-FINANCE-DOCS — operator context; org from the session (resolved
  // and ownership-verified above).
  const [doc] = await db
    .insert(documents)
    .values({
      organizationId,
      title: `Invoice ${invoiceRow.invoiceNumber}`,
      documentType: "invoice",
      entityType: "project",
      entityId: invoiceRow.contractGroupId,
      fileName: rendered.filename,
      mimeType: "application/pdf",
      sizeBytes: rendered.buffer.length,
      visibility: "internal",
      status: "active",
    })
    .returning({ id: documents.id });
  if (!doc) return { ok: false, error: "Failed to index document." };

  await db
    .update(invoices)
    .set({ documentId: doc.id, updatedAt: new Date() })
    .where(eq(invoices.id, parsed.data.invoiceId));

  return { ok: true, documentId: doc.id, filename: rendered.filename };
}

const sendInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
});

/**
 * Renders the PDF (if not already rendered), then sends the invoice via
 * the shared Dev OS email helper. Honors `EMAIL_DRY_RUN=1`. Always
 * writes a `dev_notification_delivery_log` entry. Updates the invoice
 * row to `status='sent'` and records `sentTo`/`sentBy`.
 */
export async function sendInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; deliveryId?: string }> {
  const parsed = sendInvoiceSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    recipientEmail: formData.get("recipientEmail") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  await requireInternalUser();
  const organizationId = await requireOrgId();

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [invoiceRow] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, parsed.data.invoiceId))
    .limit(1);
  if (!invoiceRow) return { ok: false, error: "Invoice not found." };

  // TENANCY — invoices has no org column; verify the invoice's org via its
  // contract group BEFORE resolving the buyer contact or sending email, so a
  // cross-org id cannot leak buyer PII or email another tenant's client.
  const [ownerGroup] = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.id, invoiceRow.contractGroupId),
        eq(contractGroups.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!ownerGroup) return { ok: false, error: "Invoice not found." };

  // Resolve recipient email.
  let recipient = parsed.data.recipientEmail;
  const recipientContactId: string | null = invoiceRow.contactId;
  if (!recipient) {
    const [c] = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, invoiceRow.contactId))
      .limit(1);
    recipient = c?.email ?? undefined;
  }
  if (!recipient) {
    return {
      ok: false,
      error:
        "No recipient email — buyer record has no email and none was supplied.",
    };
  }

  // Ensure a PDF has been rendered + indexed.
  const fd = new FormData();
  fd.append("invoiceId", invoiceRow.id);
  const pdfResult = await generateInvoicePDF(fd);
  if (!pdfResult.ok) {
    return { ok: false, error: `PDF generation failed: ${pdfResult.error}` };
  }

  const subject = `Invoice ${invoiceRow.invoiceNumber} — Arconique`;
  const intro =
    "Please find attached the invoice for your contract milestone. Use the reference on the invoice when initiating the payment.";

  const sendResult = await sendDevOsEmail({
    to: recipient,
    subject,
    bodyText: intro,
    bodyHtml: `<p>${intro}</p>`,
    metadata: {
      triggerEntityType: "invoice",
      triggerEntityId: invoiceRow.id,
      templateName: "invoice_send",
      recipientContactId: recipientContactId ?? undefined,
    },
  });

  if (sendResult.status === "failed") {
    return {
      ok: false,
      error: sendResult.errorReason,
      deliveryId: sendResult.deliveryId,
    };
  }

  await db
    .update(invoices)
    .set({
      status: sendResult.status === "sent" ? "sent" : invoiceRow.status,
      sentAt: sendResult.status === "sent" ? new Date() : invoiceRow.sentAt,
      sentTo: recipient,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceRow.id));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
  return { ok: true, deliveryId: sendResult.deliveryId };
}

const voidInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(2).max(500),
});

export async function voidInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = voidInvoiceSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  await requireInternalUser();
  const organizationId = await requireOrgId();

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY — invoices has no org column; load the invoice and resolve its org
  // via the contract group, then void ONLY when it belongs to the caller's org.
  // Previously this was an unconditional UPDATE by id with no auth/org check.
  const [invoiceRow] = await db
    .select({ id: invoices.id, contractGroupId: invoices.contractGroupId })
    .from(invoices)
    .where(eq(invoices.id, parsed.data.invoiceId))
    .limit(1);
  if (!invoiceRow) return { ok: false, error: "Invoice not found." };

  const [ownerGroup] = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.id, invoiceRow.contractGroupId),
        eq(contractGroups.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!ownerGroup) return { ok: false, error: "Invoice not found." };

  const now = new Date();
  await db
    .update(invoices)
    .set({
      status: "void",
      voidedAt: now,
      voidedReason: parsed.data.reason,
      updatedAt: now,
    })
    .where(eq(invoices.id, parsed.data.invoiceId));
  revalidatePath(`${DEVELOPMENT_APP_PATH}/invoices`);
  return { ok: true };
}
