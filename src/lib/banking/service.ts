import "server-only";

/**
 * Stage 6.P3.G — BankingService.
 *
 * Service layer for the Stage 6.P3 banking surface. Wraps the
 * provider abstraction (`selectBankProvider`) + reconciliation
 * engine (`auto-matcher`, `rules-engine`) + closed_periods lock.
 *
 * Most cron jobs + UI server actions go through here so credential
 * decryption + RLS context + auto-matcher application happen in one
 * place.
 *
 * TENANCY: this module is an internal SERVER-ONLY library — NOT a
 * `"use server"` action surface. Several functions take an
 * `organizationId` (or a bare connection/import/period id) and trust
 * it. That is only safe because the sole callers are (a) the action
 * wrappers in bookkeeper-actions.ts / connection-actions.ts and the
 * statement-import _actions.ts, which derive the org server-side from
 * `requireOrgId()` and org-scope the parent row BEFORE delegating, and
 * (b) cron jobs that iterate their own org-scoped row sets. It must
 * NOT carry a `"use server"` directive: that would register every
 * exported function as a browser-invokable RPC endpoint, letting a
 * client call e.g. `closePeriod({ organizationId: "<victim>", ... })`
 * or `runAutoReconciliation({ organizationId: "<victim>" })` directly,
 * a cross-tenant IDOR that bypasses the action wrappers entirely.
 */

import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  bankConnections,
  bankTransactions,
  closedPeriods,
  reconciliationRules,
  statementImports,
  type BankConnectionStatus,
  type ImportStatus,
  type MatchStatus,
} from "@/lib/db/schema/banking";
import { contractGroups, invoices } from "@/lib/db/schema/sales";
import { selectBankProvider } from "./select-provider";
import { openCredentials } from "@/lib/secure-connection-credentials";
import {
  decideMatchStatus,
  findMatches,
  type MatchableBankTransaction,
  type MatchableInvoice,
} from "./reconciliation/auto-matcher";
import {
  applyRules,
  type ApplicableTransaction,
  type ReconciliationRule,
} from "./reconciliation/rules-engine";
import type { BankCredentials } from "./types";

// ---------------------------------------------------------------------------
// Connection sync
// ---------------------------------------------------------------------------

export interface SyncConnectionResult {
  connectionId: string;
  ok: boolean;
  inserted: number;
  duplicates: number;
  failed: number;
  apiCallsCount: number;
  error?: string;
}

/**
 * Pull transactions for a single connection since `last_synced_at`,
 * apply auto-matching, persist new rows. Idempotent — duplicate
 * `(bank_connection_id, external_transaction_id)` rows are skipped.
 */
