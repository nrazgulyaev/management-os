import "server-only";

import { and, eq, gte, lte, inArray, lt, gt, isNull, or } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db/client";
import {
  expenseAllocations,
  expenseLines,
  feeLines,
  managementFeeLines,
  managementFeeRules,
  ownerStatements,
  reserveMovements,
  revenueLines,
  statementLines,
  statementPeriods,
  taxLines,
} from "@/lib/db/schema/finance";
import { bookings } from "@/lib/db/schema/bookings";
import { villas, projects } from "@/lib/db/schema/projects";
import { owners, ownershipShares } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { calculateRoomMetrics, nightsForBooking } from "./calculations";
import {
  allocateBySharePercent,
  type ShareAllocation,
  type ShareInput,
} from "./allocation";
import { percentOfMinor } from "@/lib/money";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export type GenerateInput = {
  ownerId: string;
  periodId: string;
  /** Restrict to a single villa for individual / hybrid scenarios. */
  villaId?: string | null;
  /** Restrict pool calculation to a single project. */
  projectId?: string | null;
  /** Statement currency. Default USD. */
  currency?: string;
  actorUserId?: string | null;
  /**
   * TENANCY (write-flow audit): the caller's organization. Stamped on the
   * owner_statements row so the lifecycle actions (setStatementStatusAction)
   * — which org-filter their lookup — can actually find the statement. A
   * statement created without this is invisible to Issue/Approve/Mark-paid.
   */
  organizationId: string;
};

export type GenerateOutput =
  | { ok: true; statementId: string; statementCode: string; created: boolean }
  | { ok: false; reason: string };

/**
 * Deterministic owner-statement generator.
 *
 * - Loads ownership_shares active during [period_start, period_end].
 * - Picks the management model for this owner inside the period:
 *     * any villa-direct share with the share's `model` → "individual" or "hybrid"
 *     * pool-only shares → "pooled"
 *     * mix → "hybrid" (villa lines weighted by villa share, shared costs by pool share)
 * - Pulls revenue / fee / expense / tax / reserve / management-fee rows for the
 *   relevant scope and period.
 * - Allocates by share percent.
 * - Creates or updates a draft owner_statement plus its statement_lines.
 * - Refuses to overwrite a statement in `issued | approved | paid` unless caller
 *   voids it first.
 */
