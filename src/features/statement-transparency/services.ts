import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  statementSourceGroups,
  statementSourceGroupLines,
  statementReconciliationWarnings,
  statementExplanationSnapshots,
  type StatementSourceGroup,
  type StatementSourceGroupLine,
  type StatementReconciliationWarning,
  type StatementExplanationSnapshot,
} from "@/lib/db/schema/statement-transparency";
import { ownerStatements } from "@/lib/db/schema/finance";
import { requireOrgId } from "@/features/auth/require-org";
import {
  buildReconciliationStatus,
  buildReconciliationHealthScore,
  type ReconciliationStatusKey,
} from "./reconciliation-pure";

/**
 * Read services for the statement-transparency layer.  Mutations live
 * in `rebuild.ts` / `warnings.ts`.
 */

export async function listStatementSourceGroups(
  statementId: string,
): Promise<StatementSourceGroup[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — statement_source_groups carries organization_id.
  const orgId = await requireOrgId();
  return db
    .select()
    .from(statementSourceGroups)
    .where(
      and(
        eq(statementSourceGroups.ownerStatementId, statementId),
        eq(statementSourceGroups.organizationId, orgId),
      ),
    )
    .orderBy(statementSourceGroups.sortOrder);
}

export async function listStatementSourceGroupLines(
  statementId: string,
): Promise<StatementSourceGroupLine[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — statement_source_group_lines carries organization_id.
  const orgId = await requireOrgId();
  return db
    .select()
    .from(statementSourceGroupLines)
    .where(
      and(
        eq(statementSourceGroupLines.ownerStatementId, statementId),
        eq(statementSourceGroupLines.organizationId, orgId),
      ),
    );
}

export interface ListWarningsOpts {
  status?: "open" | "acknowledged" | "resolved" | "dismissed";
  ownerVisibleOnly?: boolean;
  severity?: "info" | "warning" | "critical";
}

export async function listStatementReconciliationWarnings(
  statementId: string | null,
  opts: ListWarningsOpts = {},
): Promise<StatementReconciliationWarning[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — statement_reconciliation_warnings carries organization_id.
  // Push the org predicate unconditionally (uniform fix): when statementId is
  // null this is the only org anchor; when present it is belt-and-braces.
  const orgId = await requireOrgId();
  const conditions = [] as ReturnType<typeof eq>[];
  conditions.push(eq(statementReconciliationWarnings.organizationId, orgId));
  if (statementId) {
    conditions.push(
      eq(statementReconciliationWarnings.ownerStatementId, statementId),
    );
  }
  if (opts.status) {
    conditions.push(eq(statementReconciliationWarnings.status, opts.status));
  }
  if (opts.severity) {
    conditions.push(
      eq(statementReconciliationWarnings.severity, opts.severity),
    );
  }
  if (opts.ownerVisibleOnly) {
    conditions.push(eq(statementReconciliationWarnings.ownerVisible, true));
  }
  return db
    .select()
    .from(statementReconciliationWarnings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(statementReconciliationWarnings.detectedAt));
}

