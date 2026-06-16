import "server-only";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { ownerStatements, statementLines, statementPeriods } from "@/lib/db/schema/finance";

/**
 * STATEMENT-1 — Owner statement generation engine.
 *
 * Produces an `owner_statements` row + N `statement_lines` rows for
 * a given owner × villa × period_month, derived from real seeded
 * bookings + dev_transactions. All amounts stored in IDR minor with
 * a snapshot FX rate so net_to_owner_usd_minor stays stable across
 * re-renders.
 *
 * Tenancy: every call resolves orgId via requireOrgId() (TENANT-1).
 * Hash: sha256 over a stable JSON serialisation of (period, lines).
 * Idempotency: upsert on (org_id, owner_id, villa_id, period_month).
 *
 * Excluded: cost_category 'corporate_event' (shared overhead, not
 * villa-attributable). FX rate pinned 15,800 IDR/USD (PART-1 default).
 */

/** Pinned fallback — only used when fx-service is unconfigured or
 *  rate-limited. FX-CALLERS-1: getUsdToIdr() resolved at generation
 *  time and snapshotted on the statement row. */
const FX_USD_TO_IDR_FALLBACK = 15_800;
const DEFAULT_OPERATOR_COMMISSION = 0.2;
const TAX_PCT = 0.11;
const RESERVE_PCT = 0.03;

export interface GeneratedStatementSummary {
  statementId: string;
  ownerId: string;
  villaId: string;
  periodMonth: string;
  grossIdrMinor: bigint;
  netToOwnerIdrMinor: bigint;
  netToOwnerUsdMinor: bigint;
  contentHash: string;
  linesCount: number;
}

interface DraftLine {
  lineType: string;
  category: string;
  description: string;
  amountMinor: bigint;
  sourceTable: string | null;
  sourceId: string | null;
  sortOrder: number;
}