export async function syncTransactionsForConnection(
  connectionId: string,
  /**
   * TENANCY: when invoked from a user-facing server action the caller MUST
   * pass its own org id. The connection is loaded by a client-supplied id, so
   * without this an operator in org A could sync (and pull credentials/
   * transactions for) org B's bank connection — a cross-tenant IDOR. The cron
   * path derives connections from its own org-iterating query and omits this.
   */
  expectedOrgId?: string,
): Promise<SyncConnectionResult> {
  const db = requireDb();
  const [conn] = await db
    .select()
    .from(bankConnections)
    .where(
      expectedOrgId
        ? and(
            eq(bankConnections.id, connectionId),
            eq(bankConnections.organizationId, expectedOrgId),
          )
        : eq(bankConnections.id, connectionId),
    )
    .limit(1);
  if (!conn) {
    return {
      connectionId,
      ok: false,
      inserted: 0,
      duplicates: 0,
      failed: 0,
      apiCallsCount: 0,
      error: "connection not found",
    };
  }
  if (conn.status !== "active") {
    return {
      connectionId,
      ok: true,
      inserted: 0,
      duplicates: 0,
      failed: 0,
      apiCallsCount: 0,
    };
  }
  const credentials = openCredentials<BankCredentials>(conn.credentials);
  const provider = selectBankProvider(
    conn.provider as Parameters<typeof selectBankProvider>[0],
    credentials,
  );
  const since = conn.lastSyncedAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let result;
  try {
    result = await provider.fetchTransactions({
      externalAccountId: conn.externalAccountId,
      since,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(bankConnections)
      .set({
        lastSyncStatus: "failed",
        lastSyncError: errMsg.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(bankConnections.id, connectionId));
    return {
      connectionId,
      ok: false,
      inserted: 0,
      duplicates: 0,
      failed: 1,
      apiCallsCount: 0,
      error: errMsg,
    };
  }

  // Load auto-rules + invoice candidates once per sync.
  const rules = await loadActiveRules(conn.organizationId);
  const invoiceCandidates = await loadInvoiceCandidatesForOrg(
    conn.organizationId,
    since,
  );

  let inserted = 0;
  let duplicates = 0;
  let failed = 0;

  for (const tx of result.transactions) {
    try {
      // Idempotency check — UNIQUE (bank_connection_id, external_transaction_id)
      // would also catch this, but doing a select avoids the DB
      // round-trip burning a slot in the unique-violation log.
      const [exists] = await db
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.bankConnectionId, connectionId),
            eq(bankTransactions.externalTransactionId, tx.externalTransactionId),
          ),
        )
        .limit(1);
      if (exists) {
        duplicates++;
        continue;
      }

      // Apply rules.
      const rulesApplied = applyRules(toApplicable(tx), rules);

      // Run auto-matcher.
      const matchCandidates = findMatches(toMatchable(tx), {
        invoices: invoiceCandidates,
      });
      const top = matchCandidates[0];
      const matchStatus: MatchStatus = top
        ? (decideMatchStatus(top.confidence) as MatchStatus)
        : "unmatched";

      await db.insert(bankTransactions).values({
        organizationId: conn.organizationId,
        bankConnectionId: connectionId,
        externalTransactionId: tx.externalTransactionId,
        externalReference: tx.externalReference,
        transactionDate: toDateString(tx.transactionDate),
        valueDate: tx.valueDate ? toDateString(tx.valueDate) : null,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        originalAmountMinor: tx.originalAmountMinor ?? null,
        originalCurrency: tx.originalCurrency ?? null,
        fxRate: tx.fxRate != null ? String(tx.fxRate) : null,
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        counterpartyAccount: tx.counterpartyAccount,
        counterpartyIban: tx.counterpartyIban,
        counterpartySwift: tx.counterpartySwift,
        counterpartyCountry: tx.counterpartyCountry,
        autoCategory: rulesApplied.suggestedCategoryId
          ? "rule_assigned"
          : null,
        categoryId: rulesApplied.suggestedCategoryId ?? null,
        matchStatus,
        matchConfidence: top ? String(top.confidence.toFixed(2)) : null,
        matchedInvoiceId:
          top?.type === "invoice" && matchStatus === "auto_matched"
            ? top.id
            : null,
        matchedAt:
          top && matchStatus === "auto_matched" ? new Date() : null,
        importSource: "api",
        rawPayload: tx.rawPayload as never,
        isPending: tx.isPending ?? false,
      });
      inserted++;
    } catch (err) {
      console.error("syncTransactionsForConnection insert failed", err);
      failed++;
    }
  }

  await db
    .update(bankConnections)
    .set({
      lastSyncedAt: new Date(),
      lastSyncStatus: failed === 0 ? "ok" : "partial",
      lastSyncError:
        failed > 0 ? `${failed} rows failed to insert` : null,
      updatedAt: new Date(),
    })
    .where(eq(bankConnections.id, connectionId));

  return {
    connectionId,
    ok: failed === 0,
    inserted,
    duplicates,
    failed,
    apiCallsCount: 0, // provider reports separately if surfacing
  };
}

export async function listActiveConnectionsForCron(): Promise<
  Array<{
    id: string;
    organizationId: string;
    provider: string;
    autoSyncEnabled: boolean;
  }>
> {
  const db = requireDb();
  return db
    .select({
      id: bankConnections.id,
      organizationId: bankConnections.organizationId,
      provider: bankConnections.provider,
      autoSyncEnabled: bankConnections.autoSyncEnabled,
    })
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.status, "active" as BankConnectionStatus),
        eq(bankConnections.autoSyncEnabled, true),
      ),
    );
}