export async function getStatementExplanationSnapshot(
  statementId: string,
): Promise<StatementExplanationSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY-FINANCE — statement_explanation_snapshots carries organization_id.
  const orgId = await requireOrgId();
  const [row] = await db
    .select()
    .from(statementExplanationSnapshots)
    .where(
      and(
        eq(statementExplanationSnapshots.ownerStatementId, statementId),
        eq(statementExplanationSnapshots.organizationId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// -----------------------------------------------------------------------------
// Convenience aggregates for admin dashboards
// -----------------------------------------------------------------------------

export interface AdminTransparencyStatementRow {
  id: string;
  statementCode: string;
  ownerId: string;
  ownerLabel: string | null;
  villaCode: string | null;
  periodLabel: string;
  status: string;
  currency: string;
  groupCount: number;
  warningCount: number;
  criticalCount: number;
  openWarningCount: number;
  reconciliationStatus: ReconciliationStatusKey;
  hasExplanationSnapshot: boolean;
  lastGeneratedAt: string | null;
}

export async function listTransparencyStatementRows(opts?: {
  limit?: number;
  ownerId?: string;
  status?: ("draft" | "issued" | "approved" | "paid" | "voided")[];
}): Promise<AdminTransparencyStatementRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — always org-scope the base owner_statements scan. The
  // downstream inArray(ids) fan-outs then only touch this org's children.
  const organizationId = await requireOrgId();
  const where = and(
    eq(ownerStatements.organizationId, organizationId),
    opts?.ownerId ? eq(ownerStatements.ownerId, opts.ownerId) : undefined,
  );
  const stmts = await db
    .select({
      id: ownerStatements.id,
      statementCode: ownerStatements.statementCode,
      ownerId: ownerStatements.ownerId,
      currency: ownerStatements.currency,
      status: ownerStatements.status,
      villaId: ownerStatements.villaId,
    })
    .from(ownerStatements)
    .where(where)
    .orderBy(desc(ownerStatements.createdAt))
    .limit(opts?.limit ?? 200);
  if (stmts.length === 0) return [];
  const ids = stmts.map((s) => s.id);
  const groups = await db
    .select({
      ownerStatementId: statementSourceGroups.ownerStatementId,
      id: statementSourceGroups.id,
    })
    .from(statementSourceGroups)
    .where(inArray(statementSourceGroups.ownerStatementId, ids));
  const warnings = await db
    .select({
      ownerStatementId: statementReconciliationWarnings.ownerStatementId,
      severity: statementReconciliationWarnings.severity,
      status: statementReconciliationWarnings.status,
    })
    .from(statementReconciliationWarnings)
    .where(inArray(statementReconciliationWarnings.ownerStatementId, ids));
  const snaps = await db
    .select({
      ownerStatementId: statementExplanationSnapshots.ownerStatementId,
      generatedAt: statementExplanationSnapshots.generatedAt,
    })
    .from(statementExplanationSnapshots)
    .where(inArray(statementExplanationSnapshots.ownerStatementId, ids));

  const groupCountByStatement = new Map<string, number>();
  for (const g of groups) {
    if (!g.ownerStatementId) continue;
    groupCountByStatement.set(
      g.ownerStatementId,
      (groupCountByStatement.get(g.ownerStatementId) ?? 0) + 1,
    );
  }
  const warningsByStatement = new Map<
    string,
    { severity: "info" | "warning" | "critical"; status: "open" | "acknowledged" | "resolved" | "dismissed" }[]
  >();
  for (const w of warnings) {
    if (!w.ownerStatementId) continue;
    const arr = warningsByStatement.get(w.ownerStatementId) ?? [];
    arr.push({
      severity: w.severity as "info" | "warning" | "critical",
      status: w.status as "open" | "acknowledged" | "resolved" | "dismissed",
    });
    warningsByStatement.set(w.ownerStatementId, arr);
  }
  const snapByStatement = new Map<string, string | null>();
  for (const s of snaps) {
    snapByStatement.set(
      s.ownerStatementId,
      s.generatedAt instanceof Date ? s.generatedAt.toISOString() : null,
    );
  }
  // Status filter applied here (after join because Drizzle inArray on
  // a nullable column gets noisy).
  const filterSet = opts?.status ? new Set<string>(opts.status) : null;
  return stmts
    .filter((s) => !filterSet || filterSet.has(s.status))
    .map((s) => {
      const ws = warningsByStatement.get(s.id) ?? [];
      const open = ws.filter((w) => w.status === "open");
      const recon = buildReconciliationStatus(open);
      const critical = open.filter((w) => w.severity === "critical").length;
      return {
        id: s.id,
        statementCode: s.statementCode,
        ownerId: s.ownerId,
        ownerLabel: null,
        villaCode: null,
        periodLabel: "",
        status: s.status,
        currency: s.currency,
        groupCount: groupCountByStatement.get(s.id) ?? 0,
        warningCount: ws.filter((w) => w.status === "open").length,
        criticalCount: critical,
        openWarningCount: open.length,
        reconciliationStatus: recon,
        hasExplanationSnapshot: snapByStatement.has(s.id),
        lastGeneratedAt: snapByStatement.get(s.id) ?? null,
      };
    });
}

export async function getTransparencyHubMetrics(): Promise<{
  totalStatements: number;
  statementsWithSnapshot: number;
  statementsMissingSnapshot: number;
  openWarningTotal: number;
  criticalWarningTotal: number;
  lastRebuildAt: string | null;
}> {
  const db = getDb();
  if (!db) {
    return {
      totalStatements: 0,
      statementsWithSnapshot: 0,
      statementsMissingSnapshot: 0,
      openWarningTotal: 0,
      criticalWarningTotal: 0,
      lastRebuildAt: null,
    };
  }
  // TENANCY-FINANCE — all three tables carry organization_id; scope each leg so
  // the hub counts only the caller's tenant (was a tenant-wide crash/leak).
  const organizationId = await requireOrgId();
  const allStmts = await db
    .select({ id: ownerStatements.id })
    .from(ownerStatements)
    .where(eq(ownerStatements.organizationId, organizationId));
  const totalStatements = allStmts.length;
  const snapsRows = await db
    .select({
      id: statementExplanationSnapshots.id,
      generatedAt: statementExplanationSnapshots.generatedAt,
    })
    .from(statementExplanationSnapshots)
    .where(eq(statementExplanationSnapshots.organizationId, organizationId))
    .orderBy(desc(statementExplanationSnapshots.generatedAt))
    .limit(500);
  const lastRebuildAt =
    snapsRows[0]?.generatedAt instanceof Date
      ? snapsRows[0].generatedAt.toISOString()
      : null;
  const statementsWithSnapshot = snapsRows.length;
  const openWarnings = await db
    .select({
      severity: statementReconciliationWarnings.severity,
    })
    .from(statementReconciliationWarnings)
    .where(
      and(
        eq(statementReconciliationWarnings.status, "open"),
        eq(statementReconciliationWarnings.organizationId, organizationId),
      ),
    );
  return {
    totalStatements,
    statementsWithSnapshot,
    statementsMissingSnapshot: Math.max(
      0,
      totalStatements - statementsWithSnapshot,
    ),
    openWarningTotal: openWarnings.length,
    criticalWarningTotal: openWarnings.filter((w) => w.severity === "critical")
      .length,
    lastRebuildAt,
  };
}

export async function getStatementReconciliationStatus(
  statementId: string,
): Promise<{
  status: ReconciliationStatusKey;
  healthScore: number;
  open: number;
  warning: number;
  critical: number;
}> {
  const ws = await listStatementReconciliationWarnings(statementId, {
    status: "open",
  });
  const lite = ws.map((w) => ({
    severity: w.severity as "info" | "warning" | "critical",
    status: w.status as "open" | "acknowledged" | "resolved" | "dismissed",
  }));
  return {
    status: buildReconciliationStatus(lite),
    healthScore: buildReconciliationHealthScore(lite),
    open: lite.length,
    warning: lite.filter((w) => w.severity === "warning").length,
    critical: lite.filter((w) => w.severity === "critical").length,
  };
}

// -----------------------------------------------------------------------------
// Linked activity for the owner statement detail page
// -----------------------------------------------------------------------------

export interface OwnerLinkedActivityRow {
  id: string;
  bookingSummaryId: string;
  ownerLabel: string;
  publicStatus: string;
  checkIn: string;
  checkOut: string;
  ownerRevenueMinor: bigint | null;
  currency: string | null;
  href: string;
}

/**
 * Pure SQL: list owner-booking summaries linked to a statement.  These
 * are the rows P108 wrote with `statement_id` pointing here; we never
 * expose source IDs other than the summary's own UI route.
 */
export async function listLinkedActivityForStatement(
  statementId: string,
): Promise<OwnerLinkedActivityRow[]> {
  const db = getDb();
  if (!db) return [];
  // Lazy import to avoid circular references.
  const { ownerBookingSummaries } = await import(
    "@/lib/db/schema/owner-bookings"
  );
  const rows = await db
    .select({
      id: ownerBookingSummaries.id,
      ownerLabel: ownerBookingSummaries.ownerLabel,
      publicStatus: ownerBookingSummaries.publicStatus,
      checkIn: ownerBookingSummaries.checkIn,
      checkOut: ownerBookingSummaries.checkOut,
      ownerRevenueMinor: ownerBookingSummaries.ownerRevenueMinor,
      currency: ownerBookingSummaries.currency,
      ownerVisible: ownerBookingSummaries.ownerVisible,
    })
    .from(ownerBookingSummaries)
    .where(eq(ownerBookingSummaries.statementId, statementId))
    .limit(200);
  return rows
    .filter((r) => r.ownerVisible)
    .map((r) => ({
      id: r.id,
      bookingSummaryId: r.id,
      ownerLabel: r.ownerLabel,
      publicStatus: r.publicStatus,
      checkIn: r.checkIn as unknown as string,
      checkOut: r.checkOut as unknown as string,
      ownerRevenueMinor: r.ownerRevenueMinor,
      currency: r.currency,
      href: `/owner/bookings/${r.id}`,
    }));
}
