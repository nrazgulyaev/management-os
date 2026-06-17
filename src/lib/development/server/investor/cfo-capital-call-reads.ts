import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  capitalCallAllocations,
  capitalCalls,
} from "@/lib/db/schema/capital-calls";
import { investors } from "@/lib/db/schema/investor-capital";
import { projects } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * W1B — CFO capital-calls list reader.
 *
 * De-mocks /development-os/cfo/capital-calls. Reads real rows from
 * `capital_calls` (the call-issuance event) joined to `projects` for the
 * label, and aggregates `capital_call_allocations` for received-to-date
 * + investor paid/total counts.
 *
 * Money note: the schema stores `total_usd` / `received_usd` as
 * numeric(14,2) in MAJOR USD. The CapitalCallCard wants MINOR units
 * (cents), so we convert with BigInt(Math.round(major * 100)) — the
 * same pattern as the sibling *-actions.ts files — then surface as
 * `number` for the card (its prop accepts bigint | number).
 *
 * Single-tenant: `projects` has no org column, so we read all calls.
 * `cancelled` calls are excluded from the CFO list (the card has no
 * cancelled state). Ordered by issuedAt desc (newest first).
 */

/** Card-facing status — mirrors CapitalCallCardProps["status"]. */
export type CfoCapitalCallStatus = "drafting" | "issued" | "partial" | "received";

export interface CfoCapitalCallRow {
  id: string;
  ref: string;
  projectLabel: string;
  totalUsdMinor: number;
  receivedUsdMinor: number;
  investorsPaid: number;
  investorsTotal: number;
  status: CfoCapitalCallStatus;
  /** ISO date (yyyy-mm-dd) the call was issued. */
  issuedAt: string;
}

/** numeric(14,2) USD string -> integer minor units (cents). */
function usdStringToMinor(value: string | null): number {
  if (!value) return 0;
  const major = Number(value);
  if (!Number.isFinite(major)) return 0;
  return Math.round(major * 100);
}

/**
 * Map the DB status enum (draft | issued | partial | received | cancelled)
 * to the card's status set. `draft` -> "drafting"; `cancelled` rows are
 * filtered before mapping, but we fall back to "drafting" defensively.
 */
function toCardStatus(dbStatus: string): CfoCapitalCallStatus {
  switch (dbStatus) {
    case "issued":
      return "issued";
    case "partial":
      return "partial";
    case "received":
      return "received";
    case "draft":
    default:
      return "drafting";
  }
}

export async function loadCfoCapitalCalls(): Promise<CfoCapitalCallRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY 0158 — scope the CFO list to the caller's org.
  const organizationId = await requireOrgId();

  // One row per call with the project label. Allocation aggregates are
  // pulled separately and merged in-app to keep the join simple.
  const calls = await db
    .select({
      id: capitalCalls.id,
      ref: capitalCalls.ref,
      status: capitalCalls.status,
      totalUsd: capitalCalls.totalUsd,
      issuedAt: capitalCalls.issuedAt,
      projectName: projects.name,
    })
    .from(capitalCalls)
    .innerJoin(projects, eq(capitalCalls.projectId, projects.id))
    .where(
      and(
        eq(capitalCalls.organizationId, organizationId),
        sql`${capitalCalls.status} <> 'cancelled'`,
      ),
    )
    .orderBy(desc(capitalCalls.issuedAt));

  if (calls.length === 0) return [];

  // Per-call allocation aggregates: investor count, paid count, and the
  // sum of received_usd. A row counts as "paid" once received_at is set.
  const aggregates = await db
    .select({
      callId: capitalCallAllocations.callId,
      investorsTotal: sql<number>`COUNT(*)::int`,
      investorsPaid: sql<number>`COUNT(${capitalCallAllocations.receivedAt})::int`,
      receivedUsd: sql<string>`COALESCE(SUM(${capitalCallAllocations.receivedUsd}), 0)::text`,
    })
    .from(capitalCallAllocations)
    .groupBy(capitalCallAllocations.callId);

  const aggByCall = new Map(aggregates.map((a) => [a.callId, a]));

  return calls.map((c) => {
    const agg = aggByCall.get(c.id);
    return {
      id: c.id,
      ref: c.ref,
      projectLabel: c.projectName,
      totalUsdMinor: usdStringToMinor(c.totalUsd),
      receivedUsdMinor: usdStringToMinor(agg?.receivedUsd ?? null),
      investorsPaid: agg?.investorsPaid ?? 0,
      investorsTotal: agg?.investorsTotal ?? 0,
      status: toCardStatus(c.status),
      issuedAt: c.issuedAt.toISOString().slice(0, 10),
    };
  });
}

