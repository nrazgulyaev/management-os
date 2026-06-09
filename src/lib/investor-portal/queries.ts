import "server-only";

import { eq, sql, desc, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
  investorWallets,
  investors,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";
import { contacts } from "@/lib/db/schema/contacts";
import type {
  CommitmentListItem,
  DrawdownListItem,
  IRRResult,
  WalletSummary,
  WalletTransactionListItem,
  DistributionListItem,
  DistributionAllocationItem,
} from "@/lib/development/types/investors";
import type {
  CommitmentStatus,
  DistributionStatus,
  DistributionType,
  DrawdownPaymentMethod,
  DrawdownStatus,
  DrawdownTriggerReason,
  InvestorType,
  ReportingLanguage,
  SupportedCurrency,
  WalletTransactionType,
} from "@/lib/development/constants/investor-constants";
import {
  WALLET_CASH_IN_TYPES,
  WALLET_CASH_OUT_TYPES,
} from "@/lib/development/constants/investor-constants";
import { requireInvestorSession } from "./session";

/**
 * Read-only server queries scoped to the calling investor's data.
 *
 * Defense in depth: every function calls `requireInvestorSession()` to
 * resolve the investor_id from the auth session, then explicitly filters
 * by that ID in WHERE clauses. RLS migration 0039 also enforces this at
 * the DB layer — these explicit filters are belt-and-braces.
 *
 * Functions throw on missing/invalid session. Pages should catch and
 * redirect to login.
 */

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------

export interface InvestorDashboardData {
  investorCode: string;
  legalName: string;
  reportingLanguage: ReportingLanguage;
  primaryCurrency: SupportedCurrency;
  totalCommittedUsdMinor: string;
  totalDrawnUsdMinor: string;
  totalDistributedUsdMinor: string;
  totalWalletAvailableUsdMinor: string;
  totalWalletHoldUsdMinor: string;
  commitmentCount: number;
  activeCommitmentCount: number;
}

export async function getInvestorDashboard(): Promise<InvestorDashboardData> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) throw new Error("DB not configured");

  const [info] = await db
    .select({
      investorCode: investors.investorCode,
      legalName: investors.legalName,
      reportingLanguage: investors.reportingLanguage,
      primaryCurrency: investors.primaryCurrency,
    })
    .from(investors)
    .where(eq(investors.id, session.investorId))
    .limit(1);
  if (!info) throw new Error("Investor record not found");

  const [agg] = await db.execute(sql`
    SELECT
      coalesce(sum(cc.committed_amount_usd_minor), 0)::bigint AS committed,
      coalesce(sum(iw.total_drawn_usd_minor), 0)::bigint AS drawn,
      coalesce(sum(iw.total_returned_capital_usd_minor + iw.total_profit_distributed_usd_minor), 0)::bigint
        AS distributed,
      coalesce(sum(iw.available_balance_usd_minor), 0)::bigint AS available,
      coalesce(sum(iw.hold_balance_usd_minor), 0)::bigint AS hold,
      count(*)::int AS total_count,
      count(*) FILTER (WHERE cc.status = 'active')::int AS active_count
    FROM capital_commitments cc
    LEFT JOIN investor_wallets iw ON iw.commitment_id = cc.id
    WHERE cc.investor_id = ${session.investorId}
  `);
  const r = (agg ?? {}) as Record<string, unknown>;

  return {
    investorCode: info.investorCode,
    legalName: info.legalName,
    reportingLanguage: info.reportingLanguage as ReportingLanguage,
    primaryCurrency: info.primaryCurrency as SupportedCurrency,
    totalCommittedUsdMinor: toStr(r.committed),
    totalDrawnUsdMinor: toStr(r.drawn),
    totalDistributedUsdMinor: toStr(r.distributed),
    totalWalletAvailableUsdMinor: toStr(r.available),
    totalWalletHoldUsdMinor: toStr(r.hold),
    commitmentCount: Number(r.total_count ?? 0),
    activeCommitmentCount: Number(r.active_count ?? 0),
  };
}

// ----------------------------------------------------------------------------
// Commitments
// ----------------------------------------------------------------------------

