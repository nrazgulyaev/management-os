import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyers, buyerUnitAssignments } from "@/lib/db/schema/buyers";
import {
  contractGroups,
  contractMilestones,
  invoices,
} from "@/lib/db/schema/sales";

/**
 * Buyer-portal invoices data layer.
 *
 * Surfaces the milestone invoices the OPERATOR issues (the shared `invoices`
 * table — see issueInvoiceForMilestone) read-only, buyer-side. Scoped to the
 * authenticated buyer through their assigned villas → contract groups. The
 * buyer cannot mutate invoices here; payment is the separate manual mark-paid
 * path on the payment ladder.
 *
 * Drafts are hidden — a buyer should only ever see an invoice once the operator
 * has sent it. The buyer-facing state collapses the operator status enum into a
 * simple due / paid / overdue / void signal.
 */

export type BuyerInvoiceState = "due" | "paid" | "overdue" | "void";

export interface BuyerInvoice {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  contractMilestoneId: string;
  amountUsdMinor: bigint;
  currency: string;
  dueDate: string;
  issuedAt: Date;
  state: BuyerInvoiceState;
  /** Buyer-facing document download if a PDF has been indexed + shared. */
  documentId: string | null;
}

/**
 * Operator invoice.status (+ the linked milestone's settled state) →
 * buyer-facing state.
 *
 * LIFECYCLE FIX: settlement (buyer mark-paid / Xendit webhook) flips the
 * `contract_milestones` row to `paid` but does NOT touch the operator
 * `invoices` row, so a settled installment's invoice keeps showing
 * `due`/`overdue` forever. The pill is the buyer's primary paid signal, so
 * we derive `paid` from the REAL milestone state too: a paid (or fully-paid)
 * milestone reads `paid` here regardless of the stale operator invoice status.
 */
function buyerStateFor(
  status: string,
  dueDate: string,
  milestonePaid: boolean,
): BuyerInvoiceState {
  if (status === "void") return "void";
  if (status === "paid" || milestonePaid) return "paid";
  if (status === "overdue") return "overdue";
  // sent | viewed (drafts are filtered out before this).
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate < today) return "overdue";
  return "due";
}

/**
 * Returns the buyer's issued invoices, newest first. Drafts and void rows are
 * excluded from the list count but void rows are kept visible (struck through)
 * so a buyer is never confused by a vanished invoice they were once sent.
 */
export async function getBuyerInvoices(
  buyerId: string,
): Promise<BuyerInvoice[]> {
  const db = getDb();
  if (!db) return [];

  // 0. Resolve the buyer's own org so the assignment → group → invoice chain
  //    is bounded to the buyer's tenant (defence-in-depth: the shared
  //    `invoices` / `contract_groups` tables are never read cross-org).
  const [buyer] = await db
    .select({ organizationId: buyers.organizationId })
    .from(buyers)
    .where(eq(buyers.id, buyerId))
    .limit(1);
  if (!buyer) return [];
  const orgId = buyer.organizationId;

  // 1. The buyer's assigned villas (org-bounded).
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyerId),
        eq(buyerUnitAssignments.organizationId, orgId),
      ),
    );
  const unitIds = [...new Set(assignments.map((a) => a.unitId))];
  if (unitIds.length === 0) return [];

  // 2. Contract groups for those villas (org-bounded).
  const groups = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.organizationId, orgId),
        inArray(contractGroups.villaId, unitIds),
      ),
    );
  const groupIds = groups.map((g) => g.id);
  if (groupIds.length === 0) return [];

  // 3. Issued invoices for those groups — drafts are hidden. The `invoices`
  //    table has no own org column, but `groupIds` is already the org-bounded
  //    set of the buyer's contract groups, so this is tenant-safe by FK.
  //    Joined to the linked milestone so a settled milestone (status paid, or
  //    fully paid) surfaces as a `paid` invoice even when the operator's
  //    invoice row was never flipped — see buyerStateFor's lifecycle note.
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceType: invoices.invoiceType,
      contractMilestoneId: invoices.contractMilestoneId,
      amountUsdMinor: invoices.amountUsdMinor,
      currency: invoices.currency,
      dueDate: invoices.dueDate,
      issuedAt: invoices.issuedAt,
      status: invoices.status,
      documentId: invoices.documentId,
      milestoneStatus: contractMilestones.status,
      milestoneExpectedUsdMinor: contractMilestones.expectedAmountUsdMinor,
      milestonePaidUsdMinor: contractMilestones.paidAmountUsdMinor,
    })
    .from(invoices)
    .innerJoin(
      contractMilestones,
      eq(invoices.contractMilestoneId, contractMilestones.id),
    )
    .where(inArray(invoices.contractGroupId, groupIds))
    .orderBy(desc(invoices.issuedAt))
    .limit(500);

  return rows
    .filter((r) => r.status !== "draft")
    .map((r) => {
      const milestonePaid =
        r.milestoneStatus === "paid" ||
        r.milestonePaidUsdMinor >= r.milestoneExpectedUsdMinor;
      return {
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        invoiceType: r.invoiceType,
        contractMilestoneId: r.contractMilestoneId,
        amountUsdMinor: r.amountUsdMinor,
        currency: r.currency,
        dueDate: r.dueDate,
        issuedAt: r.issuedAt,
        state: buyerStateFor(r.status, r.dueDate, milestonePaid),
        documentId: r.documentId,
      };
    });
}
