import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireInvestorSession } from "./session";

/**
 * W1c — LP-facing capital-call reads.
 *
 * Scoped to the calling investor's data via `requireInvestorSession()`
 * (Supabase auth → app_users → investors), mirroring the read pattern in
 * `./queries.ts`. Every query also filters by `investor_id` in the WHERE
 * clause (defense in depth alongside RLS).
 *
 * NOTE on money: `capital_calls.total_usd` and
 * `capital_call_allocations.allocated_usd / received_usd` are stored as
 * Postgres `numeric(14,2)` (decimal dollars), NOT bigint minor units like
 * the rest of investor-capital. To keep display consistent with the rest
 * of the portal (`formatUsdMinor`) we convert decimal-dollar strings to
 * bigint USD-minor at the boundary here. Conversion is exact for 2-dp
 * numerics. See followups.
 *
 * NOTE on join: per the live schema, `capital_call_allocations` references
 * `investors.id` directly (there is no `commitment_id` on the allocation),
 * so the LP scope is by `investor_id`, not by commitment. The call's
 * `project_id` is surfaced so each row can still be tied back to the LP's
 * commitment in that project on the page.
 */

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

/**
 * Convert a Postgres `numeric(_,2)` decimal-dollar string (e.g.
 * "800000.00" or "1234.5") to bigint USD-minor ("80000000", "123450").
 * Robust to missing/extra decimals; rounds half-up on the cents boundary.
 */
function decimalUsdToMinor(v: unknown): bigint {
  if (v === null || v === undefined) return 0n;
  const s = String(v).trim();
  if (s === "") return 0n;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = (neg ? s.slice(1) : s).split(".");
  const cents = (frac + "00").slice(0, 2);
  // Round on the 3rd decimal if present.
  const round = frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n;
  const minor = BigInt(whole || "0") * 100n + BigInt(cents || "0") + round;
  return neg ? -minor : minor;
}

export type LpCapitalCallStatus =
  | "draft"
  | "issued"
  | "partial"
  | "received"
  | "cancelled";

/** One capital-call allocation as the LP sees it (their slice only). */
export interface LpCapitalCallListItem {
  /** capital_call_allocations.id — used as the detail route param. */
  allocationId: string;
  callId: string;
  ref: string;
  kind: string;
  projectId: string;
  projectName: string | null;
  issuedAt: string;
  dueAt: string;
  /** Status of the parent call (draft|issued|partial|received|cancelled). */
  callStatus: LpCapitalCallStatus;
  /** This LP's pro-rata amount due, USD-minor. */
  allocatedUsdMinor: string;
  /** Amount this LP has wired so far, USD-minor (0 if unpaid). */
  receivedUsdMinor: string;
  receivedAt: string | null;
  wireRef: string | null;
  /** True when allocatedUsd is fully wired. */
  isPaid: boolean;
}

/**
 * All capital-call allocations addressed to the calling investor, newest
 * issuance first. Draft + cancelled calls are excluded — the LP only sees
 * a call once it is actually issued.
 */