export async function getMyCommitments(): Promise<CommitmentListItem[]> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT
      cc.id,
      cc.commitment_code,
      cc.investor_id,
      i.investor_code,
      i.legal_name AS investor_legal_name,
      i.investor_type,
      cc.project_id,
      p.name AS project_name,
      p.slug AS project_slug,
      cc.committed_amount_minor,
      cc.committed_currency,
      cc.committed_amount_usd_minor,
      cc.fx_rate_at_commitment,
      cc.profit_share_percent,
      cc.capital_return_priority,
      cc.is_landowner_jv,
      cc.status,
      cc.signed_at,
      coalesce(iw.total_drawn_usd_minor, 0)::bigint AS drawn_usd_minor,
      coalesce(iw.available_balance_usd_minor, 0)::bigint AS wallet_available_usd_minor
    FROM capital_commitments cc
    JOIN investors i ON i.id = cc.investor_id
    LEFT JOIN projects p ON p.id = cc.project_id
    LEFT JOIN investor_wallets iw ON iw.commitment_id = cc.id
    WHERE cc.investor_id = ${session.investorId}
    ORDER BY cc.commitment_code ASC
  `);

  return (rows as Record<string, unknown>[]).map((r) => {
    const committedUsd = BigInt(toStr(r.committed_amount_usd_minor));
    const drawn = BigInt(toStr(r.drawn_usd_minor));
    const remaining = committedUsd > drawn ? committedUsd - drawn : 0n;
    const drawnPercent =
      committedUsd > 0n ? Number((drawn * 10000n) / committedUsd) / 100 : 0;
    return {
      id: String(r.id),
      commitmentCode: String(r.commitment_code),
      investorId: String(r.investor_id),
      investorCode: String(r.investor_code),
      investorLegalName: String(r.investor_legal_name),
      investorType: r.investor_type as InvestorType,
      projectId: r.project_id ? String(r.project_id) : null,
      projectName: r.project_name ? String(r.project_name) : null,
      projectSlug: r.project_slug ? String(r.project_slug) : null,
      committedAmountMinor: toStr(r.committed_amount_minor),
      committedCurrency: r.committed_currency as SupportedCurrency,
      committedAmountUsdMinor: toStr(r.committed_amount_usd_minor),
      fxRateAtCommitment: toStr(r.fx_rate_at_commitment),
      profitSharePercent: toStr(r.profit_share_percent),
      capitalReturnPriority: Number(r.capital_return_priority),
      isLandownerJv: Boolean(r.is_landowner_jv),
      status: r.status as CommitmentStatus,
      signedAt: r.signed_at ? String(r.signed_at) : null,
      drawnUsdMinor: drawn.toString(),
      remainingUsdMinor: remaining.toString(),
      drawnPercent,
      walletAvailableUsdMinor: toStr(r.wallet_available_usd_minor),
    };
  });
}

export async function getMyCommitment(
  commitmentId: string,
): Promise<CommitmentListItem | null> {
  const all = await getMyCommitments();
  return all.find((c) => c.id === commitmentId) ?? null;
}

// ----------------------------------------------------------------------------
// Drawdowns
// ----------------------------------------------------------------------------

export async function getMyDrawdowns(
  commitmentId?: string,
): Promise<DrawdownListItem[]> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [
    sql`cc.investor_id = ${session.investorId}`,
  ];
  if (commitmentId) {
    conditions.push(sql`d.commitment_id = ${commitmentId}`);
  }
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.commitment_id,
      cc.commitment_code,
      d.drawdown_number,
      d.amount_minor,
      d.currency,
      d.amount_usd_minor,
      d.fx_rate_at_drawdown,
      d.requested_at,
      d.due_date,
      d.received_at,
      d.status,
      d.trigger_reason,
      d.payment_method,
      d.payment_reference
    FROM capital_drawdowns d
    JOIN capital_commitments cc ON cc.id = d.commitment_id
    ${where}
    ORDER BY cc.commitment_code, d.drawdown_number
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    commitmentId: String(r.commitment_id),
    commitmentCode: String(r.commitment_code),
    drawdownNumber: Number(r.drawdown_number),
    amountMinor: toStr(r.amount_minor),
    currency: r.currency as SupportedCurrency,
    amountUsdMinor: toStr(r.amount_usd_minor),
    fxRateAtDrawdown: toStr(r.fx_rate_at_drawdown),
    requestedAt: new Date(r.requested_at as string).toISOString(),
    dueDate: String(r.due_date),
    receivedAt: r.received_at
      ? new Date(r.received_at as string).toISOString()
      : null,
    status: r.status as DrawdownStatus,
    triggerReason: r.trigger_reason as DrawdownTriggerReason,
    paymentMethod: r.payment_method
      ? (String(r.payment_method) as DrawdownPaymentMethod)
      : null,
    paymentReference: r.payment_reference ? String(r.payment_reference) : null,
  }));
}

// ----------------------------------------------------------------------------
// Wallets
// ----------------------------------------------------------------------------

export async function getMyWallet(commitmentId: string): Promise<{
  wallet: WalletSummary | null;
  recentTransactions: WalletTransactionListItem[];
}> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return { wallet: null, recentTransactions: [] };

  // Verify the commitment belongs to this investor (defense in depth).
  const [owns] = await db
    .select({ id: capitalCommitments.id })
    .from(capitalCommitments)
    .where(
      and(
        eq(capitalCommitments.id, commitmentId),
        eq(capitalCommitments.investorId, session.investorId),
      ),
    )
    .limit(1);
  if (!owns) return { wallet: null, recentTransactions: [] };

  const [w] = await db
    .select()
    .from(investorWallets)
    .where(eq(investorWallets.commitmentId, commitmentId))
    .limit(1);
  if (!w) return { wallet: null, recentTransactions: [] };

  const tx = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, w.id))
    .orderBy(desc(walletTransactions.occurredAt))
    .limit(20);

  return {
    wallet: {
      id: w.id,
      commitmentId: w.commitmentId,
      availableBalanceUsdMinor: toStr(w.availableBalanceUsdMinor),
      holdBalanceUsdMinor: toStr(w.holdBalanceUsdMinor),
      reinvestPendingUsdMinor: toStr(w.reinvestPendingUsdMinor),
      totalDrawnUsdMinor: toStr(w.totalDrawnUsdMinor),
      totalReturnedCapitalUsdMinor: toStr(w.totalReturnedCapitalUsdMinor),
      totalProfitDistributedUsdMinor: toStr(w.totalProfitDistributedUsdMinor),
      totalWithdrawnUsdMinor: toStr(w.totalWithdrawnUsdMinor),
      totalReinvestedUsdMinor: toStr(w.totalReinvestedUsdMinor),
      lastActivityAt: new Date(w.lastActivityAt).toISOString(),
      cashBalanceMinor: toStr(w.cashBalanceMinor),
      reinvestmentBalanceMinor: toStr(w.reinvestmentBalanceMinor),
      pendingDistributionMinor: toStr(w.pendingDistributionMinor),
    },
    recentTransactions: tx.map(
      (t): WalletTransactionListItem => ({
        id: t.id,
        walletId: t.walletId,
        commitmentId: t.commitmentId,
        transactionType: t.transactionType as WalletTransactionType,
        amountUsdMinor: toStr(t.amountUsdMinor),
        balanceAvailableAfterUsdMinor: toStr(t.balanceAvailableAfterUsdMinor),
        balanceHoldAfterUsdMinor: toStr(t.balanceHoldAfterUsdMinor),
        drawdownId: t.drawdownId ?? null,
        distributionId: t.distributionId ?? null,
        description: t.description ?? null,
        externalReference: t.externalReference ?? null,
        occurredAt: new Date(t.occurredAt).toISOString(),
      }),
    ),
  };
}

export interface WalletRequestItem {
  id: string;
  requestCode: string;
  requestType: string;
  status: string;
  requestedAmountMinor: string;
  currency: string;
  submittedAt: string;
}

/**
 * Portal requests (withdraw / reinvest / transfer) tied to a specific
 * commitment — either by `related_commitment_id` or by the commitment's
 * project on `source_project_id`. Scoped to the calling investor.
 * Newest first. Drives the "requests against this wallet" rail on the
 * wallet detail page.
 */
export async function getMyWalletRequests(
  commitmentId: string,
): Promise<WalletRequestItem[]> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return [];

  // Ownership: confirm the commitment is the investor's, and resolve its
  // project for the source-project match.
  const [owns] = await db
    .select({
      id: capitalCommitments.id,
      projectId: capitalCommitments.projectId,
    })
    .from(capitalCommitments)
    .where(
      and(
        eq(capitalCommitments.id, commitmentId),
        eq(capitalCommitments.investorId, session.investorId),
      ),
    )
    .limit(1);
  if (!owns) return [];

  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.request_code,
      r.request_type,
      r.status,
      r.requested_amount_minor,
      r.currency,
      r.submitted_at
    FROM investor_portal_requests r
    WHERE r.investor_id = ${session.investorId}
      AND (
        r.related_commitment_id = ${commitmentId}
        ${owns.projectId ? sql`OR r.source_project_id = ${owns.projectId}` : sql``}
      )
    ORDER BY r.submitted_at DESC
    LIMIT 10
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    requestCode: String(r.request_code),
    requestType: String(r.request_type),
    status: String(r.status),
    requestedAmountMinor: toStr(r.requested_amount_minor),
    currency: String(r.currency),
    submittedAt: new Date(r.submitted_at as string).toISOString(),
  }));
}

export async function getMyIRR(commitmentId: string): Promise<IRRResult> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return { irrAnnualized: null, cashflows: [] };

  // Verify ownership.
  const [owns] = await db
    .select({ id: capitalCommitments.id })
    .from(capitalCommitments)
    .where(
      and(
        eq(capitalCommitments.id, commitmentId),
        eq(capitalCommitments.investorId, session.investorId),
      ),
    )
    .limit(1);
  if (!owns) return { irrAnnualized: null, cashflows: [] };

  const [wallet] = await db
    .select({
      id: investorWallets.id,
      availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
      holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
    })
    .from(investorWallets)
    .where(eq(investorWallets.commitmentId, commitmentId))
    .limit(1);
  if (!wallet) return { irrAnnualized: null, cashflows: [] };

  const tx = await db
    .select({
      transactionType: walletTransactions.transactionType,
      amountUsdMinor: walletTransactions.amountUsdMinor,
      occurredAt: walletTransactions.occurredAt,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, wallet.id))
    .orderBy(walletTransactions.occurredAt);

  type Flow = { date: Date; amount: bigint; type: "in" | "out" | "terminal" };
  const flows: Flow[] = [];
  for (const t of tx) {
    const ttype = t.transactionType as WalletTransactionType;
    if (WALLET_CASH_IN_TYPES.has(ttype)) {
      flows.push({
        date: t.occurredAt,
        amount: -BigInt(t.amountUsdMinor),
        type: "in",
      });
    } else if (WALLET_CASH_OUT_TYPES.has(ttype)) {
      flows.push({
        date: t.occurredAt,
        amount: BigInt(Math.abs(Number(t.amountUsdMinor))),
        type: "out",
      });
    }
  }
  const remaining =
    BigInt(wallet.availableBalanceUsdMinor) +
    BigInt(wallet.holdBalanceUsdMinor);
  if (remaining > 0n) {
    flows.push({ date: new Date(), amount: remaining, type: "terminal" });
  }

  const cashflows = flows.map((f) => ({
    date: f.date.toISOString(),
    amountUsdMinor: f.amount.toString(),
    type: f.type,
  }));
  if (flows.length < 2) return { irrAnnualized: null, cashflows };

  // Newton-Raphson — same as internal implementation
  const t0 = flows[0].date.getTime();
  const series = flows.map((f) => ({
    years: (f.date.getTime() - t0) / (365 * 24 * 60 * 60 * 1000),
    amount: Number(f.amount) / 100,
  }));
  let r = 0.1;
  let irr: number | null = null;
  for (let i = 0; i < 200; i++) {
    let npv = 0;
    let dnpv = 0;
    for (const { years, amount } of series) {
      const denom = Math.pow(1 + r, years);
      npv += amount / denom;
      dnpv -= (amount * years) / (denom * (1 + r));
    }
    if (Math.abs(npv) < 1e-6) {
      irr = r;
      break;
    }
    if (Math.abs(dnpv) < 1e-12) break;
    const next = r - npv / dnpv;
    if (!Number.isFinite(next)) break;
    if (next <= -0.99) {
      r = -0.99;
      continue;
    }
    if (Math.abs(next - r) < 1e-9) {
      irr = next;
      break;
    }
    r = next;
  }
  return { irrAnnualized: irr, cashflows };
}

// ----------------------------------------------------------------------------
// Distributions
// ----------------------------------------------------------------------------

export async function getMyDistributions(): Promise<DistributionListItem[]> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.project_id,
      p.name AS project_name,
      d.distribution_number,
      d.distribution_type,
      d.total_amount_usd_minor,
      d.trigger_reason,
      d.declared_at,
      d.effective_date,
      d.status,
      d.completed_at,
      count(*)::int AS allocation_count
    FROM distributions d
    JOIN distribution_allocations a ON a.distribution_id = d.id
    JOIN capital_commitments cc ON cc.id = a.commitment_id
    LEFT JOIN projects p ON p.id = d.project_id
    WHERE cc.investor_id = ${session.investorId}
    GROUP BY d.id, p.name
    ORDER BY d.declared_at DESC
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    projectId: r.project_id ? String(r.project_id) : null,
    projectName: r.project_name ? String(r.project_name) : null,
    distributionNumber: Number(r.distribution_number),
    distributionType: r.distribution_type as DistributionType,
    totalAmountUsdMinor: toStr(r.total_amount_usd_minor),
    triggerReason:
      r.trigger_reason as DistributionListItem["triggerReason"],
    declaredAt: new Date(r.declared_at as string).toISOString(),
    effectiveDate: String(r.effective_date),
    status: r.status as DistributionStatus,
    completedAt: r.completed_at
      ? new Date(r.completed_at as string).toISOString()
      : null,
    allocationCount: Number(r.allocation_count ?? 0),
  }));
}

export async function getMyDistributionAllocation(
  distributionId: string,
): Promise<DistributionAllocationItem | null> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return null;
  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.commitment_id,
      cc.commitment_code,
      i.legal_name AS investor_legal_name,
      a.capital_return_amount_usd_minor,
      a.profit_amount_usd_minor,
      a.total_amount_usd_minor,
      a.outstanding_capital_at_declare_usd_minor,
      a.profit_share_percent_used,
      a.status,
      a.executed_at
    FROM distribution_allocations a
    JOIN capital_commitments cc ON cc.id = a.commitment_id
    JOIN investors i ON i.id = cc.investor_id
    WHERE a.distribution_id = ${distributionId}
      AND cc.investor_id = ${session.investorId}
    LIMIT 1
  `);
  const r = (rows as Record<string, unknown>[])[0];
  if (!r) return null;
  return {
    id: String(r.id),
    commitmentId: String(r.commitment_id),
    commitmentCode: String(r.commitment_code),
    investorLegalName: String(r.investor_legal_name),
    capitalReturnAmountUsdMinor: toStr(r.capital_return_amount_usd_minor),
    profitAmountUsdMinor: toStr(r.profit_amount_usd_minor),
    totalAmountUsdMinor: toStr(r.total_amount_usd_minor),
    outstandingCapitalAtDeclareUsdMinor: toStr(
      r.outstanding_capital_at_declare_usd_minor,
    ),
    profitSharePercentUsed: toStr(r.profit_share_percent_used),
    status: r.status as DistributionAllocationItem["status"],
    executedAt: r.executed_at
      ? new Date(r.executed_at as string).toISOString()
      : null,
  };
}

