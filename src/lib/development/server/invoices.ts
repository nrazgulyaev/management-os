import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { contacts } from "@/lib/db/schema/contacts";
import {
  contractMilestones,
  invoices,
  type Invoice,
} from "@/lib/db/schema/sales";
import type {
  InvoiceDetail,
  InvoiceListItem,
  InvoiceStatus,
  InvoiceType,
} from "@/lib/development/types/payments";

export type {
  InvoiceDetail,
  InvoiceListItem,
} from "@/lib/development/types/payments";

interface JoinedRow {
  invoice: Invoice;
  contactFullName: string;
  contactEmail: string | null;
  milestoneName: string | null;
}

function rowToListItem(r: JoinedRow): InvoiceListItem {
  return {
    id: r.invoice.id,
    contractMilestoneId: r.invoice.contractMilestoneId,
    contractGroupId: r.invoice.contractGroupId,
    contactId: r.invoice.contactId,
    contactFullName: r.contactFullName,
    contactEmail: r.contactEmail,
    invoiceNumber: r.invoice.invoiceNumber,
    invoiceType: r.invoice.invoiceType as InvoiceType,
    issuedAt:
      r.invoice.issuedAt instanceof Date
        ? r.invoice.issuedAt.toISOString()
        : String(r.invoice.issuedAt),
    dueDate: r.invoice.dueDate,
    amountUsdMinor: r.invoice.amountUsdMinor,
    amountIdrMinor: r.invoice.amountIdrMinor,
    currency: r.invoice.currency,
    language: r.invoice.language,
    status: r.invoice.status as InvoiceStatus,
    sentAt: r.invoice.sentAt ? r.invoice.sentAt.toISOString() : null,
    sentTo: r.invoice.sentTo,
    paidAt: r.invoice.paidAt ? r.invoice.paidAt.toISOString() : null,
    documentId: r.invoice.documentId,
  };
}

export interface InvoiceFilters {
  contactId?: string;
  status?: InvoiceStatus;
  contractGroupId?: string;
}

export async function getInvoices(
  filters: InvoiceFilters = {},
): Promise<InvoiceListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // invoices has no org column — anchor tenancy via the joined contact.
  const conds = [eq(contacts.organizationId, organizationId)];
  if (filters.contactId) conds.push(eq(invoices.contactId, filters.contactId));
  if (filters.status) conds.push(eq(invoices.status, filters.status));
  if (filters.contractGroupId)
    conds.push(eq(invoices.contractGroupId, filters.contractGroupId));

  const rows = await db
    .select({
      invoice: invoices,
      contactFullName: contacts.fullName,
      contactEmail: contacts.email,
      milestoneName: contractMilestones.name,
    })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .leftJoin(
      contractMilestones,
      eq(contractMilestones.id, invoices.contractMilestoneId),
    )
    .where(and(...conds))
    .orderBy(desc(invoices.issuedAt));
  return rows.map(rowToListItem);
}

export async function getInvoicesByContract(
  contractGroupId: string,
): Promise<InvoiceListItem[]> {
  return getInvoices({ contractGroupId });
}

export async function getInvoiceById(id: string): Promise<InvoiceDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({
      invoice: invoices,
      contactFullName: contacts.fullName,
      contactEmail: contacts.email,
      milestoneName: contractMilestones.name,
    })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .leftJoin(
      contractMilestones,
      eq(contractMilestones.id, invoices.contractMilestoneId),
    )
    .where(
      and(
        eq(invoices.id, id),
        eq(contacts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...rowToListItem(row),
    fxRate: Number(row.invoice.fxRate),
    voidedAt: row.invoice.voidedAt ? row.invoice.voidedAt.toISOString() : null,
    voidedReason: row.invoice.voidedReason,
    notes: row.invoice.notes,
    milestoneName: row.milestoneName,
  };
}
