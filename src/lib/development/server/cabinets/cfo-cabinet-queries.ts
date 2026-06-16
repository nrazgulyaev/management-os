import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
// SHAPE-FIX-1 / DAILY-DIGEST P0.5 — rowsOf handles postgres-js Array shape.
// TODO(DB-SHAPE-CODEMOD-1): adjacent Dev OS cabinet files still pending sweep.
import { requireOrgId } from "@/features/auth/require-org";

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

  // PERF (Phase 4): the chattiest single dev-side loader (~6 sequential
  // round-trips). Only the RAW `::text`/numeric-as-text rows are cached; the
  // rowToSnapshot/Number() mapping runs live outside, so the cached payload
  // carries no bigint.
  //
  // TENANCY: executive_metrics_snapshots + dev_transactions are org-owning
  // (organization_id) — scope them by the caller's org (the sibling getCfoSnapshot
  // does the same). agent_outputs + dev_invoices have NO organization_id column
  // (global dev-os tables) so they stay unscoped. orgId is resolved ABOVE the
  // cache (requireOrgId reads cookies, which are banned inside a cache callback)
  // and is BOTH a key-part and interpolated into the scoped WHEREs.
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return EMPTY;
  const cached = await unstable_cache(
    async () => {
      const cdb = getDb();
      if (!cdb) return null;
      const snapsRow = await cdb.execute<SnapshotRow>(sql`
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
           AND organization_id = ${orgId}
         ORDER BY snapshot_date DESC LIMIT 2
      `);
      const txRows = await cdb.execute<{
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
         WHERE organization_id = ${orgId}
         ORDER BY transaction_date DESC, transaction_code DESC
         LIMIT 8
      `);
      const taxRows = await cdb.execute<{
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
      const qsRow = await cdb.execute<{ output_code: string }>(sql`
        SELECT output_code FROM agent_outputs
         WHERE agent_key = 'qs_cost_analyst'
         ORDER BY created_at DESC LIMIT 1
      `);
      const pendingRow = await cdb.execute<{ n: string }>(sql`
        SELECT COUNT(*)::text AS n FROM agent_outputs
         WHERE agent_key = 'tax_assistant'
           AND status = 'awaiting_review'
      `);
      const invRow = await cdb.execute<{ n: string }>(sql`
        SELECT COUNT(*)::text AS n FROM dev_invoices
         WHERE status IN ('issued', 'sent')
      `);
      return {
        snapRows: rowsOf<SnapshotRow>(snapsRow),
        txRows: rowsOf<{
          id: string;
          transaction_code: string;
          direction: string;
          description: string;
          counterparty_name: string | null;
          amount_minor: string;
          currency: string;
          transaction_date: string;
        }>(txRows),
        taxRows: rowsOf<{
          output_code: string;
          title: string;
          summary: string;
          status: string;
          created_at: string;
        }>(taxRows),
        qsRow: rowsOf<{ output_code: string }>(qsRow),
        pendingRow: rowsOf<{ n: string }>(pendingRow),
        invRow: rowsOf<{ n: string }>(invRow),
      };
    },
    ["dev", "cfo-cabinet", orgId],
    { revalidate: 120 },
  )();
  if (!cached) return EMPTY;

  const snapRows = cached.snapRows;
  const latest = snapRows[0] ? rowToSnapshot(snapRows[0]) : null;
  const previous = snapRows[1] ? rowToSnapshot(snapRows[1]) : null;

  const recentTransactions: CfoCabinetRecentTransaction[] = cached.txRows.map((r) => ({
    id: r.id,
    transactionCode: r.transaction_code,
    direction: r.direction,
    description: r.description,
    counterpartyName: r.counterparty_name,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    transactionDate: r.transaction_date,
  }));

  const recentTaxAssistantOutputs: CfoCabinetTaxAssistantOutput[] = cached.taxRows.map((r) => ({
    outputCode: r.output_code,
    title: r.title,
    summary: r.summary,
    status: r.status,
    createdAt: r.created_at,
  }));

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
      cached.qsRow[0]?.output_code ?? null,
    pendingTaxClassificationsCount: Number(
      cached.pendingRow[0]?.n ?? "0",
    ),
    invoicesAwaitingPaymentCount: Number(
      cached.invRow[0]?.n ?? "0",
    ),
  };
}

// =============================================================================
// Sprint TASK-7-DATA-PART-1 — _handoff/ cabinet aggregations.
//
// The prototype CFO cabinet (`src/app/(development-app)/development-os/
// cabinets/cfo-accountant/page.tsx`) needs five live aggregations the
// older `loadCfoCabinet()` doesn't surface. New functions live here so
// the cabinet stays in line with the rest of the cabinet-query module.
//
// All queries are org-scoped via `requireOrgId()` (TENANT-1). Reads
// over reference data (`tax_types`) intentionally aren't filtered by
// org — tax types are country-scoped reference data, not tenant-owned.
// =============================================================================

export interface CfoKpis {
  cashOnHandMinor: number;
  receivablesMinor: number;
  payablesNext30Minor: number;
  spendMtdMinor: number;
  /** Forward-looking 30-day burn = avg daily outflow × 30. */
  forecastBurn30dMinor: number;
  baseCurrency: string;
}

export async function getCfoKpis(): Promise<CfoKpis | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();

  // Snapshot for cash / AR / AP (already aggregated by the daily cron).
  const snapRow = await db.execute<{
    cash: string;
    receivables: string;
    pay30: string;
    currency: string;
  }>(sql`
    SELECT total_cash_on_hand_minor::text       AS cash,
           total_receivables_minor::text        AS receivables,
           COALESCE(payables_due_next_30_days_minor, 0)::text AS pay30,
           base_currency                         AS currency
      FROM executive_metrics_snapshots
     WHERE scope = 'company_wide'
       AND project_id IS NULL
       AND organization_id = ${orgId}
     ORDER BY snapshot_date DESC LIMIT 1
  `);
  const snap = rowsOf<{
    cash: string;
    receivables: string;
    pay30: string;
    currency: string;
  }>(snapRow)[0] ?? null;

  // MTD outflow direct from dev_transactions — snapshot doesn't carry it.
  const mtdRow = await db.execute<{ spend: string; currency: string | null }>(sql`
    SELECT COALESCE(SUM(amount_usd_minor), 0)::text AS spend,
           MIN(currency)                            AS currency
      FROM dev_transactions
     WHERE organization_id = ${orgId}
       AND direction = 'outflow'
       AND transaction_date >= date_trunc('month', CURRENT_DATE)
  `);
  const spendMtdMinor = Number(
    rowsOf<{ spend: string }>(mtdRow)[0]?.spend ?? "0",
  );

  // Forecast burn = trailing 30-day outflow average × 30. Simple and
  // good enough until the cashflow_forecasts service surfaces a real
  // projection.
  const burnRow = await db.execute<{ avg30: string }>(sql`
    SELECT COALESCE(SUM(amount_usd_minor), 0)::text AS avg30
      FROM dev_transactions
     WHERE organization_id = ${orgId}
       AND direction = 'outflow'
       AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
  `);
  const trailing30 = Number(
    rowsOf<{ avg30: string }>(burnRow)[0]?.avg30 ?? "0",
  );

  return {
    cashOnHandMinor: snap ? Number(snap.cash) : 0,
    receivablesMinor: snap ? Number(snap.receivables) : 0,
    payablesNext30Minor: snap ? Number(snap.pay30) : 0,
    spendMtdMinor,
    forecastBurn30dMinor: trailing30, // already a 30-day window
    baseCurrency: snap?.currency ?? "USD",
  };
}

export interface PnlByProjectRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Sum of outflow USD-minor where category_type = 'capex' (proxy for hard cost). */
  hardCostMinor: number;
  /** Sum of outflow USD-minor where category_type IN ('opex','cogs') (soft + ops). */
  softCostMinor: number;
  /** Sum of outflow USD-minor where category_type = 'corporate_event' (financing). */
  financingMinor: number;
  totalMinor: number;
}

export async function getPnlByProject(): Promise<PnlByProjectRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    project_id: string;
    project_code: string;
    project_name: string;
    hard: string;
    soft: string;
    fin: string;
  }>(sql`
    SELECT p.id::text                                        AS project_id,
           p.project_code                                     AS project_code,
           p.name                                             AS project_name,
           COALESCE(SUM(CASE WHEN cc.category_type = 'capex'
                        THEN t.amount_usd_minor ELSE 0 END), 0)::text AS hard,
           COALESCE(SUM(CASE WHEN cc.category_type IN ('opex','cogs')
                        THEN t.amount_usd_minor ELSE 0 END), 0)::text AS soft,
           COALESCE(SUM(CASE WHEN cc.category_type = 'corporate_event'
                        THEN t.amount_usd_minor ELSE 0 END), 0)::text AS fin
      FROM projects p
      LEFT JOIN dev_transactions t
             ON t.project_id = p.id
            AND t.organization_id = ${orgId}
            AND t.direction = 'outflow'
            AND t.transaction_date >= date_trunc('year', CURRENT_DATE)
      LEFT JOIN dev_cost_categories cc
             ON cc.id = t.category_id
     WHERE p.organization_id = ${orgId}
     GROUP BY p.id, p.project_code, p.name
     ORDER BY p.project_code
  `);
  const out: PnlByProjectRow[] = rowsOf<{
    project_id: string;
    project_code: string;
    project_name: string;
    hard: string;
    soft: string;
    fin: string;
  }>(rows).map((r) => {
    const hard = Number(r.hard);
    const soft = Number(r.soft);
    const fin = Number(r.fin);
    return {
      projectId: r.project_id,
      projectCode: r.project_code,
      projectName: r.project_name,
      hardCostMinor: hard,
      softCostMinor: soft,
      financingMinor: fin,
      totalMinor: hard + soft + fin,
    };
  });
  return out;
}

