import "server-only";

/**
 * AP / AR aging — buckets outstanding payables/receivables by age.
 *
 * PURE derivation over the existing `dev_invoices` sub-ledger (no new
 * table). Outstanding = total_minor − paid_minor (the GENERATED
 * `outstanding_minor` column is read-only at the Drizzle layer, so we
 * compute it here to keep the bigint math explicit and portable). Age is
 * measured from `due_date` to the as-of date. Buckets: current (not yet
 * due / 0-30 past due), 31-60, 61-90, 90+. Money stays bigint MINOR units.
 * Org-scoped.
 *
 *   AP  → invoice_type = 'payable'      (what we owe vendors)
 *   AR  → invoice_type = 'receivable'   (what buyers owe us)
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devInvoices } from "@/lib/db/schema/invoices";
import { vendors } from "@/lib/db/schema/site-operations";
import { contacts } from "@/lib/db/schema/contacts";

export type AgingLedger = "payable" | "receivable";

export interface AgingBucketRow {
  currentMinor: bigint;
  d31_60Minor: bigint;
  d61_90Minor: bigint;
  d90PlusMinor: bigint;
  totalMinor: bigint;
}

export interface AgingDetailRow {
  id: string;
  invoiceNumber: string;
  counterparty: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  outstandingMinor: bigint;
  daysPastDue: number;
  bucket: "current" | "31-60" | "61-90" | "90+";
}

export interface AgingReport {
  ledger: AgingLedger;
  asOf: string;
  totals: AgingBucketRow;
  rows: AgingDetailRow[];
  /** Count of distinct counterparties with an outstanding balance. */
  openInvoiceCount: number;
}

/**
 * Statuses that still carry an outstanding balance worth aging. Mirrors the
 * dev_invoices status CHECK (migration 0046) minus the settled/dead states
 * ('paid' | 'cancelled' | 'voided'). 'disputed' invoices are still owed, so
 * they age.
 */
const OPEN_STATUSES = [
  "draft",
  "issued",
  "partial_paid",
  "overdue",
  "disputed",
] as const;

function bucketFor(days: number): AgingDetailRow["bucket"] {
  if (days <= 30) return "current";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function daysBetween(due: string, asOf: string): number {
  const d = Date.parse(due);
  const a = Date.parse(asOf);
  if (Number.isNaN(d) || Number.isNaN(a)) return 0;
  return Math.floor((a - d) / 86_400_000);
}

/**
 * Build the aging report for one sub-ledger as of a date (default today).
 * Pulls open invoices for the org, computes outstanding + days-past-due in
 * JS (bigint money, integer days), then folds into the four buckets.
 */
export async function getAgingReport(
  organizationId: string,
  ledger: AgingLedger,
  asOf?: string,
): Promise<AgingReport> {
  const at = asOf ?? new Date().toISOString().slice(0, 10);
  const empty: AgingBucketRow = {
    currentMinor: 0n,
    d31_60Minor: 0n,
    d61_90Minor: 0n,
    d90PlusMinor: 0n,
    totalMinor: 0n,
  };

  const db = getDb();
  if (!db) {
    return { ledger, asOf: at, totals: empty, rows: [], openInvoiceCount: 0 };
  }

  const invoices = await db
    .select({
      id: devInvoices.id,
      invoiceNumber: devInvoices.invoiceNumber,
      currency: devInvoices.currency,
      issueDate: devInvoices.issueDate,
      dueDate: devInvoices.dueDate,
      totalMinor: devInvoices.totalMinor,
      paidMinor: devInvoices.paidMinor,
      vendorName: vendors.legalName,
      buyerName: contacts.fullName,
    })
    .from(devInvoices)
    .leftJoin(vendors, eq(vendors.id, devInvoices.vendorId))
    .leftJoin(contacts, eq(contacts.id, devInvoices.buyerContactId))
    .where(
      and(
        eq(devInvoices.organizationId, organizationId),
        eq(devInvoices.invoiceType, ledger),
        inArray(devInvoices.status, OPEN_STATUSES as unknown as string[]),
        // Only invoices issued on/before the as-of date are outstanding then.
        sql`${devInvoices.issueDate} <= ${at}`,
      ),
    );

  const totals: AgingBucketRow = { ...empty };
  const rows: AgingDetailRow[] = [];

  for (const inv of invoices) {
    const outstanding = BigInt(inv.totalMinor) - BigInt(inv.paidMinor);
    if (outstanding <= 0n) continue;
    const days = daysBetween(String(inv.dueDate), at);
    const bucket = bucketFor(days);
    if (bucket === "current") totals.currentMinor += outstanding;
    else if (bucket === "31-60") totals.d31_60Minor += outstanding;
    else if (bucket === "61-90") totals.d61_90Minor += outstanding;
    else totals.d90PlusMinor += outstanding;
    totals.totalMinor += outstanding;
    rows.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      counterparty: inv.vendorName ?? inv.buyerName ?? "—",
      currency: inv.currency,
      issueDate: String(inv.issueDate),
      dueDate: String(inv.dueDate),
      outstandingMinor: outstanding,
      daysPastDue: days,
      bucket,
    });
  }

  // Most-overdue first so the desk sees the worst exposure at the top.
  rows.sort((a, b) => b.daysPastDue - a.daysPastDue);

  return {
    ledger,
    asOf: at,
    totals,
    rows,
    openInvoiceCount: rows.length,
  };
}