function _isoFirstOfMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function hashLines(periodMonth: string, lines: DraftLine[]): string {
  const payload = JSON.stringify({
    p: periodMonth,
    l: lines.map((l) => ({
      t: l.lineType,
      c: l.category,
      d: l.description,
      a: l.amountMinor.toString(),
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

async function resolveOrCreatePeriod(
  db: ReturnType<typeof getDb>,
  periodMonth: string,
): Promise<string> {
  if (!db) throw new Error("DB not configured");
  const [y, m] = periodMonth.split("-").map(Number);
  const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const existing = await db
    .select({ id: statementPeriods.id })
    .from(statementPeriods)
    .where(eq(statementPeriods.periodStart, periodStart))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
  const [row] = await db
    .insert(statementPeriods)
    .values({ periodStart, periodEnd, label, status: "open" })
    .returning({ id: statementPeriods.id });
  return row!.id;
}

interface OwnerVillaContext {
  ownerId: string;
  villaId: string;
  sharePercent: number; // 0-100
  managementModel: string;
  currency: string;
  /**
   * Persisted per-owner operator commission as a FRACTION in [0,1], or null
   * when the owner has no commission set (→ caller falls back to the 20%
   * platform default). owners.commission_pct, migration 0169.
   */
  ownerCommissionPct: number | null;
}

async function loadContext(
  db: NonNullable<ReturnType<typeof getDb>>,
  orgId: string,
  ownerId: string,
  villaId: string,
): Promise<OwnerVillaContext | null> {
  const rows = await db.execute<{
    share_percent: string;
    management_model: string;
    commission_pct: string | null;
  }>(sql`
    SELECT os.share_percent::text   AS share_percent,
           os.model                  AS management_model,
           o.commission_pct::text    AS commission_pct
      FROM ownership_shares os
      JOIN owners o ON o.id = os.owner_id
     WHERE os.owner_id = ${ownerId}::uuid
       AND os.villa_id = ${villaId}::uuid
       AND os.status = 'active'
     LIMIT 1
  `);
  const r = rowsOf<{
    share_percent: string;
    management_model: string;
    commission_pct: string | null;
  }>(rows)[0];
  if (!r) return null;
  return {
    ownerId,
    villaId,
    sharePercent: Number(r.share_percent),
    managementModel: r.management_model ?? "individual",
    currency: "IDR",
    ownerCommissionPct:
      r.commission_pct !== null && r.commission_pct !== "" ? Number(r.commission_pct) : null,
  };
}

interface BookingRow {
  id: string;
  bookingCode: string;
  guestName: string | null;
  checkIn: string;
  nights: number;
  grossIdrMinor: bigint;
  channelFeeIdrMinor: bigint;
}

async function loadBookings(
  db: NonNullable<ReturnType<typeof getDb>>,
  villaId: string,
  periodMonth: string,
  fxUsdToIdr: number,
): Promise<BookingRow[]> {
  const rows = await db.execute<{
    id: string;
    booking_code: string;
    notes: string | null;
    check_in: string;
    nights: string;
    gross: string;
    channel_fee: string;
    currency: string;
  }>(sql`
    SELECT b.id::text                                   AS id,
           b.booking_code                                AS booking_code,
           b.notes                                       AS notes,
           b.check_in::text                              AS check_in,
           b.nights::text                                AS nights,
           b.gross_amount::text                          AS gross,
           b.channel_fee_amount::text                    AS channel_fee,
           b.currency                                    AS currency
      FROM bookings b
     WHERE b.villa_id = ${villaId}::uuid
       AND b.status IN ('confirmed','checked_in','checked_out')
       AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
     ORDER BY b.check_in ASC
  `);
  return (
    rowsOf<{
      id: string;
      booking_code: string;
      notes: string | null;
      check_in: string;
      nights: string;
      gross: string;
      channel_fee: string;
      currency: string;
    }>(rows)
  ).map((r) => {
    const isUsd = r.currency === "USD";
    const grossUnits = Number(r.gross || 0);
    const channelFeeUnits = Number(r.channel_fee || 0);
    const toIdrMinor = (units: number) => {
      const idr = isUsd ? units * fxUsdToIdr : units;
      return BigInt(Math.round(idr * 100));
    };
    return {
      id: r.id,
      bookingCode: r.booking_code,
      guestName: r.notes?.replace(/^\[DEMO2\] /, "").trim() || null,
      checkIn: r.check_in,
      nights: Number(r.nights || 0),
      grossIdrMinor: toIdrMinor(grossUnits),
      channelFeeIdrMinor: toIdrMinor(channelFeeUnits),
    };
  });
}

interface ExpenseRow {
  id: string;
  description: string;
  categoryKey: string;
  amountIdrMinor: bigint;
}

async function loadVillaExpenses(
  db: NonNullable<ReturnType<typeof getDb>>,
  orgId: string,
  projectId: string | null,
  periodMonth: string,
): Promise<ExpenseRow[]> {
  if (!projectId) return [];
  const rows = await db.execute<{
    id: string;
    description: string;
    category_name: string;
    category_type: string;
    amount_minor: string;
    currency: string;
    fx_rate: string | null;
  }>(sql`
    SELECT t.id::text                          AS id,
           COALESCE(t.description, c.display_name) AS description,
           c.display_name                       AS category_name,
           c.category_type                      AS category_type,
           t.amount_minor::text                 AS amount_minor,
           t.currency                           AS currency,
           t.fx_rate_at_transaction             AS fx_rate
      FROM dev_transactions t
      JOIN dev_cost_categories c ON c.id = t.category_id
     WHERE t.organization_id = ${orgId}::uuid
       AND t.project_id = ${projectId}::uuid
       AND date_trunc('month', t.transaction_date)::date = ${periodMonth}::date
       AND c.category_type IN ('opex','capex','cogs')
       AND c.category_type <> 'corporate_event'
       AND t.direction = 'outflow'
     ORDER BY t.transaction_date ASC
     LIMIT 50
  `);
  return (
    rowsOf<{
      id: string;
      description: string;
      category_name: string;
      category_type: string;
      amount_minor: string;
      currency: string;
      fx_rate: string | null;
    }>(rows)
  ).map((r) => {
    let amountIdrMinor = BigInt(r.amount_minor ?? "0");
    if (r.currency !== "IDR") {
      const fx = Number(r.fx_rate ?? "16000");
      amountIdrMinor = BigInt(Math.round((Number(amountIdrMinor) / 100) * fx * 100));
    }
    return {
      id: r.id,
      description: r.description?.replace(/^\[DEMO\] /, "").replace(/^\[DEMO2\] /, "") ?? "Expense",
      categoryKey: r.category_name,
      amountIdrMinor,
    };
  });
}

/**
 * Resolve the villa's project_id, but ONLY when that villa belongs to `orgId`
 * (villa→project→organizations). Returns:
 *   { ok: true, projectId } when the villa is in the caller's org,
 *   { ok: false } when the villa does not exist OR belongs to another org.
 *
 * TENANCY-FINANCE: this is the org boundary for generateStatementForOwnerVilla.
 * villas/ownership_shares/bookings carry no organization_id, so a foreign villaId
 * would otherwise build a statement from another org's bookings/expenses and
 * stamp it with the CALLER's organization_id. The cross-org write hole is closed
 * upstream in generateAllPendingStatements (its target list is org-scoped); this
 * guard prevents regression for any other caller that passes unverified ids.
 */
async function resolveProjectIdForOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  orgId: string,
  villaId: string,
): Promise<{ ok: true; projectId: string | null } | { ok: false }> {
  const rows = await db.execute<{ project_id: string | null }>(sql`
    SELECT v.project_id::text AS project_id
      FROM villas v
      JOIN projects p ON p.id = v.project_id
     WHERE v.id = ${villaId}::uuid
       AND p.organization_id = ${orgId}::uuid
     LIMIT 1
  `);
  const r = rowsOf<{ project_id: string | null }>(rows)[0];
  if (!r) return { ok: false };
  return { ok: true, projectId: r.project_id ?? null };
}

/**
 * STAFF-COST-MODEL phase 2 — owner-chargeable expense_lines for the period.
 *
 * Closes the dual-generator gap: until now this production path read only
 * `dev_transactions` and ignored `expense_lines`, so payroll-posted staff
 * costs (and any other posted owner-borne expense line) never reached the
 * monthly/cron statement. The manual generator (`statement-generator.ts`)
 * already deducts these; this brings the production path to parity.
 *
 * Two buckets, both already org-scoped (expense_lines has no organization_id;
 * tenancy is enforced by joining villa→project→organizations, exactly like
 * loadVillaExpenses / the cabinet queries):
 *
 *   1) VILLA-ATTRIBUTED — expense_lines.villa_id = this villa, cost_bearer in
 *      ('owner','shared_pool'), owner_chargeable = true. The caller share-splits
 *      these by the owner's ownership percent (so co-owned villas split per %).
 *
 *   2) SHARED_POOL — expense_lines.allocation_scope = 'project_pool',
 *      project_id = this villa's project, cost_bearer = 'shared_pool'. These are
 *      complex-wide (no villa_id). Each villa in the complex bears an equal
 *      per-villa share; this villa's slice = lineAmount / villaCount. The caller
 *      then applies this owner's villa share percent on top. Individually-owned
 *      villas are NOT dropped — they each carry their per-villa slice.
 *
 * Amounts converted to IDR minor with the line's stored fx_rate (matching
 * loadVillaExpenses). `perVillaFactor` is pre-applied for shared_pool lines;
 * villa-attributed lines carry perVillaFactor = 1. The caller multiplies by the
 * owner's share percent for the final owner-borne amount.
 */
interface ChargeableExpenseRow {
  id: string;
  description: string;
  categoryKey: string;
  amountIdrMinor: bigint;
  /** Fraction already applied for complex apportionment (1 for villa lines). */
  perVillaFactor: number;
  bearer: string;
}

async function countVillasInProject(
  db: NonNullable<ReturnType<typeof getDb>>,
  orgId: string,
  projectId: string,
): Promise<number> {
  const rows = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n
      FROM villas v
      JOIN projects p ON p.id = v.project_id
     WHERE v.project_id = ${projectId}::uuid
       AND p.organization_id = ${orgId}::uuid
  `);
  const r = rowsOf<{ n: string }>(rows)[0];
  return Math.max(1, Number(r?.n ?? "1"));
}

function expenseLineToIdrMinor(amountMinorRaw: string, currency: string, fxRate: string | null): bigint {
  let amountIdrMinor = BigInt(amountMinorRaw ?? "0");
  if (currency !== "IDR") {
    const fx = Number(fxRate ?? FX_USD_TO_IDR_FALLBACK);
    amountIdrMinor = BigInt(Math.round((Number(amountIdrMinor) / 100) * fx * 100));
  }
  return amountIdrMinor;
}

async function loadOwnerChargeableExpenseLines(
  db: NonNullable<ReturnType<typeof getDb>>,
  orgId: string,
  villaId: string,
  projectId: string | null,
  periodMonth: string,
): Promise<ChargeableExpenseRow[]> {
  const out: ChargeableExpenseRow[] = [];

  // 1) Villa-attributed owner-chargeable lines (owner | shared_pool bearer).
  //    Org-scoped via villa→project→organizations.
  const villaRows = await db.execute<{
    id: string;
    description: string;
    expense_type: string;
    amount_minor: string;
    currency: string;
    fx_rate: string | null;
    cost_bearer: string;
  }>(sql`
    SELECT el.id::text          AS id,
           el.description        AS description,
           el.expense_type       AS expense_type,
           el.amount_minor::text AS amount_minor,
           el.currency           AS currency,
           NULL::text            AS fx_rate,
           el.cost_bearer        AS cost_bearer
      FROM expense_lines el
      JOIN villas v ON v.id = el.villa_id
      JOIN projects p ON p.id = v.project_id
     WHERE el.villa_id = ${villaId}::uuid
       AND p.organization_id = ${orgId}::uuid
       AND el.status = 'posted'
       AND el.owner_chargeable = true
       AND el.cost_bearer IN ('owner','shared_pool')
       AND date_trunc('month', el.expense_date)::date = ${periodMonth}::date
     ORDER BY el.expense_date ASC
     LIMIT 200
  `);
  for (const r of rowsOf<{
    id: string;
    description: string;
    expense_type: string;
    amount_minor: string;
    currency: string;
    fx_rate: string | null;
    cost_bearer: string;
  }>(villaRows)) {
    out.push({
      id: r.id,
      description: r.description?.replace(/^\[DEMO\] /, "").replace(/^\[DEMO2\] /, "") ?? "Expense",
      categoryKey: r.expense_type ?? "expense",
      amountIdrMinor: expenseLineToIdrMinor(r.amount_minor, r.currency, r.fx_rate),
      perVillaFactor: 1,
      bearer: r.cost_bearer,
    });
  }

  // 2) Shared-pool complex-wide lines (no villa_id; allocation_scope project_pool).
  //    Apportion equally across the complex's villas, then the caller applies the
  //    owner's per-villa share percent. Individually-owned villas keep their slice.
  if (projectId) {
    const villaCount = await countVillasInProject(db, orgId, projectId);
    const perVillaFactor = 1 / villaCount;
    const poolRows = await db.execute<{
      id: string;
      description: string;
      expense_type: string;
      amount_minor: string;
      currency: string;
      fx_rate: string | null;
      cost_bearer: string;
    }>(sql`
      SELECT el.id::text          AS id,
             el.description        AS description,
             el.expense_type       AS expense_type,
             el.amount_minor::text AS amount_minor,
             el.currency           AS currency,
             NULL::text            AS fx_rate,
             el.cost_bearer        AS cost_bearer
        FROM expense_lines el
        JOIN projects p ON p.id = el.project_id
       WHERE el.project_id = ${projectId}::uuid
         AND p.organization_id = ${orgId}::uuid
         AND el.status = 'posted'
         AND el.owner_chargeable = true
         AND el.allocation_scope = 'project_pool'
         AND el.cost_bearer = 'shared_pool'
         AND date_trunc('month', el.expense_date)::date = ${periodMonth}::date
       ORDER BY el.expense_date ASC
       LIMIT 200
    `);
    for (const r of rowsOf<{
      id: string;
      description: string;
      expense_type: string;
      amount_minor: string;
      currency: string;
      fx_rate: string | null;
      cost_bearer: string;
    }>(poolRows)) {
      out.push({
        id: r.id,
        description: r.description?.replace(/^\[DEMO\] /, "").replace(/^\[DEMO2\] /, "") ?? "Shared cost",
        categoryKey: `${r.expense_type ?? "expense"} (shared)`,
        amountIdrMinor: expenseLineToIdrMinor(r.amount_minor, r.currency, r.fx_rate),
        perVillaFactor,
        bearer: r.cost_bearer,
      });
    }
  }

  return out;
}

export async function generateStatementForOwnerVilla(
  orgId: string,
  ownerId: string,
  villaId: string,
  periodMonth: string,
  opts: { commissionPct?: number; createdBy?: string | null } = {},
): Promise<GeneratedStatementSummary | null> {
  const db = getDb();
  if (!db) throw new Error("DB not configured");

  // TENANCY-FINANCE — org boundary FIRST: reject when this villa is not in the
  // caller's org. loadContext/loadBookings carry no org predicate, so without
  // this a foreign (ownerId, villaId) pair would build a statement from another
  // org's bookings/expenses and stamp it with `orgId`.
  const villaScope = await resolveProjectIdForOrg(db, orgId, villaId);
  if (!villaScope.ok) return null;
  const projectId = villaScope.projectId;

  const ctx = await loadContext(db, orgId, ownerId, villaId);
  if (!ctx) return null;
  // Commission precedence: explicit caller override → the persisted per-owner
  // rate (owners.commission_pct, migration 0169) → the 20% platform default.
  const commissionPct =
    opts.commissionPct ?? ctx.ownerCommissionPct ?? DEFAULT_OPERATOR_COMMISSION;
  // FX-CALLERS-1: resolve live USD→IDR rate at generation time and
  // snapshot it on the statement row. Falls back to pinned 15,800
  // when ALPHAVANTAGE_API_KEY is missing or the API is rate-limited.
  const { getUsdToIdr } = await import("@/features/integrations/fx-service");
  const fxUsdToIdr = (await getUsdToIdr().catch(() => FX_USD_TO_IDR_FALLBACK)) || FX_USD_TO_IDR_FALLBACK;
  const bookings = await loadBookings(db, villaId, periodMonth, fxUsdToIdr);
  if (bookings.length === 0) return null;
  const expenses = await loadVillaExpenses(db, orgId, projectId, periodMonth);
  // STAFF-COST-MODEL phase 2 — owner-chargeable expense_lines (incl. payroll
  // staff costs + shared-pool complex costs) now reach the production path.
  const chargeableExpenseLines = await loadOwnerChargeableExpenseLines(
    db,
    orgId,
    villaId,
    projectId,
    periodMonth,
  );

  const sharePctFactor = ctx.sharePercent / 100;
  const lines: DraftLine[] = [];
  let sortOrder = 0;

  let grossMinor = 0n;
  let channelFeeMinor = 0n;
  for (const b of bookings) {
    const ownerGross = BigInt(
      Math.round(Number(b.grossIdrMinor) * sharePctFactor),
    );
    const ownerChannelFee = BigInt(
      Math.round(Number(b.channelFeeIdrMinor) * sharePctFactor),
    );
    grossMinor += ownerGross;
    channelFeeMinor += ownerChannelFee;
    lines.push({
      lineType: "revenue",
      category: "revenue",
      description: `${b.bookingCode} · ${b.guestName ?? "Guest"} · ${b.nights}n from ${b.checkIn}`,
      amountMinor: ownerGross,
      sourceTable: "bookings",
      sourceId: b.id,
      sortOrder: sortOrder++,
    });
  }

  if (channelFeeMinor > 0n) {
    lines.push({
      lineType: "fee",
      category: "fees",
      description: "Channel commission (OTA fees)",
      amountMinor: -channelFeeMinor,
      sourceTable: null,
      sourceId: null,
      sortOrder: sortOrder++,
    });
  }

  let expenseMinor = 0n;
  for (const e of expenses) {
    const ownerShare = BigInt(Math.round(Number(e.amountIdrMinor) * sharePctFactor));
    expenseMinor += ownerShare;
    lines.push({
      lineType: "expense",
      category: "expenses",
      description: `${e.categoryKey} · ${e.description}`,
      amountMinor: -ownerShare,
      sourceTable: "dev_transactions",
      sourceId: e.id,
      sortOrder: sortOrder++,
    });
  }

  // STAFF-COST-MODEL phase 2 — owner-chargeable expense_lines (payroll staff
  // costs + shared-pool complex costs). Each line's owner-borne amount =
  // lineAmount × perVillaFactor (1 for villa lines, 1/villaCount for shared-pool)
  // × this owner's share percent. Additional NEGATIVE expense lines; revenue,
  // commission, tax + reserve math are all unchanged.
  for (const e of chargeableExpenseLines) {
    const ownerShare = BigInt(
      Math.round(Number(e.amountIdrMinor) * e.perVillaFactor * sharePctFactor),
    );
    if (ownerShare === 0n) continue;
    expenseMinor += ownerShare;
    lines.push({
      lineType: "expense",
      category: "expenses",
      description: `${e.categoryKey} · ${e.description}`,
      amountMinor: -ownerShare,
      sourceTable: "expense_lines",
      sourceId: e.id,
      sortOrder: sortOrder++,
    });
  }

  // Statutory tax line
  const taxMinor = BigInt(Math.round(Number(grossMinor) * TAX_PCT));
  if (taxMinor > 0n) {
    lines.push({
      lineType: "tax",
      category: "taxes",
      description: `Indonesian PB1 + VAT (${(TAX_PCT * 100).toFixed(0)}%)`,
      amountMinor: -taxMinor,
      sourceTable: null,
      sourceId: null,
      sortOrder: sortOrder++,
    });
  }

  // Reserve allocation
  const reserveMinor = BigInt(Math.round(Number(grossMinor) * RESERVE_PCT));
  if (reserveMinor > 0n) {
    lines.push({
      lineType: "reserve",
      category: "reserves",
      description: `Renovation reserve (${(RESERVE_PCT * 100).toFixed(0)}%)`,
      amountMinor: -reserveMinor,
      sourceTable: null,
      sourceId: null,
      sortOrder: sortOrder++,
    });
  }

  // Operator management fee
  const operatorFeeMinor = BigInt(Math.round(Number(grossMinor) * commissionPct));
  lines.push({
    lineType: "management_fee",
    category: "fee_mgmt",
    description: `Operator management fee (${(commissionPct * 100).toFixed(0)}%)`,
    amountMinor: -operatorFeeMinor,
    sourceTable: null,
    sourceId: null,
    sortOrder: sortOrder++,
  });

  const netMinor =
    grossMinor - channelFeeMinor - expenseMinor - taxMinor - reserveMinor - operatorFeeMinor;
  const netUsdMinor = BigInt(Math.round((Number(netMinor) / 100) / fxUsdToIdr * 100));

  const contentHash = hashLines(periodMonth, lines);

  // Upsert statement.
  const periodId = await resolveOrCreatePeriod(db, periodMonth);
  const statementCode = `STM-${periodMonth.replace(/-/g, "").slice(0, 6)}-${ownerId.slice(0, 4)}-${villaId.slice(0, 4)}`;

  // Idempotency: delete existing statement (cascade clears lines) then re-insert.
  await db.execute(sql`
    DELETE FROM owner_statements
     WHERE organization_id = ${orgId}::uuid
       AND owner_id = ${ownerId}::uuid
       AND villa_id = ${villaId}::uuid
       AND period_month = ${periodMonth}::date
  `);

  const [statementRow] = await db
    .insert(ownerStatements)
    .values({
      organizationId: orgId,
      ownerId,
      villaId,
      periodId,
      periodMonth,
      statementCode,
      managementModel: ctx.managementModel,
      currency: "IDR",
      grossRevenueMinor: grossMinor,
      totalFeesMinor: channelFeeMinor,
      totalExpensesMinor: expenseMinor,
      totalTaxesMinor: taxMinor,
      totalReservesMinor: reserveMinor,
      managementFeeMinor: operatorFeeMinor,
      netPayoutMinor: netMinor,
      operatorCommissionPct: String(commissionPct),
      fxRateSnapshot: String(fxUsdToIdr),
      netToOwnerUsdMinor: netUsdMinor,
      contentHash,
      status: "draft",
      createdBy: opts.createdBy ?? null,
    })
    .returning({ id: ownerStatements.id });

  await db.insert(statementLines).values(
    lines.map((l) => ({
      statementId: statementRow!.id,
      lineType: l.lineType,
      sourceTable: l.sourceTable,
      sourceId: l.sourceId,
      category: l.category,
      description: l.description,
      amountMinor: l.amountMinor,
      currency: "IDR",
      ownerVisible: true,
      sortOrder: l.sortOrder,
    })),
  );

  return {
    statementId: statementRow!.id,
    ownerId,
    villaId,
    periodMonth,
    grossIdrMinor: grossMinor,
    netToOwnerIdrMinor: netMinor,
    netToOwnerUsdMinor: netUsdMinor,
    contentHash,
    linesCount: lines.length,
  };
}

export async function generateAllPendingStatements(
  periodMonth: string,
): Promise<GeneratedStatementSummary[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  // Every owner × villa with an active ownership_share AND at least
  // one booking that lands in the requested month — SCOPED to the caller's org.
  // TENANCY-FINANCE: ownership_shares/bookings carry no organization_id, so the
  // org boundary is enforced by joining villa→project and requiring
  // p.organization_id = orgId (mirroring the per-org cron loop in
  // src/app/api/cron/statements-monthly/route.ts). Without this an operator could
  // materialise another tenant's owner/villa statements (+ booking-derived
  // financials) stamped with their OWN organization_id.
  const rows = await db.execute<{ owner_id: string; villa_id: string }>(sql`
    SELECT DISTINCT os.owner_id::text AS owner_id, b.villa_id::text AS villa_id
      FROM ownership_shares os
      JOIN bookings b ON b.villa_id = os.villa_id
      JOIN villas v ON v.id = b.villa_id
      JOIN projects p ON p.id = v.project_id
     WHERE p.organization_id = ${orgId}::uuid
       AND os.status = 'active'
       AND b.status IN ('confirmed','checked_in','checked_out')
       AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
  `);
  const targets = rowsOf<{ owner_id: string; villa_id: string }>(rows);

  const results: GeneratedStatementSummary[] = [];
  for (const t of targets) {
    const r = await generateStatementForOwnerVilla(orgId, t.owner_id, t.villa_id, periodMonth);
    if (r) results.push(r);
  }
  return results;
}

export async function getStatementById(statementId: string) {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();
  const [statement] = await db
    .select()
    .from(ownerStatements)
    .where(
      and(eq(ownerStatements.id, statementId), eq(ownerStatements.organizationId, orgId)),
    )
    .limit(1);
  if (!statement) return null;
  const lines = await db
    .select()
    .from(statementLines)
    .where(eq(statementLines.statementId, statementId))
    .orderBy(statementLines.sortOrder);
  return { statement, lines };
}

export async function listStatementsForOrg(opts?: {
  limit?: number;
  periodMonth?: string;
  status?: string;
}): Promise<typeof ownerStatements.$inferSelect[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const conds = [eq(ownerStatements.organizationId, orgId)];
  if (opts?.periodMonth) conds.push(eq(ownerStatements.periodMonth, opts.periodMonth));
  if (opts?.status) conds.push(eq(ownerStatements.status, opts.status));
  return db
    .select()
    .from(ownerStatements)
    .where(and(...conds))
    .orderBy(sql`${ownerStatements.periodMonth} DESC NULLS LAST, ${ownerStatements.createdAt} DESC`)
    .limit(opts?.limit ?? 50);
}