export interface CashStripPoint {
  weekIso: string; // YYYY-WW
  weekLabel: string; // "W34"
  netMinor: number; // (inflow - outflow) for the week, USD minor
  isFuture: boolean;
}

export async function getCashStrip6Week(): Promise<CashStripPoint[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  // Trailing 8 weeks of actuals — frontend visually distinguishes
  // the 3 most-recent as past and the rest as forecast-shaded.
  const rows = await db.execute<{ wk: string; week_label: string; net: string }>(sql`
    SELECT to_char(date_trunc('week', transaction_date), 'IYYY-IW') AS wk,
           'W' || to_char(date_trunc('week', transaction_date), 'IW') AS week_label,
           COALESCE(SUM(
             CASE WHEN direction = 'inflow' THEN amount_usd_minor
                  WHEN direction = 'outflow' THEN -amount_usd_minor
                  ELSE 0 END
           ), 0)::text AS net
      FROM dev_transactions
     WHERE organization_id = ${orgId}
       AND transaction_date >= CURRENT_DATE - INTERVAL '8 weeks'
     GROUP BY 1, 2
     ORDER BY 1
  `);
  return rowsOf<{ wk: string; week_label: string; net: string }>(rows).map(
    (r, i, arr) => ({
      weekIso: r.wk,
      weekLabel: r.week_label,
      netMinor: Number(r.net),
      isFuture: i >= arr.length - 5, // last 5 weeks tinted as forecast in UI
    }),
  );
}

