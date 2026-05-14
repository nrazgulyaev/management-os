import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Stage 10.5.A.1.2 — CFO/Accountant cabinet data aggregator.
 *
 * Originally Stage 6 ("latest snapshot only"). Stage 10.5.A.1 extends
 * with:
 *   - `previousSnapshot` (the snapshot ~30 days prior — used for trend
 *     deltas in the dashboard KPIs).
 *   - `recentTransactions` (last 8 dev_transactions for the inline
 *     activity feed).
 *
 * Same defensive empty-state shape; same lack of arguments (the daily
 * cron pre-aggregates per-org and we read whichever scope='company_wide'
 * row exists).
 */
export interface CfoCabinetSnapshot {
  cashOnHandMinor: number;
  receivablesMinor: number;
  payablesNext30Minor: number;
  payablesOverdueMinor: number;
  cashAt30Minor: number;
  cashAt60Minor: number;
  cashAt90Minor: number;
  unclassifiedTransactionsCount: number;
  baseCurrency: string;
}

export interface CfoCabinetRecentTransaction {
  id: string;
  transactionCode: string;
  direction: string;
  description: string;
  counterpartyName: string | null;
  amountMinor: number;
  currency: string;
  transactionDate: string;
}

/**
 * Sprint 4.5 — single tax-assistant output preview surfaced on the
 * cabinet apex. Up to 3 are returned (most recent first); each
 * carries enough information to render a self-contained card
 * without a join.
 */
export interface CfoCabinetTaxAssistantOutput {
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
}

export interface CfoCabinetData {
  latestSnapshot: CfoCabinetSnapshot | null;
  previousSnapshot: CfoCabinetSnapshot | null;
  recentTransactions: CfoCabinetRecentTransaction[];
  /** @deprecated Sprint 4.5 — use `recentTaxAssistantOutputs[0]?.outputCode` */
  latestTaxAssistantOutputCode: string | null;
  /** Sprint 4.5 — last 3 outputs (most recent first). */
  recentTaxAssistantOutputs: CfoCabinetTaxAssistantOutput[];
  latestQsCostAnalystOutputCode: string | null;
  pendingTaxClassificationsCount: number;
  invoicesAwaitingPaymentCount: number;
}

const EMPTY: CfoCabinetData = {
  latestSnapshot: null,
  previousSnapshot: null,
  recentTransactions: [],
  latestTaxAssistantOutputCode: null,
  recentTaxAssistantOutputs: [],
  latestQsCostAnalystOutputCode: null,
  pendingTaxClassificationsCount: 0,
  invoicesAwaitingPaymentCount: 0,
};

type SnapshotRow = {
  cash: string;
  receivables: string;
  pay30: string;
  pay_overdue: string;
  cash_30: string;
  cash_60: string;
  cash_90: string;
  unclassified: string;
  currency: string;
} & Record<string, unknown>;

function rowToSnapshot(r: SnapshotRow): CfoCabinetSnapshot {
  return {
    cashOnHandMinor: Number(r.cash),
    receivablesMinor: Number(r.receivables),
    payablesNext30Minor: Number(r.pay30),
    payablesOverdueMinor: Number(r.pay_overdue),
    cashAt30Minor: Number(r.cash_30),
    cashAt60Minor: Number(r.cash_60),
    cashAt90Minor: Number(r.cash_90),
    unclassifiedTransactionsCount: Number(r.unclassified),
    baseCurrency: r.currency,
  };
}

export async function loadCfoCabinet(): Promise<CfoCabinetData> {
  const db = getDb();
  if (!db) return EMPTY;

  const snapsRow = await db.execute<SnapshotRow>(sql`
    SELECT total_cash_on_hand_minor::text AS cash,
           total_receivables_minor::text AS receivables,
           COALESCE(payables_due_next_30_days_minor, 0)::text AS pay30,
           COALESCE(payables_overdue_minor, 0)::text AS pay_overdue,
           COALESCE(cash_at_30_days_minor, 0)::text AS cash_30,
           COALESCE(cash_at_60_days_minor, 0)::text AS cash_60,
           COALESCE(cash_at_90_days_minor, 0)::text AS cash_90,
           unclassified_transactions_count::text AS unclassified,
           base_currency AS currency
      FROM executive_metrics_snapshots
     WHERE scope = 'company_wide' AND project_id IS NULL
     ORDER BY snapshot_date DESC LIMIT 2
  `);
  const snapRows =
    (snapsRow as unknown as { rows: SnapshotRow[] }).rows ?? [];
  const latest = snapRows[0] ? rowToSnapshot(snapRows[0]) : null;
  const previous = snapRows[1] ? rowToSnapshot(snapRows[1]) : null;

  const txRows = await db.execute<{
    id: string;
    transaction_code: string;
    direction: string;
    description: string;
    counterparty_name: string | null;
    amount_minor: string;
    currency: string;
    transaction_date: string;
  }>(sql`
    SELECT id::text, transaction_code, direction, description,
           counterparty_name, amount_minor::text, currency,
           transaction_date::text
      FROM dev_transactions
     ORDER BY transaction_date DESC, transaction_code DESC
     LIMIT 8
  `);
  const recentTransactions: CfoCabinetRecentTransaction[] = (
    (txRows as unknown as {
      rows: Array<{
        id: string;
        transaction_code: string;
        direction: string;
        description: string;
        counterparty_name: string | null;
        amount_minor: string;
        currency: string;
        transaction_date: string;
      }>;
    }).rows ?? []
  ).map((r) => ({
    id: r.id,
    transactionCode: r.transaction_code,
    direction: r.direction,
    description: r.description,
    counterpartyName: r.counterparty_name,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    transactionDate: r.transaction_date,
  }));

  const taxRows = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    status: string;
    created_at: string;
  }>(sql`
    SELECT output_code, title, summary, status, created_at::text
      FROM agent_outputs
     WHERE agent_key = 'tax_assistant'
     ORDER BY created_at DESC LIMIT 3
  `);
  const recentTaxAssistantOutputs: CfoCabinetTaxAssistantOutput[] = (
    (taxRows as unknown as { rows: Array<{
      output_code: string;
      title: string;
      summary: string;
      status: string;
      created_at: string;
    }> }).rows ?? []
  ).map((r) => ({
    outputCode: r.output_code,
    title: r.title,
    summary: r.summary,
    status: r.status,
    createdAt: r.created_at,
  }));
  const qsRow = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'qs_cost_analyst'
     ORDER BY created_at DESC LIMIT 1
  `);
  const pendingRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM agent_outputs
     WHERE agent_key = 'tax_assistant'
       AND status = 'awaiting_review'
  `);
  const invRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM dev_invoices
     WHERE status IN ('issued', 'sent')
  `);

  return {
    latestSnapshot: latest,
    previousSnapshot: previous,
    recentTransactions,
    // Back-compat alias for callers that haven't migrated to the new
    // `recentTaxAssistantOutputs` array. Kept until all Sprint-4 page
    // consumers (cabinet apex + AI Insights) are on the new field.
    latestTaxAssistantOutputCode:
      recentTaxAssistantOutputs[0]?.outputCode ?? null,
    recentTaxAssistantOutputs,
    latestQsCostAnalystOutputCode:
      (qsRow as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
    pendingTaxClassificationsCount: Number(
      (pendingRow as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
    ),
    invoicesAwaitingPaymentCount: Number(
      (invRow as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
    ),
  };
}
