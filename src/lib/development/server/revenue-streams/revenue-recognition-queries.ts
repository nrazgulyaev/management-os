import "server-only";

import { sql } from "drizzle-orm";
import { requireDb, rowsOf } from "@/lib/db/client";

/**
 * Revenue-recognition view (read-side aggregation only — no schema).
 *
 * Reframes the raw per-period revenue-stream log + the sales contract
 * pipeline into a recognised-vs-deferred picture, per the Indonesian
 * property-development model where SALE revenue is recognised at the
 * AJB (Akta Jual Beli — the notarial deed transferring title), not when
 * cash is collected.
 *
 * Two recognition domains are aggregated here:
 *
 *  1. SALES / CONTRACTS (the AJB story).
 *     Cash collected against contract milestones (`paid_amount_usd_minor`)
 *     is treated as RECOGNISED once the contract group has reached the
 *     notarial-transfer point — `status = 'completed'` OR `completed_at`
 *     is set. Until then the collected cash is DEFERRED (a buyer deposit /
 *     contract liability, not income).
 *
 *  2. OPERATING STREAMS (rental / hotel / service / etc.).
 *     Operating revenue is earned ratably in-period: a stream is
 *     RECOGNISED once its `period_end` has passed; periods that end in the
 *     future are DEFERRED (billed/booked ahead of being earned).
 *
 * All money is BIGINT minor units. Sales figures are USD minor (the
 * contract ledger's reporting currency); operating-stream figures are in
 * their own `currency` (predominantly IDR) — they are reported on a
 * separate line and NOT summed across currencies.
 */

export interface ProjectRecognitionRow {
  projectId: string;
  projectName: string;
  projectSlug: string;
  /** Sales/contract cash, USD minor. */
  salesRecognisedUsdMinor: bigint;
  salesDeferredUsdMinor: bigint;
  /** Number of contract groups already at AJB / transferred. */
  contractsTransferred: number;
  /** Number of contract groups still pre-transfer (deferred). */
  contractsPending: number;
  /** Operating-stream net, in the stream's own currency (minor). */
  streamRecognisedMinor: bigint;
  streamDeferredMinor: bigint;
  /** Currency of the operating-stream figures (most common for the project). */
  streamCurrency: string;
}

export interface RecognitionTotals {
  salesRecognisedUsdMinor: bigint;
  salesDeferredUsdMinor: bigint;
  streamRecognisedMinor: bigint;
  streamDeferredMinor: bigint;
  streamCurrency: string;
  contractsTransferred: number;
  contractsPending: number;
}

export interface NextUnlock {
  projectName: string;
  villaUnitCode: string | null;
  contactName: string | null;
  /** Cash already collected on this pre-transfer contract (USD minor). */
  collectedUsdMinor: bigint;
  /** Total contract value (USD minor). */
  totalContractUsdMinor: bigint;
  status: string;
}

export interface RecognitionView {
  projects: ProjectRecognitionRow[];
  totals: RecognitionTotals;
  nextUnlock: NextUnlock | null;
}

type RawProjectRow = {
  project_id: string;
  project_name: string;
  project_slug: string;
  sales_recognised: string | null;
  sales_deferred: string | null;
  contracts_transferred: string | null;
  contracts_pending: string | null;
};

type RawStreamRow = {
  project_id: string;
  stream_recognised: string | null;
  stream_deferred: string | null;
  stream_currency: string | null;
};

type RawNextUnlockRow = {
  project_name: string;
  unit_code: string | null;
  contact_name: string | null;
  collected: string | null;
  total: string | null;
  status: string;
};

function big(v: string | null | undefined): bigint {
  if (v == null || v === "") return 0n;
  try {
    // Aggregates come back as numeric strings; strip any fractional part.
    return BigInt(v.split(".")[0]);
  } catch {
    return 0n;
  }
}