// ---------------------------------------------------------------------------
// Capital-call DETAIL reader — de-mocks /cfo/capital-calls/[id].
// ---------------------------------------------------------------------------

export interface CfoCapitalCallAllocation {
  id: string;
  investorId: string;
  investorName: string;
  expectedUsdMinor: number;
  receivedUsdMinor: number;
  /** ISO date (yyyy-mm-dd) the wire was received; null when unpaid. */
  receivedAt: string | null;
  wireRef: string | null;
  settled: boolean;
}

export interface CfoCapitalCallDetail {
  id: string;
  ref: string;
  projectLabel: string;
  status: CfoCapitalCallStatus;
  totalUsdMinor: number;
  receivedUsdMinor: number;
  issuedAt: string;
  dueAt: string;
  notes: string | null;
  investorsPaid: number;
  investorsTotal: number;
  allocations: CfoCapitalCallAllocation[];
}

/**
 * Single capital-call detail with its per-investor allocations.
 * Org-scoped via the call's organization_id (the allocation FK is to
 * investors, which carry no org column, so the org gate is the parent
 * call). Returns null for a genuinely missing/org-foreign id so the page
 * can `notFound()`.
 */
export async function loadCfoCapitalCallDetail(
  id: string,
): Promise<CfoCapitalCallDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();

  const [call] = await db
    .select({
      id: capitalCalls.id,
      ref: capitalCalls.ref,
      status: capitalCalls.status,
      totalUsd: capitalCalls.totalUsd,
      issuedAt: capitalCalls.issuedAt,
      dueAt: capitalCalls.dueAt,
      notes: capitalCalls.notes,
      projectName: projects.name,
    })
    .from(capitalCalls)
    .innerJoin(projects, eq(capitalCalls.projectId, projects.id))
    .where(
      and(
        eq(capitalCalls.id, id),
        eq(capitalCalls.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!call) return null;

  const allocRows = await db
    .select({
      id: capitalCallAllocations.id,
      investorId: capitalCallAllocations.investorId,
      investorName: investors.legalName,
      allocatedUsd: capitalCallAllocations.allocatedUsd,
      receivedUsd: capitalCallAllocations.receivedUsd,
      receivedAt: capitalCallAllocations.receivedAt,
      wireRef: capitalCallAllocations.wireRef,
    })
    .from(capitalCallAllocations)
    .innerJoin(investors, eq(capitalCallAllocations.investorId, investors.id))
    .where(eq(capitalCallAllocations.callId, call.id))
    .orderBy(asc(investors.legalName));

  let receivedTotal = 0;
  let paid = 0;
  const allocations: CfoCapitalCallAllocation[] = allocRows.map((a) => {
    const expected = usdStringToMinor(a.allocatedUsd);
    const received = usdStringToMinor(a.receivedUsd ?? null);
    receivedTotal += received;
    const settled = a.receivedAt != null && received >= expected;
    if (a.receivedAt != null) paid += 1;
    return {
      id: a.id,
      investorId: a.investorId,
      investorName: a.investorName,
      expectedUsdMinor: expected,
      receivedUsdMinor: received,
      receivedAt: a.receivedAt
        ? a.receivedAt.toISOString().slice(0, 10)
        : null,
      wireRef: a.wireRef,
      settled,
    };
  });

  return {
    id: call.id,
    ref: call.ref,
    projectLabel: call.projectName,
    status: toCardStatus(call.status),
    totalUsdMinor: usdStringToMinor(call.totalUsd),
    receivedUsdMinor: receivedTotal,
    issuedAt: call.issuedAt.toISOString().slice(0, 10),
    dueAt: call.dueAt.toISOString().slice(0, 10),
    notes: call.notes,
    investorsPaid: paid,
    investorsTotal: allocations.length,
    allocations,
  };
}