export interface TaxTypeRow {
  typeKey: string;
  displayName: string;
  ratePercentage: string; // numeric → string for tabular display
  reportingPeriod: string;
  countryCode: string | null;
}

export async function getActiveTaxTypes(): Promise<TaxTypeRow[]> {
  const db = getDb();
  if (!db) return [];
  // tax_types is country-scoped reference data; no org_id filter.
  const rows = await db.execute<{
    type_key: string;
    display_name: string;
    rate_percentage: string;
    reporting_period: string;
    country_code: string | null;
  }>(sql`
    SELECT type_key, display_name, rate_percentage::text AS rate_percentage,
           reporting_period, country_code
      FROM tax_types
     WHERE is_active = true
       AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
     ORDER BY country_code NULLS LAST, display_name
     LIMIT 12
  `);
  return rowsOf<{
    type_key: string;
    display_name: string;
    rate_percentage: string;
    reporting_period: string;
    country_code: string | null;
  }>(rows).map((r) => ({
    typeKey: r.type_key,
    displayName: r.display_name,
    ratePercentage: r.rate_percentage,
    reportingPeriod: r.reporting_period,
    countryCode: r.country_code,
  }));
}

export interface SharedCostRow {
  categoryId: string;
  categoryCode: string;
  displayName: string;
  /** MTD outflow on this overhead category (USD minor). */
  mtdMinor: number;
}

export async function getSharedCostsBreakdown(): Promise<SharedCostRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  // Overhead categories — anything explicitly tagged `corporate_event`
  // (the schema's shared-cost type) or with category_code prefixed
  // 'overhead-' etc. Conservative: trust the enum value.
  const rows = await db.execute<{
    id: string;
    code: string;
    name: string;
    mtd: string;
  }>(sql`
    SELECT cc.id::text                                    AS id,
           cc.category_code                                AS code,
           cc.display_name                                 AS name,
           COALESCE(SUM(t.amount_usd_minor), 0)::text      AS mtd
      FROM dev_cost_categories cc
      LEFT JOIN dev_transactions t
             ON t.category_id = cc.id
            AND t.organization_id = ${orgId}
            AND t.direction = 'outflow'
            AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
     WHERE cc.organization_id = ${orgId}
       AND cc.is_active = true
       AND cc.category_type = 'corporate_event'
     GROUP BY cc.id, cc.category_code, cc.display_name
     ORDER BY cc.display_order, cc.display_name
     LIMIT 8
  `);
  return rowsOf<{
    id: string; code: string; name: string; mtd: string;
  }>(rows).map((r) => ({
    categoryId: r.id,
    categoryCode: r.code,
    displayName: r.name,
    mtdMinor: Number(r.mtd),
  }));
}

