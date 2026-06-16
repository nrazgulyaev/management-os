import "server-only";

import { and, desc, eq, isNull, sql, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bankConnections,
  bankTransactions,
  closedPeriods,
  reconciliationRules,
  statementImports,
  type MatchStatus,
} from "@/lib/db/schema/banking";
import { contractGroups, invoices } from "@/lib/db/schema/sales";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Stage 6.P3.G — Read queries for the bookkeeper UI.
 *
 * TENANCY: the DB role is BYPASSRLS, so there is NO RLS net — per-org
 * isolation MUST be enforced in code here. Each reader that surfaces
 * tenant data hard-scopes by `requireOrgId()`. (An earlier comment here
 * falsely claimed RLS handled isolation; it does not.)
 */

export async function listBankConnectionsForUi() {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  return db
    .select({
      id: bankConnections.id,
      provider: bankConnections.provider,
      externalAccountId: bankConnections.externalAccountId,
      accountName: bankConnections.accountName,
      currency: bankConnections.currency,
      status: bankConnections.status,
      lastSyncedAt: bankConnections.lastSyncedAt,
      lastSyncStatus: bankConnections.lastSyncStatus,
      lastSyncError: bankConnections.lastSyncError,
    })
    .from(bankConnections)
    .where(eq(bankConnections.organizationId, orgId))
    .orderBy(desc(bankConnections.createdAt))
    .limit(200);
}

export async function listBankTransactionsForUi(opts: {
  matchStatus?: MatchStatus;
  unmatchedOnly?: boolean;
  uncategorizedOnly?: boolean;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const conds = [
    eq(bankTransactions.organizationId, orgId),
  ] as ReturnType<typeof eq>[];
  if (opts.matchStatus) {
    conds.push(eq(bankTransactions.matchStatus, opts.matchStatus));
  }
  if (opts.unmatchedOnly) {
    conds.push(
      eq(bankTransactions.matchStatus, "unmatched" as MatchStatus) as never,
    );
  }
  if (opts.uncategorizedOnly) {
    conds.push(isNull(bankTransactions.categoryId) as never);
  }
  const where = and(...conds);
  return db
    .select({
      id: bankTransactions.id,
      bankConnectionId: bankTransactions.bankConnectionId,
      transactionDate: bankTransactions.transactionDate,
      amountMinor: bankTransactions.amountMinor,
      currency: bankTransactions.currency,
      description: bankTransactions.description,
      counterpartyName: bankTransactions.counterpartyName,
      matchStatus: bankTransactions.matchStatus,
      matchConfidence: bankTransactions.matchConfidence,
      matchedInvoiceId: bankTransactions.matchedInvoiceId,
      categoryId: bankTransactions.categoryId,
      isPending: bankTransactions.isPending,
    })
    .from(bankTransactions)
    .where(where)
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(opts.limit ?? 200);
}

export async function listStatementImportsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  // TENANCY: statement_imports is org-owning (organization_id). Hard-scope
  // so the bookkeeper UI cannot surface another tenant's uploads.
  const orgId = await requireOrgId();
  return db
    .select()
    .from(statementImports)
    .where(eq(statementImports.organizationId, orgId))
    .orderBy(desc(statementImports.uploadedAt))
    .limit(opts.limit ?? 100);
}

export async function listReconciliationRulesForUi() {
  const db = getDb();
  if (!db) return [];
  // TENANCY: reconciliation_rules is org-owning (organization_id). Hard-scope
  // so an operator only ever edits/sees their own org's auto-rules.
  const orgId = await requireOrgId();
  return db
    .select()
    .from(reconciliationRules)
    .where(eq(reconciliationRules.organizationId, orgId))
    .orderBy(reconciliationRules.priority);
}

export async function listClosedPeriodsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  // TENANCY: closed_periods is org-owning (organization_id). Hard-scope so the
  // period-close screen never lists another tenant's accounting periods.
  const orgId = await requireOrgId();
  return db
    .select()
    .from(closedPeriods)
    .where(eq(closedPeriods.organizationId, orgId))
    .orderBy(desc(closedPeriods.periodEnd))
    .limit(opts.limit ?? 24);
}

/**
 * Open invoices for the caller's org, for the manual-match `<select>` on
 * the reconciliation + bank-review screens. Org-scoped through the invoice's
 * contract group (contract_groups.organization_id) — the exact scope
 * matchInvoiceAction validates against, so every option here is acceptable to
 * the action. Limited to not-yet-settled statuses (the auto-matcher's
 * candidate pool); paid/void invoices are excluded.
 */
export async function listOpenInvoicesForMatch() {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amountUsdMinor: invoices.amountUsdMinor,
      currency: invoices.currency,
      dueDate: invoices.dueDate,
      status: invoices.status,
    })
    .from(invoices)
    .innerJoin(contractGroups, eq(contractGroups.id, invoices.contractGroupId))
    .where(
      and(
        eq(contractGroups.organizationId, orgId),
        inArray(invoices.status, ["draft", "sent", "viewed", "overdue"]),
      ),
    )
    .orderBy(desc(invoices.issuedAt))
    .limit(200);
}

export async function getReconciliationStats() {
  const db = getDb();
  if (!db) return { unmatched: 0, partial: 0, matched: 0 };
  const orgId = await requireOrgId();
  const rows = await db
    .select({
      status: bankTransactions.matchStatus,
      total: sql<number>`count(*)::int`,
    })
    .from(bankTransactions)
    .where(eq(bankTransactions.organizationId, orgId))
    .groupBy(bankTransactions.matchStatus);
  const out = { unmatched: 0, partial: 0, matched: 0 };
  for (const r of rows) {
    if (r.status === "unmatched") out.unmatched += Number(r.total);
    else if (r.status === "partial_match") out.partial += Number(r.total);
    else if (
      r.status === "auto_matched" ||
      r.status === "manually_matched"
    )
      out.matched += Number(r.total);
  }
  return out;
}
