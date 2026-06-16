import "server-only";

import { and, eq, gte, lte, inArray, lt, gt, isNull, or, sql } from "drizzle-orm";
import { getDb, rowsOf, type DB } from "@/lib/db/client";
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
import {
  computeStatementNet,
  assertStatementLinesMatchNet,
  formulaDeductionMagnitudeMinor,
} from "./statement-net-pure";
import { getStatementSettings } from "./statement-settings";

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
 * Pinned fallback USD→IDR rate, mirroring statement-generation.ts. Only used
 * when the live fx-service is unconfigured or rate-limited. Snapshotted onto
 * the statement row so net_to_owner_usd_minor stays stable across re-renders.
 */
const FX_USD_TO_IDR_FALLBACK = 15_800;

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

  // STATEMENT-SETTINGS — per-SCOPE config for what the statement includes and
  // how tax/reserve/mgmt/revenue are computed (org_statement_settings + custom
  // deductions, migrations 0182/0183). Org-scoped via requireOrgId() inside
  // getStatementSettings; resolves owner > project > org-default precedence so a
  // per-owner / per-project override applies. The scope projectId falls back to
  // the headline project so a project-level override still matches a villa-only
  // owner. Returns DEFAULTS (all includes true, tax/reserve/mgmt='ledger',
  // revenue from the ledger) when no row exists → an org WITHOUT a settings row
  // behaves EXACTLY as today.
  const settings = await getStatementSettings({
    ownerId: input.ownerId,
    projectId: input.projectId ?? headlineProjectId,
  });

  // Currency: explicit input precedence (callers may force a currency), else the
  // org's configured statement currency. Replaces the old hardcoded "USD".
  const currency = input.currency ?? settings.statementCurrency;

  // REVENUE_SOURCE (cron-convergence capability): 'ledger' (default) reads posted
  // revenue_lines as today. 'bookings' derives gross from the period's bookings
  // (gross_amount + channel_fee_amount, FX→IDR minor) AND reads opex/capex/cogs
  // from dev_transactions — reproducing the FORMULA generator's inputs.
  const revenueFromBookings = settings.revenueSource === "bookings";

  // FX snapshot — resolved ONCE here (not lazily after line-building) because the
  // bookings/dev_transactions ports below convert USD→IDR minor at this rate,
  // exactly like statement-generation.ts. getUsdToIdr() with the pinned 15,800
  // fallback. The net-to-owner-USD conversion in section 3b reuses this value.
  const { getUsdToIdr } = await import("@/features/integrations/fx-service");
  const fxUsdToIdr =
    (await getUsdToIdr().catch(() => FX_USD_TO_IDR_FALLBACK)) || FX_USD_TO_IDR_FALLBACK;

  // -----------------------------------------------------------------
  // 2) Pull source rows for the period
  // -----------------------------------------------------------------
  const villaIds = villaShares.map((s) => s.s.villaId!).filter(Boolean) as string[];
  const projectIds = [...new Set(poolShares.map((s) => s.s.projectId!).filter(Boolean))] as string[];

  // Revenue: villa-attributed posted rows in period. Pool-only owners (no villa)
  // get their share of project revenue (via villas in the project).
  // REVENUE_SOURCE='bookings': skip the ledger revenue_lines entirely — gross is
  // derived from bookings below (the channel fee becomes the only fee line), so
  // reading revenue_lines here would DOUBLE-COUNT.
  const revVilla = !revenueFromBookings && villaIds.length
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

  const revPool = !revenueFromBookings && projectIds.length
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

  // STATEMENT-SETTINGS: include_fees=false → skip pulling/emitting fee lines.
  // REVENUE_SOURCE='bookings': fee_lines are NOT read — the only fee is the
  // booking channel commission, emitted from the bookings port below.
  const feesVilla = settings.includeFees && !revenueFromBookings && villaIds.length
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

  const feesPool = settings.includeFees && !revenueFromBookings && projectIds.length
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

  // STATEMENT-SETTINGS: include_expenses=false → skip pulling/emitting expense
  // lines AND their materialised expense_allocations (built in the loops below,
  // which become no-ops when these arrays are empty).
  // REVENUE_SOURCE='bookings': the ledger expense_lines are NOT read — expenses
  // come from dev_transactions (loadVillaExpenses port) instead, reproducing the
  // formula generator's expense inputs.
  const expVilla = settings.includeExpenses && !revenueFromBookings && villaIds.length
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

  const expPoolShared = settings.includeExpenses && !revenueFromBookings && projectIds.length
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

  // STATEMENT-SETTINGS: only read posted tax_lines in 'ledger' mode. 'off' emits
  // no tax; 'formula' computes the tax from gross below (NOT from the ledger).
  const taxesVilla = settings.taxMode === "ledger" && villaIds.length
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

  // STATEMENT-SETTINGS: only read posted reserve_movements in 'ledger' mode.
  const reservesVilla = settings.reserveMode === "ledger" && villaIds.length
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

  // STATEMENT-SETTINGS: management fee is gated by include_management_fee (a hard
  // off switch — false ALWAYS wins) AND mgmtMode. The LEDGER path (recorded
  // mgmt-fee lines + the synthetic-rule fallback below) runs only when
  // mgmtMode==='ledger'; 'off' suppresses the fee; 'formula' computes it from
  // gross in a dedicated block (after the deduction totals are known).
  const mgmtLedger = settings.includeManagementFee && settings.mgmtMode === "ledger";
  const mgmtVilla = mgmtLedger && villaIds.length
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
  // STATEMENT-SETTINGS (#284 custom deductions): POSITIVE running magnitude for
  // operator-defined extra deduction lines; computeStatementNet SUBTRACTS it.
  let totalCustomDeductionsMinor = 0n;

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

  // -----------------------------------------------------------------
  // REVENUE_SOURCE='bookings' — port of statement-generation.ts loadBookings +
  // loadVillaExpenses. Replicated FAITHFULLY (raw SQL, the same date_trunc month
  // filter, the same per-booking `Math.round(gross * sharePct/100)` share-split,
  // the same USD→IDR conversion) so the booking-derived gross / channel fee /
  // dev_transactions expenses match the formula generator byte-for-byte.
  //
  // Pooling note: like the formula generator, this only handles VILLA-attributed
  // shares (each villa share builds its own bookings + that villa's project's
  // opex/capex/cogs). Pool-only owners are NOT reproduced via bookings (the
  // formula generator is per owner×villa and has no pool-only mode).
  // -----------------------------------------------------------------
  if (revenueFromBookings) {
    const toIdrMinor = (units: number, isUsd: boolean): bigint => {
      const idr = isUsd ? units * fxUsdToIdr : units;
      return BigInt(Math.round(idr * 100));
    };

    for (const vs of villaShares) {
      const villaId = vs.s.villaId!;
      const sharePct = Number(vs.s.sharePercent);
      const sharePctFactor = sharePct / 100;
      const projectId = vs.s.projectId ?? null;

      // 1) Bookings → gross + channel fee (loadBookings port).
      const bookingRows = await db.execute<{
        id: string;
        booking_code: string;
        notes: string | null;
        check_in: string;
        nights: string;
        gross: string;
        channel_fee: string;
        currency: string;
      }>(sql`
        SELECT b.id::text          AS id,
               b.booking_code       AS booking_code,
               b.notes              AS notes,
               b.check_in::text     AS check_in,
               b.nights::text       AS nights,
               b.gross_amount::text AS gross,
               b.channel_fee_amount::text AS channel_fee,
               b.currency           AS currency
          FROM bookings b
         WHERE b.villa_id = ${villaId}::uuid
           AND b.status IN ('confirmed','checked_in','checked_out')
           AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
         ORDER BY b.check_in ASC
      `);

      let villaChannelFeeMinor = 0n;
      for (const b of rowsOf<{
        id: string;
        booking_code: string;
        notes: string | null;
        check_in: string;
        nights: string;
        gross: string;
        channel_fee: string;
        currency: string;
      }>(bookingRows)) {
        const isUsd = b.currency === "USD";
        const grossIdrMinor = toIdrMinor(Number(b.gross || 0), isUsd);
        const channelFeeIdrMinor = toIdrMinor(Number(b.channel_fee || 0), isUsd);
        // Per-booking share split — Math.round to match statement-generation.ts.
        const ownerGross = BigInt(Math.round(Number(grossIdrMinor) * sharePctFactor));
        const ownerChannelFee = BigInt(
          Math.round(Number(channelFeeIdrMinor) * sharePctFactor),
        );
        grossRevenueMinor += ownerGross;
        villaChannelFeeMinor += ownerChannelFee;
        const guestName = b.notes?.replace(/^\[DEMO2\] /, "").trim() || "Guest";
        pushLine({
          line_type: "revenue",
          source_table: "bookings",
          source_id: b.id,
          category: "revenue",
          description: `${b.booking_code} · ${guestName} · ${Number(b.nights || 0)}n from ${b.check_in}`,
          amount_minor: ownerGross,
          currency,
          owner_visible: true,
        });
      }

      // Channel commission — ONE negative fee line per villa (mirrors the
      // formula generator emitting a single aggregated channel-fee line).
      if (settings.includeFees && villaChannelFeeMinor > 0n) {
        totalFeesMinor += villaChannelFeeMinor;
        pushLine({
          line_type: "fee",
          source_table: "bookings",
          source_id: "00000000-0000-0000-0000-000000000000",
          category: "fees",
          description: "Channel commission (OTA fees)",
          amount_minor: -villaChannelFeeMinor,
          currency,
          owner_visible: true,
        });
      }

      // 2) dev_transactions opex/capex/cogs → expenses (loadVillaExpenses port).
      if (settings.includeExpenses && projectId) {
        const expenseRows = await db.execute<{
          id: string;
          description: string;
          category_name: string;
          amount_minor: string;
          currency: string;
          fx_rate: string | null;
        }>(sql`
          SELECT t.id::text                            AS id,
                 COALESCE(t.description, c.display_name) AS description,
                 c.display_name                         AS category_name,
                 t.amount_minor::text                   AS amount_minor,
                 t.currency                             AS currency,
                 t.fx_rate_at_transaction               AS fx_rate
            FROM dev_transactions t
            JOIN dev_cost_categories c ON c.id = t.category_id
           WHERE t.organization_id = ${input.organizationId}::uuid
             AND t.project_id = ${projectId}::uuid
             AND date_trunc('month', t.transaction_date)::date = ${periodMonth}::date
             AND c.category_type IN ('opex','capex','cogs')
             AND c.category_type <> 'corporate_event'
             AND t.direction = 'outflow'
           ORDER BY t.transaction_date ASC
           LIMIT 50
        `);
        for (const e of rowsOf<{
          id: string;
          description: string;
          category_name: string;
          amount_minor: string;
          currency: string;
          fx_rate: string | null;
        }>(expenseRows)) {
          let amountIdrMinor = BigInt(e.amount_minor ?? "0");
          if (e.currency !== "IDR") {
            const fx = Number(e.fx_rate ?? "16000");
            amountIdrMinor = BigInt(Math.round((Number(amountIdrMinor) / 100) * fx * 100));
          }
          const ownerShare = BigInt(Math.round(Number(amountIdrMinor) * sharePctFactor));
          if (ownerShare === 0n) continue;
          totalExpensesMinor += ownerShare;
          const desc =
            e.description?.replace(/^\[DEMO\] /, "").replace(/^\[DEMO2\] /, "") ?? "Expense";
          pushLine({
            line_type: "expense",
            source_table: "dev_transactions",
            source_id: e.id,
            category: e.category_name,
            description: `${e.category_name} · ${desc}`,
            amount_minor: -ownerShare,
            currency,
            owner_visible: true,
          });
        }
      }
    }
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
      // Deduction line: SIGNED negative so Σ(lines) == net (canonical model).
      amount_minor: -amount,
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
        // Deduction line: SIGNED negative (canonical model).
        amount_minor: -amount,
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
      // Deduction line: SIGNED negative (canonical model). The expense_allocations
      // row below keeps its POSITIVE magnitude — only the statement line is signed.
      amount_minor: -amount,
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
      // Deduction line: SIGNED negative (canonical model).
      amount_minor: -alloc.amountMinor,
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
      // Deduction line: SIGNED negative (canonical model).
      amount_minor: -amount,
      currency,
      owner_visible: t.ownerVisible,
    });
  }

  // Reserves (villa, contributions)
  for (const r of reservesVilla) {
    if (!r.villaId) continue;
    const sign = r.movementType === "release" ? -1n : 1n;
    // `amount` carries the release sign: contribution = +magnitude (sets money
    // aside), release = −magnitude (returns money). totalReservesMinor keeps
    // this signed value; computeStatementNet SUBTRACTS it (a contribution
    // reduces net, a release adds it back).
    const amount = applyVillaShare(BigInt(r.amountMinor), r.villaId) * sign;
    if (amount === 0n) continue;
    totalReservesMinor += amount;
    pushLine({
      line_type: "reserve",
      source_table: "reserve_movements",
      source_id: r.id,
      category: `${r.reserveType}_${r.movementType}`,
      description: r.description,
      // SIGNED line: contribution (+magnitude) → −magnitude (reduces net),
      // release (−magnitude) → +magnitude (adds back). Mirrors the net's
      // `- totalReservesMinor`, keeping Σ(lines) == net.
      amount_minor: -amount,
      currency,
      owner_visible: true,
    });
  }

  // STATEMENT-SETTINGS: FORMULA tax. Computed as a % of GROSS revenue (NOT read
  // from the ledger). Emits ONE tax line with the canonical NEGATIVE magnitude,
  // and adds the POSITIVE magnitude to totalTaxesMinor — which computeStatementNet
  // SUBTRACTS, keeping Σ(lines) == net. Placed BEFORE the management-fee blocks so
  // a percent_of_net management rule sees this tax in its net base.
  if (settings.taxMode === "formula") {
    const taxMagnitude = formulaDeductionMagnitudeMinor(
      grossRevenueMinor,
      settings.taxPct,
    );
    if (taxMagnitude !== 0n) {
      totalTaxesMinor += taxMagnitude;
      pushLine({
        line_type: "tax",
        source_table: "org_statement_settings",
        source_id: "00000000-0000-0000-0000-000000000000",
        category: "tax_formula",
        description: `${settings.taxLabel} · ${settings.taxPct}% of gross`,
        // Deduction line: SIGNED negative (canonical model).
        amount_minor: -taxMagnitude,
        currency,
        owner_visible: true,
      });
    }
  }

  // STATEMENT-SETTINGS: FORMULA reserve. Same shape as the formula tax — a % of
  // gross as a POSITIVE magnitude in totalReservesMinor (a contribution, so the
  // net subtracts it) with a NEGATIVE statement line.
  if (settings.reserveMode === "formula") {
    const reserveMagnitude = formulaDeductionMagnitudeMinor(
      grossRevenueMinor,
      settings.reservePct,
    );
    if (reserveMagnitude !== 0n) {
      totalReservesMinor += reserveMagnitude;
      pushLine({
        line_type: "reserve",
        source_table: "org_statement_settings",
        source_id: "00000000-0000-0000-0000-000000000000",
        category: "reserve_formula",
        description: `${settings.reserveLabel} · ${settings.reservePct}% of gross`,
        // SIGNED line: contribution → −magnitude (reduces net). Mirrors the net's
        // `- totalReservesMinor`, keeping Σ(lines) == net.
        amount_minor: -reserveMagnitude,
        currency,
        owner_visible: true,
      });
    }
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
      // Deduction line: SIGNED negative (canonical model).
      amount_minor: -amount,
      currency,
      owner_visible: true,
    });
  }

  // Compute synthetic management fee from rules if no recorded lines exist.
  // STATEMENT-SETTINGS: gated by the LEDGER mode (mgmtVilla is already empty when
  // off/formula, but skip the rule lookup too). The 'formula' mode is handled in
  // its own block below.
  if (mgmtLedger && managementFeeMinor === 0n) {
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
            ? // "% of net" = % of the net BEFORE the management fee itself.
              // Deduction totals are positive magnitudes → SUBTRACT them (the
              // old code added them, inflating the base + the fee).
              grossRevenueMinor -
              totalFeesMinor -
              totalExpensesMinor -
              totalTaxesMinor -
              totalReservesMinor
            : 0n;
      let amt = 0n;
      if (rule.feePercent !== null && (rule.feeModel === "percent_of_gross" || rule.feeModel === "percent_of_net")) {
        amt = percentOfMinor(base, Number(rule.feePercent)).amount;
      } else if (rule.feeModel === "fixed_monthly" && rule.fixedAmountMinor !== null) {
        amt = BigInt(rule.fixedAmountMinor);
      }
      // Accumulate the management fee as a POSITIVE MAGNITUDE (consistent with
      // the other deduction totals + the summary column); the net SUBTRACTS it
      // and the statement LINE carries the negative sign.
      if (amt !== 0n) {
        managementFeeMinor = amt;
        pushLine({
          line_type: "management_fee",
          source_table: "management_fee_rules",
          source_id: rule.id,
          category: "management_fee",
          description: `${settings.mgmtLabel} · ${rule.ruleName} · ${rule.feeModel}`,
          // Deduction line: SIGNED negative (canonical model).
          amount_minor: -amt,
          currency,
          owner_visible: true,
        });
      }
    }
  }

  // STATEMENT-SETTINGS: FORMULA management fee. mgmt = round(gross * mgmtPct/100)
  // as a POSITIVE magnitude in managementFeeMinor (the net SUBTRACTS it) with ONE
  // NEGATIVE statement line. include_management_fee=false already forced mgmtMode
  // off (mgmtLedger=false and this guard), so 'off' wins. Uses the SAME half-up
  // magnitude helper as the formula tax/reserve so all three round identically.
  if (settings.includeManagementFee && settings.mgmtMode === "formula") {
    const mgmtMagnitude = formulaDeductionMagnitudeMinor(
      grossRevenueMinor,
      settings.mgmtPct,
    );
    if (mgmtMagnitude !== 0n) {
      managementFeeMinor = mgmtMagnitude;
      pushLine({
        line_type: "management_fee",
        source_table: "org_statement_settings",
        source_id: "00000000-0000-0000-0000-000000000000",
        category: "management_fee",
        description: `${settings.mgmtLabel} · ${settings.mgmtPct}% of gross`,
        // Deduction line: SIGNED negative (canonical model).
        amount_minor: -mgmtMagnitude,
        currency,
        owner_visible: true,
      });
    }
  }

  // STATEMENT-SETTINGS (#284): CUSTOM DEDUCTIONS — operator-defined extra
  // deductions resolved at the same owner>project>org scope as the settings row.
  // Each is a DEDUCTION (#283 sign convention): formula = round(gross * pct/100),
  // fixed = fixedAmountMinor. Emitted as a NEGATIVE 'expense' line carrying the
  // custom label; the POSITIVE magnitude accrues to totalCustomDeductionsMinor,
  // which computeStatementNet SUBTRACTS — preserving Σ(lines)==net.
  for (const cd of settings.customDeductions) {
    const magnitude =
      cd.mode === "formula"
        ? formulaDeductionMagnitudeMinor(grossRevenueMinor, cd.pct ?? 0)
        : cd.fixedAmountMinor !== null && cd.fixedAmountMinor > 0n
          ? cd.fixedAmountMinor
          : 0n;
    if (magnitude <= 0n) continue;
    totalCustomDeductionsMinor += magnitude;
    pushLine({
      line_type: "expense",
      source_table: "org_statement_custom_deductions",
      source_id: "00000000-0000-0000-0000-000000000000",
      category: "custom_deduction",
      description:
        cd.mode === "formula"
          ? `${cd.label} · ${cd.pct ?? 0}% of gross`
          : cd.label,
      // Deduction line: SIGNED negative (canonical model).
      amount_minor: -magnitude,
      currency,
      owner_visible: true,
    });
  }

  // MONEY-CORRECTNESS — canonical ledger net (mirrors statement-generation.ts):
  // deductions are stored as positive magnitudes and SUBTRACTED. The prior code
  // SUMMED them, adding positive expenses/fees/taxes to the payout → overpaying
  // owners. Computed via the shared pure function so the invariant is testable.
  const netPayoutMinor = computeStatementNet({
    grossRevenueMinor,
    totalFeesMinor,
    totalExpensesMinor,
    totalTaxesMinor,
    totalReservesMinor,
    managementFeeMinor,
    totalCustomDeductionsMinor,
  });

  // SAFETY NET — Σ(signed statement lines) MUST reconcile to the net. Throws
  // loudly before any money row is written if a sign/accumulator ever drifts.
  const linesSignedTotalMinor = linesToInsert.reduce<bigint>(
    (acc, l) => acc + l.amount_minor,
    0n,
  );
  assertStatementLinesMatchNet(linesSignedTotalMinor, netPayoutMinor);

  // -----------------------------------------------------------------
  // 3b) FX snapshot + net-to-owner in USD (MISSING-USD fix).
  //
  // The owner portal + the monthly cron email render `net_to_owner_usd_minor`
  // and `fx_rate_snapshot`; leaving them NULL made those views show nothing.
  // Resolve + snapshot the live USD→IDR rate exactly like statement-generation.ts
  // (getUsdToIdr() with the pinned 15,800 fallback) and convert with the SAME
  // direction/units:
  //   - USD statement → net is already USD minor (identity).
  //   - IDR statement → USD minor = round(netIdrMinor / 100 / fxUsdToIdr * 100).
  //   - other currency → no canonical pair to convert through; leave USD NULL
  //     but still snapshot the rate.
  // fxUsdToIdr resolved ONCE near the top (the bookings port needs it for
  // USD→IDR conversion); reuse the snapshot here.
  const fxRateSnapshot = String(fxUsdToIdr);
  let netToOwnerUsdMinor: bigint | null;
  if (currency === "USD") {
    netToOwnerUsdMinor = netPayoutMinor;
  } else if (currency === "IDR") {
    netToOwnerUsdMinor = BigInt(
      Math.round((Number(netPayoutMinor) / 100) / fxUsdToIdr * 100),
    );
  } else {
    netToOwnerUsdMinor = null;
  }

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
        fxRateSnapshot,
        netToOwnerUsdMinor,
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
        fxRateSnapshot,
        netToOwnerUsdMinor,
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