// =============================================================================
// DAILY-DIGEST-SPRINT-1 P3 — date-scoped construction expenses for the Daily
// Digest agent.
// =============================================================================

export interface DigestConstructionExpensesForDate {
  date: string;
  outflowsCount: number;
  outflowsUsdMinor: number;
  inflowsCount: number;
  inflowsUsdMinor: number;
  /** Approximate anomaly flag — any single outflow ≥ 90th percentile
   *  of the trailing 30 days. Crude but actionable for a digest. */
  largeOutflowsCount: number;
  topOutflows: Array<{
    transactionCode: string;
    counterpartyName: string | null;
    description: string;
    amountUsdMinor: number;
    projectId: string | null;
  }>;
}

export async function getConstructionExpensesForDate(input: {
  orgId: string;
  date: string;
}): Promise<DigestConstructionExpensesForDate> {
  const db = getDb();
  if (!db) {
    return {
      date: input.date,
      outflowsCount: 0,
      outflowsUsdMinor: 0,
      inflowsCount: 0,
      inflowsUsdMinor: 0,
      largeOutflowsCount: 0,
      topOutflows: [],
    };
  }

  const aggRows = await db.execute<{
    out_n: string;
    out_sum: string;
    in_n: string;
    in_sum: string;
    large_n: string;
  }>(sql`
    WITH window_amounts AS (
      SELECT amount_usd_minor
        FROM dev_transactions
       WHERE organization_id = ${input.orgId}::uuid
         AND direction = 'outflow'
         AND transaction_date >= ${input.date}::date - INTERVAL '30 days'
         AND transaction_date <= ${input.date}::date
    ),
    threshold AS (
      SELECT percentile_cont(0.90) WITHIN GROUP (ORDER BY amount_usd_minor) AS p90
        FROM window_amounts
    )
    SELECT
      (SELECT COUNT(*)::text FROM dev_transactions
        WHERE organization_id = ${input.orgId}::uuid
          AND direction = 'outflow'
          AND transaction_date = ${input.date}::date) AS out_n,
      (SELECT COALESCE(SUM(amount_usd_minor), 0)::text FROM dev_transactions
        WHERE organization_id = ${input.orgId}::uuid
          AND direction = 'outflow'
          AND transaction_date = ${input.date}::date) AS out_sum,
      (SELECT COUNT(*)::text FROM dev_transactions
        WHERE organization_id = ${input.orgId}::uuid
          AND direction = 'inflow'
          AND transaction_date = ${input.date}::date) AS in_n,
      (SELECT COALESCE(SUM(amount_usd_minor), 0)::text FROM dev_transactions
        WHERE organization_id = ${input.orgId}::uuid
          AND direction = 'inflow'
          AND transaction_date = ${input.date}::date) AS in_sum,
      (SELECT COUNT(*)::text FROM dev_transactions, threshold
        WHERE organization_id = ${input.orgId}::uuid
          AND direction = 'outflow'
          AND transaction_date = ${input.date}::date
          AND amount_usd_minor >= threshold.p90) AS large_n
  `);
  const agg = rowsOf<{
    out_n: string;
    out_sum: string;
    in_n: string;
    in_sum: string;
    large_n: string;
  }>(aggRows)[0];

  const topRows = await db.execute<{
    transaction_code: string;
    counterparty_name: string | null;
    description: string;
    amount_usd_minor: string;
    project_id: string | null;
  }>(sql`
    SELECT transaction_code,
           counterparty_name,
           description,
           amount_usd_minor::text       AS amount_usd_minor,
           project_id::text             AS project_id
      FROM dev_transactions
     WHERE organization_id = ${input.orgId}::uuid
       AND direction = 'outflow'
       AND transaction_date = ${input.date}::date
     ORDER BY amount_usd_minor DESC
     LIMIT 3
  `);
  const topOutflows = rowsOf<{
    transaction_code: string;
    counterparty_name: string | null;
    description: string;
    amount_usd_minor: string;
    project_id: string | null;
  }>(topRows).map((r) => ({
    transactionCode: r.transaction_code,
    counterpartyName: r.counterparty_name,
    description: r.description,
    amountUsdMinor: Number(r.amount_usd_minor),
    projectId: r.project_id,
  }));

  return {
    date: input.date,
    outflowsCount: Number(agg?.out_n ?? "0"),
    outflowsUsdMinor: Number(agg?.out_sum ?? "0"),
    inflowsCount: Number(agg?.in_n ?? "0"),
    inflowsUsdMinor: Number(agg?.in_sum ?? "0"),
    largeOutflowsCount: Number(agg?.large_n ?? "0"),
    topOutflows,
  };
}