// ---------------------------------------------------------------------------
// Reconciliation passes
// ---------------------------------------------------------------------------

/**
 * Re-run the auto-matcher over still-unmatched transactions.
 * Useful after invoices land that didn't exist when the bank
 * transaction was first imported.
 */
export async function runAutoReconciliation(opts: {
  organizationId: string;
  /** Look-back window. Default 90 days. */
  sinceDays?: number;
}): Promise<{ scanned: number; matched: number; partial: number }> {
  const db = requireDb();
  const sinceDays = opts.sinceDays ?? 90;
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const unmatched = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.organizationId, opts.organizationId),
        eq(bankTransactions.matchStatus, "unmatched" as MatchStatus),
        gte(bankTransactions.transactionDate, toDateString(cutoff)),
      ),
    )
    .limit(500);

  const candidates = await loadInvoiceCandidatesForOrg(
    opts.organizationId,
    cutoff,
  );

  let matched = 0;
  let partial = 0;
  for (const row of unmatched) {
    const matches = findMatches(rowToMatchable(row), { invoices: candidates });
    const top = matches[0];
    if (!top) continue;
    const status = decideMatchStatus(top.confidence);
    if (status === "auto_matched") {
      await db
        .update(bankTransactions)
        .set({
          matchStatus: "auto_matched" as MatchStatus,
          matchConfidence: String(top.confidence.toFixed(2)),
          matchedInvoiceId: top.type === "invoice" ? top.id : null,
          matchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankTransactions.id, row.id));
      matched++;
    } else if (status === "partial_match") {
      await db
        .update(bankTransactions)
        .set({
          matchStatus: "partial_match" as MatchStatus,
          matchConfidence: String(top.confidence.toFixed(2)),
          matchedInvoiceId: top.type === "invoice" ? top.id : null,
          updatedAt: new Date(),
        })
        .where(eq(bankTransactions.id, row.id));
      partial++;
    }
  }
  return { scanned: unmatched.length, matched, partial };
}

// ---------------------------------------------------------------------------
// Period close
// ---------------------------------------------------------------------------

export interface ClosePeriodInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  scope?: "month" | "quarter" | "year" | "custom";
  closedBy: string;
  notes?: string;
}