export async function getMyCapitalCalls(): Promise<LpCapitalCallListItem[]> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT
      a.id              AS allocation_id,
      a.call_id         AS call_id,
      c.ref             AS ref,
      c.kind            AS kind,
      c.project_id      AS project_id,
      p.name            AS project_name,
      c.issued_at       AS issued_at,
      c.due_at          AS due_at,
      c.status          AS call_status,
      a.allocated_usd   AS allocated_usd,
      a.received_usd    AS received_usd,
      a.received_at     AS received_at,
      a.wire_ref        AS wire_ref
    FROM capital_call_allocations a
    JOIN capital_calls c ON c.id = a.call_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE a.investor_id = ${session.investorId}
      AND c.status <> 'draft'
      AND c.status <> 'cancelled'
    ORDER BY c.issued_at DESC, c.ref ASC
  `);

  return (rows as Record<string, unknown>[]).map((r) =>
    mapRow(r),
  );
}

/**
 * A single allocation (by allocation id), scoped to the calling investor.
 * Returns null when the allocation does not exist or is not theirs.
 */
export async function getMyCapitalCall(
  allocationId: string,
): Promise<LpCapitalCallListItem | null> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return null;

  const rows = await db.execute(sql`
    SELECT
      a.id              AS allocation_id,
      a.call_id         AS call_id,
      c.ref             AS ref,
      c.kind            AS kind,
      c.project_id      AS project_id,
      p.name            AS project_name,
      c.issued_at       AS issued_at,
      c.due_at          AS due_at,
      c.status          AS call_status,
      a.allocated_usd   AS allocated_usd,
      a.received_usd    AS received_usd,
      a.received_at     AS received_at,
      a.wire_ref        AS wire_ref
    FROM capital_call_allocations a
    JOIN capital_calls c ON c.id = a.call_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE a.id = ${allocationId}
      AND a.investor_id = ${session.investorId}
      AND c.status <> 'draft'
      AND c.status <> 'cancelled'
    LIMIT 1
  `);

  const r = (rows as Record<string, unknown>[])[0];
  return r ? mapRow(r) : null;
}

/**
 * Pro-rata context for the detail page: the call total and every
 * investor's slice (anonymised — the LP sees their own name but only the
 * count + percentages of the rest), so the LP understands how their slice
 * was derived. Only their own allocated/received figures are returned in
 * full; siblings are reduced to a share-percent.
 */
export interface LpCapitalCallBreakdown {
  callTotalUsdMinor: string;
  /** This LP's pro-rata share of the call, 0-100 with 2 dp. */
  mySharePercent: number;
  /** How many investors are on this call (including this LP). */
  investorCount: number;
  /** Sum of all received across the call, USD-minor. */
  callReceivedUsdMinor: string;
}

export async function getMyCapitalCallBreakdown(
  callId: string,
): Promise<LpCapitalCallBreakdown | null> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return null;

  // Ownership check + breakdown in one pass. The investor must have an
  // allocation on this call to see any of it.
  const rows = await db.execute(sql`
    SELECT
      c.total_usd AS call_total_usd,
      COALESCE(SUM(a.received_usd), 0) AS call_received_usd,
      COUNT(*)::int AS investor_count,
      COALESCE(
        MAX(a.allocated_usd) FILTER (WHERE a.investor_id = ${session.investorId}),
        0
      ) AS my_allocated_usd,
      BOOL_OR(a.investor_id = ${session.investorId}) AS is_mine
    FROM capital_calls c
    JOIN capital_call_allocations a ON a.call_id = c.id
    WHERE c.id = ${callId}
      AND c.status <> 'draft'
      AND c.status <> 'cancelled'
    GROUP BY c.id, c.total_usd
    LIMIT 1
  `);

  const r = (rows as Record<string, unknown>[])[0];
  if (!r || r.is_mine !== true) return null;

  const total = decimalUsdToMinor(r.call_total_usd);
  const mine = decimalUsdToMinor(r.my_allocated_usd);
  const sharePercent =
    total > 0n ? Number((mine * 10000n) / total) / 100 : 0;

  return {
    callTotalUsdMinor: total.toString(),
    mySharePercent: sharePercent,
    investorCount: Number(r.investor_count ?? 0),
    callReceivedUsdMinor: decimalUsdToMinor(r.call_received_usd).toString(),
  };
}

function mapRow(r: Record<string, unknown>): LpCapitalCallListItem {
  const allocated = decimalUsdToMinor(r.allocated_usd);
  const received = decimalUsdToMinor(r.received_usd);
  return {
    allocationId: String(r.allocation_id),
    callId: String(r.call_id),
    ref: String(r.ref),
    kind: toStr(r.kind),
    projectId: String(r.project_id),
    projectName: r.project_name ? String(r.project_name) : null,
    issuedAt: new Date(r.issued_at as string).toISOString(),
    dueAt: new Date(r.due_at as string).toISOString(),
    callStatus: r.call_status as LpCapitalCallStatus,
    allocatedUsdMinor: allocated.toString(),
    receivedUsdMinor: received.toString(),
    receivedAt: r.received_at
      ? new Date(r.received_at as string).toISOString()
      : null,
    wireRef: r.wire_ref ? String(r.wire_ref) : null,
    isPaid: received >= allocated && allocated > 0n,
  };
}