function int(v: string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Aggregates the recognised-vs-deferred view across all development
 * projects. Pure read; safe to call behind `safeQuery`.
 */
export async function getRevenueRecognitionView(): Promise<RecognitionView> {
  const db = requireDb();

  // 1. Sales / contract cash, split by AJB (notarial transfer) status.
  const salesRes = await db.execute<RawProjectRow>(sql`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.slug AS project_slug,
      COALESCE(SUM(
        CASE WHEN cg.status = 'completed' OR cg.completed_at IS NOT NULL
          THEN cm.paid_amount_usd_minor ELSE 0 END
      ), 0)::text AS sales_recognised,
      COALESCE(SUM(
        CASE WHEN cg.status = 'completed' OR cg.completed_at IS NOT NULL
          THEN 0 ELSE cm.paid_amount_usd_minor END
      ), 0)::text AS sales_deferred,
      COUNT(DISTINCT CASE
        WHEN cg.status = 'completed' OR cg.completed_at IS NOT NULL
          THEN cg.id END)::text AS contracts_transferred,
      COUNT(DISTINCT CASE
        WHEN cg.status = 'completed' OR cg.completed_at IS NOT NULL
          THEN NULL ELSE cg.id END)::text AS contracts_pending
    FROM projects p
    LEFT JOIN contract_groups cg ON cg.project_id = p.id
      AND cg.status <> 'cancelled'
    LEFT JOIN contract_milestones cm ON cm.contract_group_id = cg.id
    GROUP BY p.id, p.name, p.slug
  `);

  // 2. Operating-stream net, split by whether the period has closed.
  //    `stream_currency` picks the most-used currency per project so the
  //    table can show a single (non-mixed) currency label.
  const streamRes = await db.execute<RawStreamRow>(sql`
    SELECT
      project_id,
      COALESCE(SUM(
        CASE WHEN period_end <= CURRENT_DATE
          THEN COALESCE(net_revenue_minor, gross_revenue_minor - direct_costs_minor)
          ELSE 0 END
      ), 0)::text AS stream_recognised,
      COALESCE(SUM(
        CASE WHEN period_end <= CURRENT_DATE THEN 0
          ELSE COALESCE(net_revenue_minor, gross_revenue_minor - direct_costs_minor) END
      ), 0)::text AS stream_deferred,
      (
        SELECT currency FROM revenue_streams r2
        WHERE r2.project_id = r1.project_id
        GROUP BY currency
        ORDER BY COUNT(*) DESC, currency ASC
        LIMIT 1
      ) AS stream_currency
    FROM revenue_streams r1
    GROUP BY project_id
  `);

  // 3. Next unlock: the pre-transfer contract with the most cash already
  //    collected — i.e. the largest tranche waiting on its AJB.
  const nextRes = await db.execute<RawNextUnlockRow>(sql`
    SELECT
      p.name AS project_name,
      v.unit_code AS unit_code,
      c.full_name AS contact_name,
      COALESCE(SUM(cm.paid_amount_usd_minor), 0)::text AS collected,
      cg.total_contract_value_usd_minor::text AS total,
      cg.status AS status
    FROM contract_groups cg
    JOIN projects p ON p.id = cg.project_id
    LEFT JOIN villas v ON v.id = cg.villa_id
    LEFT JOIN contacts c ON c.id = cg.contact_id
    LEFT JOIN contract_milestones cm ON cm.contract_group_id = cg.id
    WHERE cg.status NOT IN ('cancelled', 'completed')
      AND cg.completed_at IS NULL
    GROUP BY p.name, v.unit_code, c.full_name,
             cg.total_contract_value_usd_minor, cg.status, cg.id
    ORDER BY COALESCE(SUM(cm.paid_amount_usd_minor), 0) DESC
    LIMIT 1
  `);

  const salesRows = rowsOf<RawProjectRow>(salesRes);
  const streamRows = rowsOf<RawStreamRow>(streamRes);
  const nextRows = rowsOf<RawNextUnlockRow>(nextRes);

  const streamByProject = new Map<string, RawStreamRow>();
  for (const r of streamRows) streamByProject.set(r.project_id, r);

  const projects: ProjectRecognitionRow[] = salesRows
    .map((r) => {
      const s = streamByProject.get(r.project_id);
      return {
        projectId: r.project_id,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        salesRecognisedUsdMinor: big(r.sales_recognised),
        salesDeferredUsdMinor: big(r.sales_deferred),
        contractsTransferred: int(r.contracts_transferred),
        contractsPending: int(r.contracts_pending),
        streamRecognisedMinor: big(s?.stream_recognised),
        streamDeferredMinor: big(s?.stream_deferred),
        streamCurrency: s?.stream_currency ?? "IDR",
      } satisfies ProjectRecognitionRow;
    })
    // Hide projects with no sales AND no operating revenue at all.
    .filter(
      (p) =>
        p.salesRecognisedUsdMinor !== 0n ||
        p.salesDeferredUsdMinor !== 0n ||
        p.streamRecognisedMinor !== 0n ||
        p.streamDeferredMinor !== 0n,
    )
    .sort((a, b) =>
      Number(
        b.salesRecognisedUsdMinor +
          b.salesDeferredUsdMinor -
          (a.salesRecognisedUsdMinor + a.salesDeferredUsdMinor),
      ),
    );

  // Pick a single stream currency for the totals strip: the most common
  // across the surfaced projects (predominantly IDR).
  const currencyVotes = new Map<string, number>();
  for (const p of projects) {
    if (p.streamRecognisedMinor !== 0n || p.streamDeferredMinor !== 0n) {
      currencyVotes.set(
        p.streamCurrency,
        (currencyVotes.get(p.streamCurrency) ?? 0) + 1,
      );
    }
  }
  let streamCurrency = "IDR";
  let topVotes = -1;
  for (const [cur, votes] of currencyVotes) {
    if (votes > topVotes) {
      topVotes = votes;
      streamCurrency = cur;
    }
  }

  const totals = projects.reduce<RecognitionTotals>(
    (acc, p) => {
      acc.salesRecognisedUsdMinor += p.salesRecognisedUsdMinor;
      acc.salesDeferredUsdMinor += p.salesDeferredUsdMinor;
      acc.contractsTransferred += p.contractsTransferred;
      acc.contractsPending += p.contractsPending;
      if (p.streamCurrency === streamCurrency) {
        acc.streamRecognisedMinor += p.streamRecognisedMinor;
        acc.streamDeferredMinor += p.streamDeferredMinor;
      }
      return acc;
    },
    {
      salesRecognisedUsdMinor: 0n,
      salesDeferredUsdMinor: 0n,
      streamRecognisedMinor: 0n,
      streamDeferredMinor: 0n,
      streamCurrency,
      contractsTransferred: 0,
      contractsPending: 0,
    },
  );

  const nu = nextRows[0];
  const nextUnlock: NextUnlock | null = nu
    ? {
        projectName: nu.project_name,
        villaUnitCode: nu.unit_code,
        contactName: nu.contact_name,
        collectedUsdMinor: big(nu.collected),
        totalContractUsdMinor: big(nu.total),
        status: nu.status,
      }
    : null;

  return { projects, totals, nextUnlock };
}