export async function generateOwnerStatement(input: GenerateInput): Promise<GenerateOutput> {
  const db = getDb();
  if (!db) return { ok: false, reason: "db_missing" };

  const [period] = await db
    .select()
    .from(statementPeriods)
    .where(eq(statementPeriods.id, input.periodId))
    .limit(1);
  if (!period) return { ok: false, reason: "period_not_found" };

  // TENANCY (write-flow IDOR): the owner is the tenant boundary for a
  // statement. owners.organizationId is a nullable backfill column (migration
  // 0173): NULL = pre-threading row (allowed); set-but-mismatched = a foreign
  // org's owner → reject with the same opaque reason as "not found" so the two
  // cases are indistinguishable to a probing caller.
  const [owner] = await db
    .select()
    .from(owners)
    .where(eq(owners.id, input.ownerId))
    .limit(1);
  if (
    !owner ||
    (owner.organizationId && owner.organizationId !== input.organizationId)
  ) {
    return { ok: false, reason: "owner_not_found" };
  }

  const currency = input.currency ?? "USD";

  // -----------------------------------------------------------------
  // 1) Resolve ownership shares active during the period
  // -----------------------------------------------------------------
  const periodStart = period.periodStart;
  const periodEnd = period.periodEnd;

  // TENANCY/VISIBILITY: the owner-portal statements list filters
  // `period_month IS NOT NULL` (and orders by it), so a statement created
  // without it is INVISIBLE to the owner. The sibling generator
  // (statement-generation.ts) stores a first-of-month date anchor; mirror
  // that here by truncating the period's start date to its first-of-month.
  const periodMonth = `${periodStart.slice(0, 7)}-01`;

  const sharesRaw = await db
    .select({
      s: ownershipShares,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(ownershipShares)
    .leftJoin(villas, eq(villas.id, ownershipShares.villaId))
    .leftJoin(projects, eq(projects.id, ownershipShares.projectId))
    .where(
      and(
        eq(ownershipShares.ownerId, input.ownerId),
        eq(ownershipShares.status, "active"),
        lte(ownershipShares.startsOn, periodEnd),
        or(isNull(ownershipShares.endsOn), gte(ownershipShares.endsOn, periodStart)),
        // TENANCY (write-flow IDOR): ownership_shares.organizationId is a
        // nullable backfill column (migration 0154, not query-threaded). Keep
        // NULL (pre-threading) rows so legacy statements still compute, but
        // exclude any share explicitly anchored to a different tenant.
        or(
          isNull(ownershipShares.organizationId),
          eq(ownershipShares.organizationId, input.organizationId),
        ),
      ),
    );

  if (sharesRaw.length === 0) {
    return { ok: false, reason: "no_active_shares" };
  }

  // Filter shares by optional villa/project scope.
  const shares = sharesRaw.filter((row) => {
    if (input.villaId && row.s.villaId !== input.villaId) return false;
    if (input.projectId && row.s.projectId !== input.projectId) return false;
    return true;
  });

  if (shares.length === 0) {
    return { ok: false, reason: "no_shares_in_scope" };
  }

  const villaShares = shares.filter((s) => s.s.villaId);
  const poolShares = shares.filter((s) => !s.s.villaId && s.s.projectId);

  const managementModel: "individual" | "pooled" | "hybrid" =
    villaShares.length > 0 && poolShares.length > 0
      ? "hybrid"
      : villaShares.length > 0
        ? villaShares[0].s.model === "hybrid"
          ? "hybrid"
          : "individual"
        : "pooled";

  // Choose the dominant villa / project for header purposes.
  const headlineVillaId = villaShares[0]?.s.villaId ?? null;
  const headlineProjectId =
    poolShares[0]?.s.projectId ??
    (villaShares[0]?.s.projectId ?? null);

  // -----------------------------------------------------------------
  // 2) Pull source rows for the period
  // -----------------------------------------------------------------
  const villaIds = villaShares.map((s) => s.s.villaId!).filter(Boolean) as string[];
  const projectIds = [...new Set(poolShares.map((s) => s.s.projectId!).filter(Boolean))] as string[];

  // Revenue: villa-attributed posted rows in period. Pool-only owners (no villa)
  // get their share of project revenue (via villas in the project).
  const revVilla = villaIds.length
    ? await db
        .select()
        .from(revenueLines)
        .where(
          and(
            eq(revenueLines.status, "posted"),
            inArray(revenueLines.villaId, villaIds),
            gte(revenueLines.serviceDate, periodStart),
            lte(revenueLines.serviceDate, periodEnd),
          ),
        )
    : [];

  const revPool = projectIds.length
    ? await db
        .select()
        .from(revenueLines)
        .where(
          and(
            eq(revenueLines.status, "posted"),
            inArray(revenueLines.projectId, projectIds),
            gte(revenueLines.serviceDate, periodStart),
            lte(revenueLines.serviceDate, periodEnd),
          ),
        )
    : [];

  const feesVilla = villaIds.length
    ? await db
        .select()
        .from(feeLines)
        .where(
          and(
            eq(feeLines.status, "posted"),
            inArray(feeLines.villaId, villaIds),
            gte(feeLines.feeDate, periodStart),
            lte(feeLines.feeDate, periodEnd),
          ),
        )
    : [];

  const feesPool = projectIds.length
    ? await db
        .select()
        .from(feeLines)
        .where(
          and(
            eq(feeLines.status, "posted"),
            inArray(feeLines.projectId, projectIds),
            gte(feeLines.feeDate, periodStart),
            lte(feeLines.feeDate, periodEnd),
          ),
        )
    : [];

  const expVilla = villaIds.length
    ? await db
        .select()
        .from(expenseLines)
        .where(
          and(
            eq(expenseLines.status, "posted"),
            inArray(expenseLines.villaId, villaIds),
            gte(expenseLines.expenseDate, periodStart),
            lte(expenseLines.expenseDate, periodEnd),
            eq(expenseLines.ownerChargeable, true),
          ),
        )
    : [];

  const expPoolShared = projectIds.length
    ? await db
        .select()
        .from(expenseLines)
        .where(
          and(
            eq(expenseLines.status, "posted"),
            inArray(expenseLines.projectId, projectIds),
            gte(expenseLines.expenseDate, periodStart),
            lte(expenseLines.expenseDate, periodEnd),
            eq(expenseLines.allocationScope, "project_pool"),
            eq(expenseLines.ownerChargeable, true),
          ),
        )
    : [];

  const taxesVilla = villaIds.length
    ? await db
        .select()
        .from(taxLines)
        .where(
          and(
            eq(taxLines.status, "posted"),
            inArray(taxLines.villaId, villaIds),
            gte(taxLines.taxDate, periodStart),
            lte(taxLines.taxDate, periodEnd),
          ),
        )
    : [];

  const reservesVilla = villaIds.length
    ? await db
        .select()
        .from(reserveMovements)
        .where(
          and(
            eq(reserveMovements.status, "posted"),
            inArray(reserveMovements.villaId, villaIds),
            gte(reserveMovements.movementDate, periodStart),
            lte(reserveMovements.movementDate, periodEnd),
          ),
        )
    : [];

  const mgmtVilla = villaIds.length
    ? await db
        .select()
        .from(managementFeeLines)
        .where(
          and(
            eq(managementFeeLines.status, "posted"),
            inArray(managementFeeLines.villaId, villaIds),
            gte(managementFeeLines.feeDate, periodStart),
            lte(managementFeeLines.feeDate, periodEnd),
          ),
        )
    : [];

  // -----------------------------------------------------------------
  // 3) Allocation
  // -----------------------------------------------------------------
  function shareForVilla(villaId: string): ShareInput | null {
    const s = villaShares.find((v) => v.s.villaId === villaId);
    if (!s) return null;
    return {
      ownerId: s.s.ownerId,
      ownershipShareId: s.s.id,
      sharePercent: Number(s.s.sharePercent),
    };
  }

  function shareForProject(projectId: string): ShareInput | null {
    const s = poolShares.find((p) => p.s.projectId === projectId);
    if (!s) return null;
    return {
      ownerId: s.s.ownerId,
      ownershipShareId: s.s.id,
      sharePercent: Number(s.s.sharePercent),
    };
  }

  const linesToInsert: Array<{
    line_type: "revenue" | "fee" | "expense" | "tax" | "reserve" | "management_fee";
    source_table: string;
    source_id: string;
    category: string;
    description: string;
    amount_minor: bigint;
    currency: string;
    sort_order: number;
    owner_visible: boolean;
  }> = [];

  /**
   * Materialised expense allocations to write to `expense_allocations` after
   * the statement row is persisted. Each entry pins back to its source
   * `expense_line_id`, the owner, the share, and the basis.
   */
  const allocationsToInsert: Array<{
    expenseLineId: string;
    villaId: string | null;
    projectId: string | null;
    ownershipShareId: string;
    allocationBasis: "villa_share" | "project_pool_share";
    allocationPercent: number;
    allocatedAmountMinor: bigint;
  }> = [];

  let grossRevenueMinor = 0n;
  let totalFeesMinor = 0n;
  let totalExpensesMinor = 0n;
  let totalTaxesMinor = 0n;
  let totalReservesMinor = 0n;
  let managementFeeMinor = 0n;

  function applyVillaShare(amount: bigint, villaId: string): bigint {
    const share = shareForVilla(villaId);
    if (!share) return 0n;
    const [allocated] = allocateBySharePercent(amount, [share]);
    return allocated.amountMinor;
  }

  function applyProjectShare(amount: bigint, projectId: string): bigint {
    const share = shareForProject(projectId);
    if (!share) return 0n;
    const [allocated] = allocateBySharePercent(amount, [share]);
    return allocated.amountMinor;
  }

  let sortOrder = 0;
  function pushLine(p: Omit<(typeof linesToInsert)[number], "sort_order">) {
    linesToInsert.push({ ...p, sort_order: sortOrder++ });
  }

  // Revenue (villa)
  for (const r of revVilla) {
    const amount = applyVillaShare(BigInt(r.amountMinor), r.villaId!);
    if (amount === 0n) continue;
    grossRevenueMinor += amount;
    pushLine({
      line_type: "revenue",
      source_table: "revenue_lines",
      source_id: r.id,
      category: r.revenueType,
      description: r.description,
      amount_minor: amount,
      currency,
      owner_visible: true,
    });
  }

  // Revenue (pool — only for owners with project pool share but no villa share)
  if (villaShares.length === 0) {
    for (const r of revPool) {
      if (!r.projectId) continue;
      const amount = applyProjectShare(BigInt(r.amountMinor), r.projectId);
      if (amount === 0n) continue;
      grossRevenueMinor += amount;
      pushLine({
        line_type: "revenue",
        source_table: "revenue_lines",
        source_id: r.id,
        category: r.revenueType,
        description: r.description,
        amount_minor: amount,
        currency,
        owner_visible: true,
      });
    }
  }

  // Fees (villa)
  for (const f of feesVilla) {
    const amount = applyVillaShare(BigInt(f.amountMinor), f.villaId!);
    if (amount === 0n) continue;
    totalFeesMinor += amount;
    pushLine({
      line_type: "fee",
      source_table: "fee_lines",
      source_id: f.id,
      category: f.feeType,
      description: f.description,
      amount_minor: amount,
      currency,
      owner_visible: true,
    });
  }

  // Fees (pool, only for pool-only)
  if (villaShares.length === 0) {
    for (const f of feesPool) {
      if (!f.projectId) continue;
      const amount = applyProjectShare(BigInt(f.amountMinor), f.projectId);
      if (amount === 0n) continue;
      totalFeesMinor += amount;
      pushLine({
        line_type: "fee",
        source_table: "fee_lines",
        source_id: f.id,
        category: f.feeType,
        description: f.description,
        amount_minor: amount,
        currency,
        owner_visible: true,
      });
    }
  }

  // Expenses (villa)
  for (const e of expVilla) {
    if (!e.villaId) continue;
    const share = shareForVilla(e.villaId);
    if (!share) continue;
    const amount = applyVillaShare(BigInt(e.amountMinor), e.villaId);
    if (amount === 0n) continue;
    totalExpensesMinor += amount;
    pushLine({
      line_type: "expense",
      source_table: "expense_lines",
      source_id: e.id,
      category: e.expenseType,
      description: e.description,
      amount_minor: amount,
      currency,
      owner_visible: true,
    });
    allocationsToInsert.push({
      expenseLineId: e.id,
      villaId: e.villaId,
      projectId: e.projectId,
      ownershipShareId: share.ownershipShareId,
      allocationBasis: "villa_share",
      allocationPercent: share.sharePercent,
      allocatedAmountMinor: amount,
    });
  }

  // Expenses (project pool — hybrid + pooled)
  for (const e of expPoolShared) {
    if (!e.projectId) continue;
    const share = shareForProject(e.projectId);
    if (!share) continue;
    const [alloc] = allocateBySharePercent(BigInt(e.amountMinor), [share]);
    if (alloc.amountMinor === 0n) continue;
    totalExpensesMinor += alloc.amountMinor;
    pushLine({
      line_type: "expense",
      source_table: "expense_lines",
      source_id: e.id,
      category: `${e.expenseType} (shared)`,
      description: `Shared · ${e.description}`,
      amount_minor: alloc.amountMinor,
      currency,
      owner_visible: true,
    });
    allocationsToInsert.push({
      expenseLineId: e.id,
      villaId: null,
      projectId: e.projectId,
      ownershipShareId: share.ownershipShareId,
      allocationBasis: "project_pool_share",
      allocationPercent: share.sharePercent,
      allocatedAmountMinor: alloc.amountMinor,
    });
  }

  // Taxes (villa)
  for (const t of taxesVilla) {
    if (!t.villaId) continue;
    const amount = applyVillaShare(BigInt(t.amountMinor), t.villaId);
    if (amount === 0n) continue;
    totalTaxesMinor += amount;
    pushLine({
      line_type: "tax",
      source_table: "tax_lines",
      source_id: t.id,
      category: t.taxType,
      description: t.description,
      amount_minor: amount,
      currency,
      owner_visible: t.ownerVisible,
    });
  }

  // Reserves (villa, contributions)
  for (const r of reservesVilla) {
    if (!r.villaId) continue;
    const sign = r.movementType === "release" ? -1n : 1n;
    const amount = applyVillaShare(BigInt(r.amountMinor), r.villaId) * sign;
    if (amount === 0n) continue;
    totalReservesMinor += amount;
    pushLine({
      line_type: "reserve",
      source_table: "reserve_movements",
      source_id: r.id,
      category: `${r.reserveType}_${r.movementType}`,
      description: r.description,
      amount_minor: amount,
      currency,
      owner_visible: true,
    });
  }

  // Management fee (villa-attributed lines, if any)
  for (const m of mgmtVilla) {
    if (!m.villaId) continue;
    const amount = applyVillaShare(BigInt(m.amountMinor), m.villaId);
    if (amount === 0n) continue;
    managementFeeMinor += amount;
    pushLine({
      line_type: "management_fee",
      source_table: "management_fee_lines",
      source_id: m.id,
      category: "management_fee",
      description: m.description,
      amount_minor: amount,
      currency,
      owner_visible: true,
    });
  }

  // Compute synthetic management fee from rules if no recorded lines exist.
  if (managementFeeMinor === 0n) {
    const rules = await db
      .select()
      .from(managementFeeRules)
      .where(
        and(
          eq(managementFeeRules.status, "active"),
          lte(managementFeeRules.startsOn, periodEnd),
          or(isNull(managementFeeRules.endsOn), gte(managementFeeRules.endsOn, periodStart)),
        ),
      );

    // Pick the most specific rule: villa > project > generic
    const villaRule = rules.find((r) => r.villaId && villaIds.includes(r.villaId));
    const projectRule = rules.find(
      (r) => !r.villaId && r.projectId && projectIds.concat(headlineProjectId ? [headlineProjectId] : []).includes(r.projectId),
    );
    const fallbackRule = rules.find((r) => !r.villaId && !r.projectId);
    const rule = villaRule ?? projectRule ?? fallbackRule;

    if (rule) {
      const base =
        rule.feeModel === "percent_of_gross"
          ? grossRevenueMinor
          : rule.feeModel === "percent_of_net"
            ? grossRevenueMinor + totalFeesMinor + totalExpensesMinor + totalTaxesMinor
            : 0n;
      let amt = 0n;
      if (rule.feePercent !== null && (rule.feeModel === "percent_of_gross" || rule.feeModel === "percent_of_net")) {
        amt = percentOfMinor(base, Number(rule.feePercent)).amount;
      } else if (rule.feeModel === "fixed_monthly" && rule.fixedAmountMinor !== null) {
        amt = BigInt(rule.fixedAmountMinor);
      }
      // Fees are negative for owners — store as negative.
      const signed = -amt;
      if (signed !== 0n) {
        managementFeeMinor = signed;
        pushLine({
          line_type: "management_fee",
          source_table: "management_fee_rules",
          source_id: rule.id,
          category: "management_fee",
          description: `${rule.ruleName} · ${rule.feeModel}`,
          amount_minor: signed,
          currency,
          owner_visible: true,
        });
      }
    }
  }

  const netPayoutMinor =
    grossRevenueMinor +
    totalFeesMinor +
    totalExpensesMinor +
    totalTaxesMinor +
    totalReservesMinor +
    managementFeeMinor;

  // -----------------------------------------------------------------
  // 4) Compute occupancy / ADR / RevPAR
  // -----------------------------------------------------------------
  let occupancyRate: number | null = null;
  let adrMinor: bigint | null = null;
  let revparMinor: bigint | null = null;
  if (villaIds.length > 0) {
    const stayBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          inArray(bookings.villaId, villaIds),
          inArray(bookings.status, ["confirmed", "checked_in", "checked_out"]),
          lt(bookings.checkIn, addOne(periodEnd)),
          gt(bookings.checkOut, periodStart),
        ),
      );
    const soldNights = stayBookings.reduce((sum, b) => sum + nightsForBooking(b), 0);
    const metrics = calculateRoomMetrics(
      villaIds.length,
      periodStart,
      periodEnd,
      soldNights,
      grossRevenueMinor < 0n ? 0n : grossRevenueMinor,
    );
    occupancyRate = metrics.occupancy;
    adrMinor = metrics.adrMinor;
    revparMinor = metrics.revparMinor;
  }

  // -----------------------------------------------------------------
  // 5) Persist statement (idempotent for draft)
  // -----------------------------------------------------------------
  const [existing] = await db
    .select()
    .from(ownerStatements)
    .where(
      and(
        eq(ownerStatements.ownerId, input.ownerId),
        eq(ownerStatements.periodId, input.periodId),
        eq(ownerStatements.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (existing && existing.status !== "draft") {
    return {
      ok: false,
      reason: `statement_${existing.status}_already_exists`,
    };
  }

  const statementCode =
    existing?.statementCode ??
    `STM-${owner.displayName.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}-${period.label.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;

  const totals = {
    grossRevenueMinor,
    totalFeesMinor,
    totalExpensesMinor,
    totalTaxesMinor,
    totalReservesMinor,
    managementFeeMinor,
    netPayoutMinor,
  };

  let statementId: string;
  let created = false;
  if (existing) {
    statementId = existing.id;
    await db
      .update(ownerStatements)
      .set({
        villaId: headlineVillaId,
        projectId: headlineProjectId,
        periodMonth,
        managementModel,
        currency,
        grossRevenueMinor,
        totalFeesMinor,
        totalExpensesMinor,
        totalTaxesMinor,
        totalReservesMinor,
        managementFeeMinor,
        netPayoutMinor,
        occupancyRate: occupancyRate === null ? null : occupancyRate.toFixed(3),
        adrMinor: adrMinor ?? null,
        revparMinor: revparMinor ?? null,
        status: "draft",
      })
      .where(
        and(
          eq(ownerStatements.id, existing.id),
          eq(ownerStatements.organizationId, input.organizationId),
        ),
      );

    await db.delete(statementLines).where(eq(statementLines.statementId, existing.id));
    // Drop materialised allocations for this statement so we can rewrite them.
    await db
      .delete(expenseAllocations)
      .where(eq(expenseAllocations.statementId, existing.id));
  } else {
    const [inserted] = await db
      .insert(ownerStatements)
      .values({
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        villaId: headlineVillaId,
        projectId: headlineProjectId,
        periodId: input.periodId,
        periodMonth,
        statementCode,
        managementModel,
        currency,
        grossRevenueMinor,
        totalFeesMinor,
        totalExpensesMinor,
        totalTaxesMinor,
        totalReservesMinor,
        managementFeeMinor,
        netPayoutMinor,
        occupancyRate: occupancyRate === null ? null : occupancyRate.toFixed(3),
        adrMinor: adrMinor ?? null,
        revparMinor: revparMinor ?? null,
        status: "draft",
        createdBy: input.actorUserId ?? null,
      })
      .returning({ id: ownerStatements.id });
    statementId = inserted.id;
    created = true;
  }

  if (linesToInsert.length > 0) {
    await db.insert(statementLines).values(
      linesToInsert.map((l) => ({
        statementId,
        lineType: l.line_type,
        sourceTable: l.source_table,
        sourceId: l.source_id,
        category: l.category,
        description: l.description,
        amountMinor: l.amount_minor,
        currency: l.currency,
        ownerVisible: l.owner_visible,
        sortOrder: l.sort_order,
      })),
    );
  }

  // Materialise expense_allocations alongside statement_lines so allocation
  // reports become queryable. Allocations are scoped to this statement so a
  // redraft (which delete-rewrites them above) stays consistent.
  let allocatedTotalMinor = 0n;
  if (allocationsToInsert.length > 0) {
    await db.insert(expenseAllocations).values(
      allocationsToInsert.map((a) => ({
        expenseLineId: a.expenseLineId,
        villaId: a.villaId,
        projectId: a.projectId,
        ownerId: input.ownerId,
        ownershipShareId: a.ownershipShareId,
        allocatedAmountMinor: a.allocatedAmountMinor,
        currency,
        allocationBasis: a.allocationBasis,
        allocationPercent: a.allocationPercent.toString(),
        statementId,
      })),
    );
    allocatedTotalMinor = allocationsToInsert.reduce<bigint>(
      (acc, a) => acc + a.allocatedAmountMinor,
      0n,
    );
  }

  await recordAuditEvent({
    actorUserId: input.actorUserId ?? null,
    action: created ? "owner_statement.generate" : "owner_statement.regenerate",
    entityType: "owner_statement",
    entityId: statementId,
    metadata: {
      ownerId: input.ownerId,
      periodId: input.periodId,
      managementModel,
      villaIds,
      projectIds,
      totals: stringifyTotals(totals),
      allocations: {
        count: allocationsToInsert.length,
        totalMinor: allocatedTotalMinor.toString(),
      },
    },
  });

  return { ok: true, statementId, statementCode, created };
}

function addOne(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stringifyTotals(t: Record<string, bigint>) {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.toString()]));
}

/** Required for validateAllocationTotals callers but exposed publicly. */
export function reduceAllocations(allocations: ShareAllocation[]): bigint {
  return allocations.reduce<bigint>((acc, a) => acc + a.amountMinor, 0n);
}

/** Re-exported for unit tests. */
export type { DB };