export async function closePeriod(
  input: ClosePeriodInput,
): Promise<{ ok: boolean; periodId?: string; error?: string }> {
  const db = requireDb();
  // Snapshot counters at close-time.
  const startStr = toDateString(input.periodStart);
  const endStr = toDateString(input.periodEnd);
  const counters = await db
    .select({
      total: sql<number>`count(*)::int`,
      reconciled: sql<number>`count(*) filter (where ${bankTransactions.matchStatus} in ('auto_matched','manually_matched'))::int`,
      unmatched: sql<number>`count(*) filter (where ${bankTransactions.matchStatus} = 'unmatched')::int`,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.organizationId, input.organizationId),
        gte(bankTransactions.transactionDate, startStr),
        lte(bankTransactions.transactionDate, endStr),
      ),
    );

  try {
    const [row] = await db
      .insert(closedPeriods)
      .values({
        organizationId: input.organizationId,
        periodStart: startStr,
        periodEnd: endStr,
        scope: input.scope ?? "month",
        transactionsCount: counters[0]?.total ?? 0,
        reconciledCount: counters[0]?.reconciled ?? 0,
        unmatchedCount: counters[0]?.unmatched ?? 0,
        notes: input.notes ?? null,
        closedBy: input.closedBy,
      })
      .returning({ id: closedPeriods.id });
    return { ok: true, periodId: row.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function reopenPeriod(input: {
  periodId: string;
  organizationId: string;
  reopenedBy: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = requireDb();
  // TENANCY: scope the reopen to the caller's org so an operator cannot
  // reopen another tenant's closed accounting period by id.
  await db
    .update(closedPeriods)
    .set({
      reopenedBy: input.reopenedBy,
      reopenedAt: new Date(),
      reopenReason: input.reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(closedPeriods.id, input.periodId),
        eq(closedPeriods.organizationId, input.organizationId),
      ),
    );
  return { ok: true };
}

/** Returns true when the supplied date falls inside an active
 *  (non-reopened) closed period for the org. Service-layer guards
 *  call this before allowing a transaction modification. */
export async function isPeriodClosed(
  organizationId: string,
  date: Date,
): Promise<boolean> {
  const db = requireDb();
  const dateStr = toDateString(date);
  const [match] = await db
    .select({ id: closedPeriods.id })
    .from(closedPeriods)
    .where(
      and(
        eq(closedPeriods.organizationId, organizationId),
        lte(closedPeriods.periodStart, dateStr),
        gte(closedPeriods.periodEnd, dateStr),
        isNull(closedPeriods.reopenedAt),
      ),
    )
    .limit(1);
  return !!match;
}

// ---------------------------------------------------------------------------
// Statement imports
// ---------------------------------------------------------------------------

export interface CreateImportInput {
  organizationId: string;
  bankConnectionId: string;
  format: "csv" | "ofx" | "pdf" | "mt940" | "json";
  filename?: string;
  fileSizeBytes?: number;
  uploadedBy: string;
  /** Encrypted blob — the operator-uploaded file. */
  sourceContentEncrypted?: string;
  columnMapping?: Record<string, unknown>;
}

export async function createStatementImport(
  input: CreateImportInput,
): Promise<{ ok: boolean; importId?: string; importCode?: string; error?: string }> {
  const db = requireDb();
  const importCode = `STMT-${new Date().toISOString().slice(0, 10)}-${randomCode()}`;
  try {
    const [row] = await db
      .insert(statementImports)
      .values({
        organizationId: input.organizationId,
        bankConnectionId: input.bankConnectionId,
        importCode,
        format: input.format,
        filename: input.filename,
        fileSizeBytes:
          input.fileSizeBytes != null ? BigInt(input.fileSizeBytes) : null,
        uploadedBy: input.uploadedBy,
        sourceContentEncrypted: input.sourceContentEncrypted,
        columnMapping: input.columnMapping as never,
        status: "pending",
      })
      .returning({ id: statementImports.id });
    return { ok: true, importId: row.id, importCode };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateStatementImportStatus(
  importId: string,
  status: ImportStatus,
  patch: {
    transactionsCreated?: number;
    transactionsSkippedDuplicate?: number;
    rowsFailed?: number;
    totalRows?: number;
    statementPeriodStart?: Date | null;
    statementPeriodEnd?: Date | null;
    errorLog?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const db = requireDb();
  const update: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };
  if (patch.transactionsCreated != null)
    update.transactionsCreated = patch.transactionsCreated;
  if (patch.transactionsSkippedDuplicate != null)
    update.transactionsSkippedDuplicate = patch.transactionsSkippedDuplicate;
  if (patch.rowsFailed != null) update.rowsFailed = patch.rowsFailed;
  if (patch.totalRows != null) update.totalRows = patch.totalRows;
  if (patch.statementPeriodStart != null)
    update.statementPeriodStart = toDateString(patch.statementPeriodStart);
  if (patch.statementPeriodEnd != null)
    update.statementPeriodEnd = toDateString(patch.statementPeriodEnd);
  if (patch.errorLog) update.errorLog = patch.errorLog;
  if (status === "importing") update.startedAt = new Date();
  if (status === "completed" || status === "failed" || status === "cancelled")
    update.completedAt = new Date();
  await db
    .update(statementImports)
    .set(update)
    .where(eq(statementImports.id, importId));
}

// ---------------------------------------------------------------------------
// Inbox-style queries
// ---------------------------------------------------------------------------

export async function listRecentBankTransactions(opts: {
  organizationId: string;
  limit?: number;
  matchStatus?: MatchStatus;
}): Promise<
  Array<typeof bankTransactions.$inferSelect>
> {
  const db = requireDb();
  const conds = [
    eq(bankTransactions.organizationId, opts.organizationId),
  ];
  if (opts.matchStatus)
    conds.push(eq(bankTransactions.matchStatus, opts.matchStatus));
  return db
    .select()
    .from(bankTransactions)
    .where(and(...conds))
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(opts.limit ?? 100);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toMatchable(tx: {
  amountMinor: bigint;
  currency: string;
  transactionDate: Date;
  description: string;
  counterpartyName?: string;
}): MatchableBankTransaction {
  return {
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    transactionDate: tx.transactionDate,
    description: tx.description,
    counterpartyName: tx.counterpartyName,
  };
}

function rowToMatchable(
  row: typeof bankTransactions.$inferSelect,
): MatchableBankTransaction {
  return {
    amountMinor: BigInt(row.amountMinor),
    currency: row.currency,
    transactionDate: new Date(row.transactionDate),
    description: row.description,
    counterpartyName: row.counterpartyName ?? undefined,
  };
}

function toApplicable(tx: {
  amountMinor: bigint;
  description: string;
  counterpartyName?: string;
  transactionDate: Date;
}): ApplicableTransaction {
  return {
    amountMinor: tx.amountMinor,
    description: tx.description,
    counterpartyName: tx.counterpartyName,
    transactionDate: tx.transactionDate,
  };
}

async function loadActiveRules(
  organizationId: string,
): Promise<ReconciliationRule[]> {
  const db = requireDb();
  const rows = await db
    .select()
    .from(reconciliationRules)
    .where(
      and(
        eq(reconciliationRules.organizationId, organizationId),
        eq(reconciliationRules.isActive, true),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    priority: r.priority,
    matchType: r.matchType as ReconciliationRule["matchType"],
    matchConfig: (r.matchConfig as Record<string, unknown>) ?? {},
    autoAssignCategoryId: r.autoAssignCategoryId,
    autoMatchToVendorId: r.autoMatchToVendorId,
    autoMatchToInvoiceStrategy: r.autoMatchToInvoiceStrategy as ReconciliationRule["autoMatchToInvoiceStrategy"],
  }));
}

async function loadInvoiceCandidatesForOrg(
  organizationId: string,
  _cutoff: Date,
): Promise<MatchableInvoice[]> {
  const db = requireDb();
  // TENANCY: the DB role is BYPASSRLS — there is NO RLS net. The
  // `invoices` table has no organization_id column; org isolation is
  // ONLY via contract_groups.organization_id. Without the join below the
  // auto-matcher would match a bank transaction against a GLOBAL pool of
  // invoices across all tenants (data leak + corrupting writes to
  // bankTransactions.matchedInvoiceId). Mirror listOpenInvoicesForMatch
  // in queries.ts: inner-join contract_groups and hard-scope by org.
  // The legacy invoices schema may not have a single canonical amount
  // column — projectInvoice() is defensive, so we keep the wide select.
  try {
    const rows = await db
      .select()
      .from(invoices)
      .innerJoin(
        contractGroups,
        eq(contractGroups.id, invoices.contractGroupId),
      )
      .where(eq(contractGroups.organizationId, organizationId))
      .limit(500);
    return rows
      .map((r) => projectInvoice(r.invoices))
      .filter((i): i is MatchableInvoice => i != null);
  } catch {
    return [];
  }
}

function projectInvoice(
  r: Record<string, unknown>,
): MatchableInvoice | null {
  const id = typeof r["id"] === "string" ? r["id"] : null;
  if (!id) return null;
  const amount =
    typeof r["totalMinor"] === "bigint"
      ? r["totalMinor"]
      : typeof r["amountMinor"] === "bigint"
        ? r["amountMinor"]
        : null;
  if (amount == null) return null;
  const currency = typeof r["currency"] === "string" ? r["currency"] : "USD";
  const dateRaw = r["issuedAt"] ?? r["dueAt"] ?? r["createdAt"];
  if (!dateRaw) return null;
  const date = new Date(dateRaw as string);
  if (Number.isNaN(date.getTime())) return null;
  return {
    id,
    amountMinor: amount,
    currency,
    date,
    counterparty:
      (r["counterpartyName"] as string | undefined) ??
      (r["customerName"] as string | undefined) ??
      (r["vendorName"] as string | undefined),
    description:
      (r["description"] as string | undefined) ??
      (r["memo"] as string | undefined) ??
      (r["reference"] as string | undefined),
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
