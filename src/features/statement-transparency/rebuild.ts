import "server-only";

import { and, between, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  ownerStatements,
  statementLines,
  revenueLines,
  statementPeriods,
  type OwnerStatement,
} from "@/lib/db/schema/finance";
import { bookingChannels, bookings } from "@/lib/db/schema/bookings";
import { directBookingFinanceLinks } from "@/lib/db/schema/direct-booking-finance";
import { ownerStayFinanceLinks } from "@/lib/db/schema/owner-stay-finance";
import { guestServiceFinanceLinks } from "@/lib/db/schema/guest-services";
import { serviceFulfilmentFinanceLinks } from "@/lib/db/schema/service-fulfilment";
import {
  statementSourceGroups,
  statementSourceGroupLines,
  statementReconciliationWarnings,
  statementExplanationSnapshots,
} from "@/lib/db/schema/statement-transparency";
import {
  buildStatementSourceGroups,
  buildStatementGroupLines,
  type ClassificationContext,
  type StatementLineInput,
} from "./grouping-pure";
import { buildStatementExplanationSnapshot } from "./explanation-pure";
import {
  detectStatementWarnings,
  type WarningCandidate,
} from "./reconciliation-pure";
import { recordAuditEvent } from "@/features/audit/services";

/**
 * Rebuild the transparency layer for a single statement, idempotently.
 *
 * Order:
 *   1. Load statement + statement_lines.
 *   2. Load source context (revenue_lines, channels, finance bridges).
 *   3. Wipe existing groups / group_lines / explanation snapshot for
 *      this statement.
 *   4. Insert new groups / group_lines.
 *   5. Detect warnings + upsert by `(warningType, sourceTable, sourceId)`
 *      while `status = 'open'`.
 *   6. Insert explanation snapshot.
 *   7. Audit log.
 */

export interface RebuildOutcome {
  statementId: string;
  groupsInserted: number;
  groupLinesInserted: number;
  warningsInserted: number;
  warningsSkipped: number;
  explanationInserted: boolean;
}