// ----------------------------------------------------------------------------
// Documents
// ----------------------------------------------------------------------------

export interface InvestorDocumentRow {
  id: string;
  title: string;
  documentType: string;
  source: "agreement" | "drawdown_receipt";
  sourceLabel: string;
  createdAt: string;
}

export async function getMyDocuments(): Promise<InvestorDocumentRow[]> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT d.id, d.title, d.document_type, d.created_at,
           'agreement'::text AS source,
           cc.commitment_code AS source_label
    FROM documents d
    JOIN capital_commitments cc ON cc.agreement_document_id = d.id
    WHERE cc.investor_id = ${session.investorId}
    UNION ALL
    SELECT d.id, d.title, d.document_type, d.created_at,
           'drawdown_receipt'::text AS source,
           cc.commitment_code || ' #' || dd.drawdown_number AS source_label
    FROM documents d
    JOIN capital_drawdowns dd ON dd.receipt_document_id = d.id
    JOIN capital_commitments cc ON cc.id = dd.commitment_id
    WHERE cc.investor_id = ${session.investorId}
    ORDER BY 4 DESC
  `);
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    documentType: String(r.document_type),
    source: r.source as "agreement" | "drawdown_receipt",
    sourceLabel: String(r.source_label),
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

// ----------------------------------------------------------------------------
// Profile
// ----------------------------------------------------------------------------

export interface InvestorProfile {
  investorId: string;
  investorCode: string;
  legalName: string;
  investorType: InvestorType;
  legalEntityType: string | null;
  taxResidency: string | null;
  primaryCurrency: SupportedCurrency;
  reportingLanguage: ReportingLanguage;
  contactEmail: string | null;
  contactPhone: string | null;
  contactName: string | null;
  status: string;
  onboardedAt: string;
}

export async function getMyProfile(): Promise<InvestorProfile> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) throw new Error("DB not configured");
  const [r] = await db
    .select({
      id: investors.id,
      code: investors.investorCode,
      legalName: investors.legalName,
      investorType: investors.investorType,
      legalEntityType: investors.legalEntityType,
      taxResidency: investors.taxResidency,
      primaryCurrency: investors.primaryCurrency,
      reportingLanguage: investors.reportingLanguage,
      contactEmail: investors.contactEmail,
      contactPhone: investors.contactPhone,
      contactName: contacts.fullName,
      status: investors.status,
      onboardedAt: investors.onboardedAt,
    })
    .from(investors)
    .leftJoin(contacts, eq(contacts.id, investors.contactId))
    .where(eq(investors.id, session.investorId))
    .limit(1);
  if (!r) throw new Error("Investor record not found");
  return {
    investorId: r.id,
    investorCode: r.code,
    legalName: r.legalName,
    investorType: r.investorType as InvestorType,
    legalEntityType: r.legalEntityType,
    taxResidency: r.taxResidency,
    primaryCurrency: r.primaryCurrency as SupportedCurrency,
    reportingLanguage: r.reportingLanguage as ReportingLanguage,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    contactName: r.contactName,
    status: r.status,
    onboardedAt: new Date(r.onboardedAt).toISOString(),
  };
}

// ----------------------------------------------------------------------------
// Stage 6.P7 — distribution forecasts
// ----------------------------------------------------------------------------

import {
  computeDistributionForecast,
  type ForecastResult,
  type CompletedDistribution,
} from "./forecasts";

export interface MyForecastResult {
  forecast: ForecastResult;
  asOf: string;
  /** Number of completed distributions across all of the investor's commitments. */
  completedCount: number;
}

/**
 * Compute a 4-quarter forecast based on rolling-average over the
 * investor's completed distributions across all their commitments.
 * Mirrors `getMyDistributions` shape but aggregates across
 * commitments — the investor cares about total cash they'll see.
 */
export async function getMyForecast(input?: {
  horizonQuarters?: number;
}): Promise<MyForecastResult> {
  const session = await requireInvestorSession();
  const db = getDb();
  const asOf = new Date();
  if (!db) {
    return {
      forecast: { quarters: [], totalProjectedMinor: 0n, basisCount: 0 },
      asOf: asOf.toISOString(),
      completedCount: 0,
    };
  }

  const rows = await db.execute(sql`
    SELECT
      d.effective_date,
      a.total_amount_usd_minor AS investor_share_minor
    FROM distribution_allocations a
    JOIN distributions d ON d.id = a.distribution_id
    JOIN capital_commitments cc ON cc.id = a.commitment_id
    WHERE cc.investor_id = ${session.investorId}
      AND d.status = 'completed'
    ORDER BY d.effective_date ASC
  `);

  const completed: CompletedDistribution[] = (
    rows as Record<string, unknown>[]
  ).map((r) => ({
    effectiveDate: new Date(String(r.effective_date)),
    investorShareMinor: BigInt(String(r.investor_share_minor)),
  }));

  const forecast = computeDistributionForecast({
    completedDistributions: completed,
    horizonQuarters: input?.horizonQuarters ?? 4,
    asOf,
  });

  return {
    forecast,
    asOf: asOf.toISOString(),
    completedCount: completed.length,
  };
}
