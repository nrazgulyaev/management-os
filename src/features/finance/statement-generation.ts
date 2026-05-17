import "server-only";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
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
  }>(sql`
    SELECT os.share_percent::text   AS share_percent,
           os.model                  AS management_model
      FROM ownership_shares os
     WHERE os.owner_id = ${ownerId}::uuid
       AND os.villa_id = ${villaId}::uuid
       AND os.status = 'active'
     LIMIT 1
  `);
  const r = (rows as unknown as { rows: Array<{ share_percent: string; management_model: string }> }).rows?.[0];
  if (!r) return null;
  return {
    ownerId,
    villaId,
    sharePercent: Number(r.share_percent),
    managementModel: r.management_model ?? "individual",
    currency: "IDR",
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
    (rows as unknown as { rows: Array<{
      id: string;
      booking_code: string;
      notes: string | null;
      check_in: string;
      nights: string;
      gross: string;
      channel_fee: string;
      currency: string;
    }> }).rows ?? []
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
    (rows as unknown as { rows: Array<{
      id: string;
      description: string;
      category_name: string;
      category_type: string;
      amount_minor: string;
      currency: string;
      fx_rate: string | null;
    }> }).rows ?? []
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

async function resolveProjectId(
  db: NonNullable<ReturnType<typeof getDb>>,
  villaId: string,
): Promise<string | null> {
  const rows = await db.execute<{ project_id: string | null }>(sql`
    SELECT project_id::text AS project_id FROM villas WHERE id = ${villaId}::uuid LIMIT 1
  `);
  const r = (rows as unknown as { rows: Array<{ project_id: string | null }> }).rows?.[0];
  return r?.project_id ?? null;
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

  const commissionPct = opts.commissionPct ?? DEFAULT_OPERATOR_COMMISSION;
  const ctx = await loadContext(db, orgId, ownerId, villaId);
  if (!ctx) return null;
  // FX-CALLERS-1: resolve live USD→IDR rate at generation time and
  // snapshot it on the statement row. Falls back to pinned 15,800
  // when ALPHAVANTAGE_API_KEY is missing or the API is rate-limited.
  const { getUsdToIdr } = await import("@/features/integrations/fx-service");
  const fxUsdToIdr = (await getUsdToIdr().catch(() => FX_USD_TO_IDR_FALLBACK)) || FX_USD_TO_IDR_FALLBACK;
  const projectId = await resolveProjectId(db, villaId);
  const bookings = await loadBookings(db, villaId, periodMonth, fxUsdToIdr);
  if (bookings.length === 0) return null;
  const expenses = await loadVillaExpenses(db, orgId, projectId, periodMonth);

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
  // one booking that lands in the requested month.
  const rows = await db.execute<{ owner_id: string; villa_id: string }>(sql`
    SELECT DISTINCT os.owner_id::text AS owner_id, b.villa_id::text AS villa_id
      FROM ownership_shares os
      JOIN bookings b ON b.villa_id = os.villa_id
     WHERE os.status = 'active'
       AND b.status IN ('confirmed','checked_in','checked_out')
       AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
  `);
  const targets = (rows as unknown as { rows: Array<{ owner_id: string; villa_id: string }> }).rows ?? [];

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