export async function rebuildStatementTransparency(
  statementId: string,
  actorUserId: string | null = null,
  /**
   * TENANCY (write-flow IDOR): caller org. This helper is shared with the
   * bulk/cron sweeps (rebuildAll / forOwner), so scoping is opt-in: when a
   * request action passes the org, a cross-org statementId resolves to nothing
   * (and nothing is wiped/rebuilt). owner_statements.organizationId is NOT
   * NULL so a strict equality is safe here.
   */
  organizationId: string | null = null,
): Promise<RebuildOutcome> {
  const db = getDb();
  const empty: RebuildOutcome = {
    statementId,
    groupsInserted: 0,
    groupLinesInserted: 0,
    warningsInserted: 0,
    warningsSkipped: 0,
    explanationInserted: false,
  };
  if (!db) return empty;

  const [statement] = await db
    .select()
    .from(ownerStatements)
    .where(
      organizationId
        ? and(
            eq(ownerStatements.id, statementId),
            eq(ownerStatements.organizationId, organizationId),
          )
        : eq(ownerStatements.id, statementId),
    )
    .limit(1);
  if (!statement) return empty;

  const lines = await db
    .select()
    .from(statementLines)
    .where(eq(statementLines.statementId, statementId))
    .orderBy(statementLines.sortOrder);

  // ---------------------------------------------------------------------------
  // Source context lookup — we only need the revenue source / type / channel
  // and the finance-link sets so the classifier can be deterministic.
  // ---------------------------------------------------------------------------
  const revenueSourceIds = lines
    .filter((l) => l.sourceTable === "revenue_lines" && l.sourceId !== null)
    .map((l) => l.sourceId as string);

  const ctx = await loadClassificationContext(revenueSourceIds);

  const lineInputs: StatementLineInput[] = lines.map((l) => ({
    id: l.id,
    lineType: l.lineType as StatementLineInput["lineType"],
    category: l.category,
    description: l.description,
    amountMinor: l.amountMinor,
    currency: l.currency,
    ownerVisible: l.ownerVisible,
    sortOrder: l.sortOrder,
    sourceTable: l.sourceTable ?? null,
    sourceId: l.sourceId ?? null,
  }));

  const groups = buildStatementSourceGroups(lineInputs, ctx);
  const bridgeRows = buildStatementGroupLines(lineInputs, groups);

  // ---------------------------------------------------------------------------
  // Wipe + reinsert.  The transparency layer is a derived view —
  // never a system of record.
  // ---------------------------------------------------------------------------
  await db
    .delete(statementSourceGroupLines)
    .where(eq(statementSourceGroupLines.ownerStatementId, statementId));
  await db
    .delete(statementSourceGroups)
    .where(eq(statementSourceGroups.ownerStatementId, statementId));
  await db
    .delete(statementExplanationSnapshots)
    .where(eq(statementExplanationSnapshots.ownerStatementId, statementId));

  let groupsInserted = 0;
  let groupLinesInserted = 0;
  // Map groupKey → groupId, keyed by `groupKey|currency` to match the
  // unique index.
  const groupIdByKey = new Map<string, string>();
  for (const g of groups) {
    const [row] = await db
      .insert(statementSourceGroups)
      .values({
        // TENANCY-FINANCE-DOCS — copy the parent statement's org.
        organizationId: statement.organizationId,
        ownerStatementId: statementId,
        ownerId: statement.ownerId,
        villaId: statement.villaId,
        projectId: statement.projectId,
        groupKey: g.groupKey,
        groupLabel: g.groupLabel,
        groupDescription: g.groupDescription,
        grossAmountMinor: g.grossAmountMinor,
        deductionAmountMinor: g.deductionAmountMinor,
        netAmountMinor: g.netAmountMinor,
        currency: g.currency,
        lineCount: g.lineCount,
        sortOrder: g.sortOrder,
        ownerVisible: g.ownerVisible,
      })
      .returning({ id: statementSourceGroups.id });
    groupsInserted += 1;
    if (row) {
      groupIdByKey.set(`${g.groupKey}|${g.currency}`, row.id);
    }
  }
  // Insert bridge rows — we need to look up the right groupId by
  // (groupKey, currency).
  const lineCurrencyById = new Map<string, string>();
  for (const l of lineInputs) lineCurrencyById.set(l.id, l.currency);
  for (const bridge of bridgeRows) {
    const cur = lineCurrencyById.get(bridge.statementLineId) ?? statement.currency;
    const groupId = groupIdByKey.get(`${bridge.groupKey}|${cur}`);
    if (!groupId) continue;
    await db.insert(statementSourceGroupLines).values({
      // TENANCY-FINANCE-DOCS — copy the parent statement's org.
      organizationId: statement.organizationId,
      statementSourceGroupId: groupId,
      ownerStatementId: statementId,
      statementLineId: bridge.statementLineId,
      ownerId: statement.ownerId,
      groupKey: bridge.groupKey,
      ownerVisibleLabel: bridge.ownerVisibleLabel,
      internalSourceTable: bridge.internalSourceTable,
      internalSourceId: bridge.internalSourceId,
      sourceTraceStatus: bridge.sourceTraceStatus,
    });
    groupLinesInserted += 1;
  }

  // ---------------------------------------------------------------------------
  // Detect warnings.  We use the statement period to look for
  // pending bridges that *should* have produced revenue/expense rows
  // for this statement.
  // ---------------------------------------------------------------------------
  const period = statement.periodId
    ? await db
        .select()
        .from(statementPeriods)
        .where(eq(statementPeriods.id, statement.periodId))
        .limit(1)
    : [];
  const periodStart = period[0]?.periodStart as unknown as string | undefined;
  const periodEnd = period[0]?.periodEnd as unknown as string | undefined;

  const detectInput = await loadWarningInputs({
    statementId,
    statement,
    periodStart: periodStart ?? null,
    periodEnd: periodEnd ?? null,
    statementLineRows: lineInputs,
  });
  const candidates = detectStatementWarnings(detectInput);

  const { inserted: warningsInserted, skipped: warningsSkipped } =
    await upsertOpenWarnings(statementId, statement, candidates);

  // ---------------------------------------------------------------------------
  // Explanation snapshot.
  // ---------------------------------------------------------------------------
  const warningCounts = candidates.reduce(
    (acc, c) => {
      acc[c.severity] += 1;
      return acc;
    },
    { info: 0, warning: 0, critical: 0 } as {
      info: number;
      warning: number;
      critical: number;
    },
  );
  const snapshot = buildStatementExplanationSnapshot({
    statement: {
      statementCode: statement.statementCode,
      periodLabel: period[0]?.label ?? statement.statementCode,
      currency: statement.currency,
      grossRevenueMinor: statement.grossRevenueMinor,
      totalFeesMinor: statement.totalFeesMinor,
      totalExpensesMinor: statement.totalExpensesMinor,
      totalTaxesMinor: statement.totalTaxesMinor,
      totalReservesMinor: statement.totalReservesMinor,
      managementFeeMinor: statement.managementFeeMinor,
      netPayoutMinor: statement.netPayoutMinor,
      status: statement.status,
    },
    groups,
    warningCounts,
  });
  await db.insert(statementExplanationSnapshots).values({
    // TENANCY-FINANCE-DOCS — copy the parent statement's org.
    organizationId: statement.organizationId,
    ownerStatementId: statementId,
    ownerId: statement.ownerId,
    headline: snapshot.headline,
    summary: snapshot.summary,
    bulletPoints: snapshot.bulletPoints,
    payoutExplanation: snapshot.payoutExplanation,
    revenueExplanation: snapshot.revenueExplanation,
    deductionExplanation: snapshot.deductionExplanation,
    reserveExplanation: snapshot.reserveExplanation,
    warningExplanation: snapshot.warningExplanation,
    currency: snapshot.currency,
    totalRevenueMinor: snapshot.totalRevenueMinor,
    totalDeductionsMinor: snapshot.totalDeductionsMinor,
    netPayoutMinor: snapshot.netPayoutMinor,
  });

  await recordAuditEvent({
    actorUserId,
    action: "statement_transparency.rebuild",
    entityType: "owner_statement",
    entityId: statementId,
    after: {
      groupsInserted,
      groupLinesInserted,
      warningsInserted,
      warningsSkipped,
    },
  });

  return {
    statementId,
    groupsInserted,
    groupLinesInserted,
    warningsInserted,
    warningsSkipped,
    explanationInserted: true,
  };
}

