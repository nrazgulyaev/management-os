import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface CfoCabinetData {
  latestSnapshot: {
    cashOnHandMinor: number;
    receivablesMinor: number;
    payablesNext30Minor: number;
    payablesOverdueMinor: number;
    cashAt30Minor: number;
    cashAt60Minor: number;
    cashAt90Minor: number;
    unclassifiedTransactionsCount: number;
    baseCurrency: string;
  } | null;
  latestTaxAssistantOutputCode: string | null;
  latestQsCostAnalystOutputCode: string | null;
  pendingTaxClassificationsCount: number;
  invoicesAwaitingPaymentCount: number;
}

export async function loadCfoCabinet(): Promise<CfoCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      latestSnapshot: null,
      latestTaxAssistantOutputCode: null,
      latestQsCostAnalystOutputCode: null,
      pendingTaxClassificationsCount: 0,
      invoicesAwaitingPaymentCount: 0,
    };
  }

  const snapRow = await db.execute<{
    cash: string;
    receivables: string;
    pay30: string;
    pay_overdue: string;
    cash_30: string;
    cash_60: string;
    cash_90: string;
    unclassified: string;
    currency: string;
  }>(sql`
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
     ORDER BY snapshot_date DESC LIMIT 1
  `);
  const snap =
    (snapRow as unknown as {
      rows: Array<{
        cash: string;
        receivables: string;
        pay30: string;
        pay_overdue: string;
        cash_30: string;
        cash_60: string;
        cash_90: string;
        unclassified: string;
        currency: string;
      }>;
    }).rows?.[0] ?? null;

  const taxRow = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'tax_assistant'
     ORDER BY created_at DESC LIMIT 1
  `);
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
    latestSnapshot: snap
      ? {
          cashOnHandMinor: Number(snap.cash),
          receivablesMinor: Number(snap.receivables),
          payablesNext30Minor: Number(snap.pay30),
          payablesOverdueMinor: Number(snap.pay_overdue),
          cashAt30Minor: Number(snap.cash_30),
          cashAt60Minor: Number(snap.cash_60),
          cashAt90Minor: Number(snap.cash_90),
          unclassifiedTransactionsCount: Number(snap.unclassified),
          baseCurrency: snap.currency,
        }
      : null,
    latestTaxAssistantOutputCode:
      (taxRow as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
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