// -----------------------------------------------------------------------------
// Bulk rebuild
// -----------------------------------------------------------------------------

export interface BulkRebuildOpts {
  /** Period end ≥ today − N days. */
  withinDays?: number;
  /** Statement statuses to rebuild. */
  statuses?: ("draft" | "issued" | "approved" | "paid" | "voided")[];
}

const DEFAULT_BULK: Required<BulkRebuildOpts> = {
  withinDays: 120,
  statuses: ["draft", "issued", "approved"],
};

export async function rebuildAllStatementTransparency(
  opts: BulkRebuildOpts = {},
  actorUserId: string | null = null,
): Promise<{
  statementsProcessed: number;
  totalGroupsInserted: number;
  totalWarningsInserted: number;
}> {
  const db = getDb();
  if (!db)
    return {
      statementsProcessed: 0,
      totalGroupsInserted: 0,
      totalWarningsInserted: 0,
    };
  const merged = { ...DEFAULT_BULK, ...opts };
  const cutoff = new Date(
    Date.now() - merged.withinDays * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const periods = await db
    .select({ id: statementPeriods.id })
    .from(statementPeriods)
    .where(gte(statementPeriods.periodEnd, cutoff));
  const periodIds = periods.map((p) => p.id);
  let stmts: { id: string }[] = [];
  if (periodIds.length > 0) {
    stmts = await db
      .select({ id: ownerStatements.id })
      .from(ownerStatements)
      .where(
        and(
          inArray(ownerStatements.periodId, periodIds),
          inArray(ownerStatements.status, merged.statuses),
        ),
      );
  }
  let totalGroupsInserted = 0;
  let totalWarningsInserted = 0;
  for (const s of stmts) {
    const out = await rebuildStatementTransparency(s.id, actorUserId);
    totalGroupsInserted += out.groupsInserted;
    totalWarningsInserted += out.warningsInserted;
  }
  return {
    statementsProcessed: stmts.length,
    totalGroupsInserted,
    totalWarningsInserted,
  };
}

export async function rebuildStatementTransparencyForOwner(
  ownerId: string,
  actorUserId: string | null = null,
  /**
   * TENANCY (write-flow IDOR): caller org. When provided, only this org's
   * statements for the owner are rebuilt, and the org is threaded into each
   * per-statement rebuild. Null preserves legacy/cron behavior.
   */
  organizationId: string | null = null,
): Promise<{ statementsProcessed: number }> {
  const db = getDb();
  if (!db) return { statementsProcessed: 0 };
  const stmts = await db
    .select({ id: ownerStatements.id })
    .from(ownerStatements)
    .where(
      organizationId
        ? and(
            eq(ownerStatements.ownerId, ownerId),
            eq(ownerStatements.organizationId, organizationId),
          )
        : eq(ownerStatements.ownerId, ownerId),
    );
  for (const s of stmts) {
    await rebuildStatementTransparency(s.id, actorUserId, organizationId);
  }
  return { statementsProcessed: stmts.length };
}

// -----------------------------------------------------------------------------
// Source context loaders
// -----------------------------------------------------------------------------

async function loadClassificationContext(
  revenueLineIds: ReadonlyArray<string>,
): Promise<ClassificationContext> {
  const db = getDb();
  const ctx: ClassificationContext = {
    revenueSource: {},
    revenueType: {},
    channelKey: {},
    expenseType: {},
    directBookingSourceIds: new Set<string>(),
    ownerStaySourceIds: new Set<string>(),
    guestServiceSourceIds: new Set<string>(),
    serviceFulfilmentSourceIds: new Set<string>(),
  };
  if (!db || revenueLineIds.length === 0) return ctx;
  const ids = [...revenueLineIds];
  // Revenue source / revenue type + channel via the booking that
  // owns the revenue line.
  const rows = await db
    .select({
      id: revenueLines.id,
      bookingId: revenueLines.bookingId,
      source: revenueLines.source,
      revenueType: revenueLines.revenueType,
      channelKey: bookingChannels.key,
    })
    .from(revenueLines)
    .leftJoin(bookings, eq(bookings.id, revenueLines.bookingId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .where(inArray(revenueLines.id, ids));
  for (const r of rows) {
    ctx.revenueSource![r.id] = r.source ?? null;
    ctx.revenueType![r.id] = r.revenueType ?? null;
    ctx.channelKey![r.id] = r.channelKey ?? null;
  }
  // Direct-booking finance links → revenue line ids.
  const dbLinks = await db
    .select({ revenueLineId: directBookingFinanceLinks.revenueLineId })
    .from(directBookingFinanceLinks)
    .where(inArray(directBookingFinanceLinks.revenueLineId, ids));
  for (const link of dbLinks) {
    if (link.revenueLineId) ctx.directBookingSourceIds!.add(link.revenueLineId);
  }
  // Guest-service finance links → revenue line ids.
  const gsLinks = await db
    .select({ revenueLineId: guestServiceFinanceLinks.revenueLineId })
    .from(guestServiceFinanceLinks)
    .where(inArray(guestServiceFinanceLinks.revenueLineId, ids));
  for (const link of gsLinks) {
    if (link.revenueLineId) ctx.guestServiceSourceIds!.add(link.revenueLineId);
  }
  // Owner-stay finance links → compensation revenue line ids.
  const osLinks = await db
    .select({ revenueLineId: ownerStayFinanceLinks.compensationRevenueLineId })
    .from(ownerStayFinanceLinks)
    .where(
      inArray(ownerStayFinanceLinks.compensationRevenueLineId, ids),
    );
  for (const link of osLinks) {
    if (link.revenueLineId) ctx.ownerStaySourceIds!.add(link.revenueLineId);
  }
  // Service-fulfilment finance links → revenue + expense line ids.
  const sfLinks = await db
    .select({
      revenueLineId: serviceFulfilmentFinanceLinks.revenueLineId,
      expenseLineId: serviceFulfilmentFinanceLinks.expenseLineId,
    })
    .from(serviceFulfilmentFinanceLinks);
  for (const link of sfLinks) {
    if (link.revenueLineId)
      ctx.serviceFulfilmentSourceIds!.add(link.revenueLineId);
    if (link.expenseLineId)
      ctx.serviceFulfilmentSourceIds!.add(link.expenseLineId);
  }
  return ctx;
}

// -----------------------------------------------------------------------------
// Warning inputs
// -----------------------------------------------------------------------------

interface WarningLoadInput {
  statementId: string;
  statement: OwnerStatement;
  periodStart: string | null;
  periodEnd: string | null;
  statementLineRows: ReadonlyArray<StatementLineInput>;
}

async function loadWarningInputs(input: WarningLoadInput) {
  const db = getDb();
  const { statement, periodStart, periodEnd } = input;
  const empty = {
    statement: {
      id: statement.id,
      status: statement.status,
      netPayoutMinor: statement.netPayoutMinor,
      currency: statement.currency,
      periodStart: periodStart ?? "",
      periodEnd: periodEnd ?? "",
      ownerId: statement.ownerId,
    },
    statementLines: input.statementLineRows.map((l) => ({
      id: l.id,
      currency: l.currency,
      sourceTable: l.sourceTable,
      sourceId: l.sourceId,
      lineType: l.lineType,
    })),
    pendingDirectBookings: [] as { id: string; sourceTable: string }[],
    pendingGuestServices: [] as { id: string; sourceTable: string }[],
    pendingOwnerStays: [] as { id: string; sourceTable: string }[],
    pendingServiceFulfilments: [] as { id: string; sourceTable: string }[],
    lockedPeriodSkipped: [] as { id: string; sourceTable: string }[],
  };
  if (!db) return empty;
  const dbLinks = await db
    .select({ id: directBookingFinanceLinks.id, status: directBookingFinanceLinks.status })
    .from(directBookingFinanceLinks)
    .where(
      eq(directBookingFinanceLinks.statementPeriodId, statement.periodId),
    );
  for (const link of dbLinks) {
    if (link.status === "pending") {
      empty.pendingDirectBookings.push({
        id: link.id,
        sourceTable: "direct_booking_finance_links",
      });
    } else if (link.status === "skipped_locked_period") {
      empty.lockedPeriodSkipped.push({
        id: link.id,
        sourceTable: "direct_booking_finance_links",
      });
    }
  }
  const gsLinks = await db
    .select({ id: guestServiceFinanceLinks.id, status: guestServiceFinanceLinks.status })
    .from(guestServiceFinanceLinks);
  for (const link of gsLinks) {
    if (link.status === "pending") {
      empty.pendingGuestServices.push({
        id: link.id,
        sourceTable: "guest_service_finance_links",
      });
    } else if (link.status === "skipped_locked_period") {
      empty.lockedPeriodSkipped.push({
        id: link.id,
        sourceTable: "guest_service_finance_links",
      });
    }
  }
  // Owner-stay bridges scoped to this statement period.
  const osLinks = await db
    .select({
      id: ownerStayFinanceLinks.id,
      bridgeStatus: ownerStayFinanceLinks.bridgeStatus,
    })
    .from(ownerStayFinanceLinks)
    .where(eq(ownerStayFinanceLinks.statementPeriodId, statement.periodId));
  for (const link of osLinks) {
    if (link.bridgeStatus === "pending") {
      empty.pendingOwnerStays.push({
        id: link.id,
        sourceTable: "owner_stay_finance_links",
      });
    } else if (link.bridgeStatus === "skipped_locked_period") {
      empty.lockedPeriodSkipped.push({
        id: link.id,
        sourceTable: "owner_stay_finance_links",
      });
    }
  }
  const sfLinks = await db
    .select({
      id: serviceFulfilmentFinanceLinks.id,
      status: serviceFulfilmentFinanceLinks.status,
    })
    .from(serviceFulfilmentFinanceLinks);
  for (const link of sfLinks) {
    if (link.status === "pending") {
      empty.pendingServiceFulfilments.push({
        id: link.id,
        sourceTable: "service_fulfilment_finance_links",
      });
    }
  }
  // Touch periodStart/periodEnd to keep the linter quiet — they're
  // currently informational only.
  void periodStart;
  void periodEnd;
  return empty;
}

// -----------------------------------------------------------------------------
// Warning upsert
// -----------------------------------------------------------------------------

async function upsertOpenWarnings(
  statementId: string,
  statement: OwnerStatement,
  candidates: ReadonlyArray<WarningCandidate>,
): Promise<{ inserted: number; skipped: number }> {
  const db = getDb();
  if (!db) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  let skipped = 0;
  for (const c of candidates) {
    try {
      await db.insert(statementReconciliationWarnings).values({
        // TENANCY-FINANCE-DOCS — copy the parent statement's org.
        organizationId: statement.organizationId,
        ownerStatementId: statementId,
        ownerId: statement.ownerId,
        villaId: statement.villaId,
        projectId: statement.projectId,
        warningType: c.warningType,
        severity: c.severity,
        ownerVisible: c.ownerVisible,
        ownerTitle: c.ownerTitle,
        ownerMessage: c.ownerMessage,
        internalTitle: c.internalTitle,
        internalMessage: c.internalMessage,
        sourceTable: c.sourceTable,
        sourceId: c.sourceId,
      });
      inserted += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("statement_reconciliation_warnings_open_unique") ||
        msg.includes("unique")
      ) {
        skipped += 1;
        continue;
      }
      console.error("[transparency] warning upsert failed", err);
    }
  }
  return { inserted, skipped };
}

// Touch unused imports the typechecker would otherwise complain about.
export const __reserved = { between, lte };
