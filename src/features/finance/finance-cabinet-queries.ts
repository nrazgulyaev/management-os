import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
// SHAPE-FIX-1 / DAILY-DIGEST P0 — rowsOf handles postgres-js Array shape.
// TODO(DB-SHAPE-CODEMOD-1): adjacent files in this module still pending full sweep.
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS Finance cabinet read aggregates.
 *
 * Statement generation is the full STATEMENT-1 sprint (PDF, auto-send,
 * approval workflow, owner-portal delivery). For this cabinet we
 * compose a DECORATIVE "computed statement preview" from real seeded
 * data so the operator sees what a generated statement *would* look
 * like, without inventing fake numbers.
 *
 * The `owner_statements` / `statement_lines` / `payout_lines` tables
 * exist but are empty in DEMO-2 — they get populated by
 * `runStatementGenerator()` which is out of scope for this sprint.
 * Once STATEMENT-1 ships, this module will swap to reading those
 * tables and the preview-mode logic below becomes dead code.
 *
 * Finance tables have no `organization_id` (they sit above the
 * multi-tenancy line, same as bookings) — reads are tenant-wide.
 *
 * FX + commission constants kept consistent with
 * `dashboard-cabinet-queries.ts` (PART-1).
 */

const FX_USD_TO_IDR = 15_800;
const OPERATOR_COMMISSION = 0.2;
const CHANNEL_FEE_PCT = 0.15;
const TAX_PCT = 0.11;
const EXPENSE_PCT = 0.08;

function usdToIdrMinor(usd: number): bigint {
  return BigInt(Math.round(usd * FX_USD_TO_IDR * 100));
}

/**
 * Null-safe "Month YYYY" label from a YYYY-MM-DD period_month. The column is
 * nullable (the mgmt-side generator in statement-generator.ts persists periodId
 * but never period_month), so callers that read raw owner_statements rows must
 * not assume a value — an unguarded `.split("-")` here crashed the whole
 * Finance cabinet list/detail for any tenant that issued a statement via the
 * mgmt "Issue statement" form. Falls back to an em-dash, mirroring
 * dashboard-cabinet-queries.ts.
 */
function periodMonthLabel(periodMonth: string | null | undefined): string {
  if (!periodMonth) return "—";
  const [y, m] = periodMonth.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "—";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

export interface FinanceKpis {
  statementsPendingCount: number;
  payoutsAwaitingCount: number;
  totalNetMtdIdrMinor: bigint;
  avgStatementCycleDays: number | null;
}

export async function getFinanceKpis(): Promise<FinanceKpis> {
  const db = getDb();
  if (!db) {
    return {
      statementsPendingCount: 0,
      payoutsAwaitingCount: 0,
      totalNetMtdIdrMinor: 0n,
      avgStatementCycleDays: null,
    };
  }
  // TENANCY-FINANCE — scope every leg to the caller's org. bookings and
  // ownership_shares both carry organization_id; without these predicates
  // this aggregate scans (and leaks counts for) every tenant.
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) {
    return {
      statementsPendingCount: 0,
      payoutsAwaitingCount: 0,
      totalNetMtdIdrMinor: 0n,
      avgStatementCycleDays: null,
    };
  }
  // Statement tables are empty in DEMO-2. Approximate "pending statements"
  // by counting distinct owner × villa × month combinations that had
  // bookings in the current month — that's what *would* generate.
  // PERF (Phase 4): cache only the raw text row per-org for 120s; org resolved
  // OUTSIDE the cache, passed as a key-part. netMtdUsd arithmetic +
  // usdToIdrMinor() (→bigint) run live below — the cached row has zero bigint.
  const r = await unstable_cache(
    async () => {
      const cdb = getDb();
      if (!cdb) return null;
      const rows = await cdb.execute<{
        pending_statements: string;
        revenue_mtd: string;
      }>(sql`
    SELECT
      (SELECT COUNT(DISTINCT (os.owner_id, b.villa_id))::text
         FROM bookings b
         JOIN ownership_shares os ON os.villa_id = b.villa_id
        WHERE b.status IN ('confirmed','checked_in','checked_out')
          AND b.check_in >= date_trunc('month', CURRENT_DATE)::date
          AND os.status = 'active'
          AND b.organization_id = ${orgId}::uuid
          AND os.organization_id = ${orgId}::uuid) AS pending_statements,
      COALESCE((SELECT SUM(b.gross_amount)::text
         FROM bookings b
        WHERE b.status IN ('confirmed','checked_in','checked_out')
          AND b.check_in >= date_trunc('month', CURRENT_DATE)::date
          AND b.organization_id = ${orgId}::uuid), '0') AS revenue_mtd
  `);
      return (
        rowsOf<{
          pending_statements: string;
          revenue_mtd: string;
        }>(rows)[0] ?? null
      );
    },
    ["finance", "kpis", orgId],
    { revalidate: 120 },
  )();
  const grossMtdUsd = Number(r?.revenue_mtd ?? "0");
  const netMtdUsd = grossMtdUsd * (1 - OPERATOR_COMMISSION - CHANNEL_FEE_PCT - TAX_PCT - EXPENSE_PCT);
  return {
    statementsPendingCount: Number(r?.pending_statements ?? "0"),
    payoutsAwaitingCount: 0,
    totalNetMtdIdrMinor: usdToIdrMinor(Math.max(netMtdUsd, 0)),
    avgStatementCycleDays: null,
  };
}

export type StatementLineSection =
  | "revenue"
  | "fees"
  | "taxes"
  | "expenses"
  | "net";

export interface StatementLine {
  section: StatementLineSection;
  label: string;
  amountIdrMinor: bigint;
  hint: string | null;
}

export interface ComputedStatement {
  ownerName: string;
  villaCode: string;
  monthLabel: string;
  bookingsCount: number;
  totalNights: number;
  grossIdrMinor: bigint;
  netToOwnerIdrMinor: bigint;
  commissionPct: number;
  lines: StatementLine[];
  generatedAt: string;
  isPreview: true;
}

/**
 * Decorative: pick the owner × villa × month combo with the most
 * gross revenue in the trailing 90 days and synthesize a statement
 * preview from the underlying bookings. NOT real owner-statement
 * accounting — STATEMENT-1 will replace this read with
 * `services.getOwnerStatementById()`.
 */
export async function getDemoStatementPreview(): Promise<ComputedStatement | null> {
  const db = getDb();
  if (!db) return null;

  const targetRows = await db.execute<{
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string;
    month_iso: string;
    bookings_count: string;
    total_nights: string;
    gross_usd: string;
  }>(sql`
    SELECT o.id::text                              AS owner_id,
           o.display_name                          AS owner_name,
           v.id::text                              AS villa_id,
           v.unit_code                             AS villa_code,
           to_char(date_trunc('month', b.check_in), 'YYYY-MM') AS month_iso,
           COUNT(*)::text                          AS bookings_count,
           SUM(b.nights)::text                     AS total_nights,
           SUM(b.gross_amount)::text               AS gross_usd
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
      JOIN ownership_shares os ON os.villa_id = v.id AND os.status = 'active'
      JOIN owners o ON o.id = os.owner_id
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND b.check_in >= (CURRENT_DATE - INTERVAL '90 days')
     GROUP BY o.id, o.display_name, v.id, v.unit_code, month_iso
     ORDER BY SUM(b.gross_amount) DESC
     LIMIT 1
  `);
  const top = rowsOf<{
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string;
    month_iso: string;
    bookings_count: string;
    total_nights: string;
    gross_usd: string;
  }>(targetRows)[0];
  if (!top) return null;

  const grossUsd = Number(top.gross_usd || 0);
  const channelFeeUsd = grossUsd * CHANNEL_FEE_PCT;
  const taxUsd = grossUsd * TAX_PCT;
  const expensesUsd = grossUsd * EXPENSE_PCT;
  const operatorFeeUsd = grossUsd * OPERATOR_COMMISSION;
  const netUsd = grossUsd - channelFeeUsd - taxUsd - expensesUsd - operatorFeeUsd;
  const nights = Number(top.total_nights || 0);
  const bookings = Number(top.bookings_count || 0);
  const adr = nights > 0 ? grossUsd / nights : 0;

  const [year, month] = top.month_iso.split("-");
  const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleString(
    "en",
    { month: "long", year: "numeric" },
  );

  return {
    ownerName: top.owner_name,
    villaCode: top.villa_code,
    monthLabel,
    bookingsCount: bookings,
    totalNights: nights,
    grossIdrMinor: usdToIdrMinor(grossUsd),
    netToOwnerIdrMinor: usdToIdrMinor(netUsd),
    commissionPct: OPERATOR_COMMISSION * 100,
    isPreview: true,
    generatedAt: new Date().toISOString(),
    lines: [
      {
        section: "revenue",
        label: "Gross booking revenue",
        amountIdrMinor: usdToIdrMinor(grossUsd),
        hint: `${bookings} ${bookings === 1 ? "booking" : "bookings"} · ${nights} nights · ADR IDR ${(adr * FX_USD_TO_IDR / 1_000_000).toFixed(2)}M`,
      },
      {
        section: "fees",
        label: "Channel commission",
        amountIdrMinor: -usdToIdrMinor(channelFeeUsd),
        hint: `${(CHANNEL_FEE_PCT * 100).toFixed(0)}% blended OTA rate`,
      },
      {
        section: "fees",
        label: "Operator management fee",
        amountIdrMinor: -usdToIdrMinor(operatorFeeUsd),
        hint: `${(OPERATOR_COMMISSION * 100).toFixed(0)}% per contract`,
      },
      {
        section: "taxes",
        label: "Indonesian PB1 + VAT",
        amountIdrMinor: -usdToIdrMinor(taxUsd),
        hint: `${(TAX_PCT * 100).toFixed(0)}% blended`,
      },
      {
        section: "expenses",
        label: "Operational expenses (utilities, laundry, supplies)",
        amountIdrMinor: -usdToIdrMinor(expensesUsd),
        hint: `${(EXPENSE_PCT * 100).toFixed(0)}% of gross (proportional allocation)`,
      },
      {
        section: "net",
        label: "Net to owner",
        amountIdrMinor: usdToIdrMinor(netUsd),
        hint: "transferable balance",
      },
    ],
  };
}

export interface StatementListRow {
  id: string;
  ownerName: string;
  villaCode: string;
  monthLabel: string;
  netIdrMinor: bigint;
  state: "preview" | "draft" | "approved" | "settled";
}

/**
 * One synthesized row per (owner × villa × month) combination in the
 * trailing 6 months. All marked `preview` — STATEMENT-1 swaps this to
 * read `owner_statements`.
 */
export async function listStatementsPreview(limit = 6): Promise<StatementListRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string;
    month_iso: string;
    gross_usd: string;
  }>(sql`
    SELECT o.id::text                              AS owner_id,
           o.display_name                          AS owner_name,
           v.id::text                              AS villa_id,
           v.unit_code                             AS villa_code,
           to_char(date_trunc('month', b.check_in), 'YYYY-MM') AS month_iso,
           SUM(b.gross_amount)::text               AS gross_usd
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
      JOIN ownership_shares os ON os.villa_id = v.id AND os.status = 'active'
      JOIN owners o ON o.id = os.owner_id
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND b.check_in >= (date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')::date
     GROUP BY o.id, o.display_name, v.id, v.unit_code, month_iso
     ORDER BY month_iso DESC, SUM(b.gross_amount) DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string;
    month_iso: string;
    gross_usd: string;
  }>(rows).map((r) => {
    const grossUsd = Number(r.gross_usd || 0);
    const netUsd = grossUsd * (1 - OPERATOR_COMMISSION - CHANNEL_FEE_PCT - TAX_PCT - EXPENSE_PCT);
    const [year, month] = r.month_iso.split("-");
    const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleString(
      "en",
      { month: "short", year: "numeric" },
    );
    return {
      id: `preview-${r.owner_id.slice(0, 8)}-${r.villa_id.slice(0, 8)}-${r.month_iso}`,
      ownerName: r.owner_name,
      villaCode: r.villa_code,
      monthLabel,
      netIdrMinor: usdToIdrMinor(Math.max(netUsd, 0)),
      state: "preview" as const,
    };
  });
}

export interface PayoutQueueRow {
  id: string;
  ownerName: string;
  amountIdrMinor: bigint;
  method: string;
  scheduledFor: string;
  status: "queued" | "scheduled" | "settled";
}

/** `payout_lines` empty — payouts get generated when statements approve. */
export async function getPayoutsQueue(): Promise<PayoutQueueRow[]> {
  return [];
}

export interface WaterfallStage {
  label: string;
  pct: number;
  amountIdrMinor: bigint;
}

/** Decorative — computed from the demo preview totals. */
export function buildWaterfall(preview: ComputedStatement | null): WaterfallStage[] {
  if (!preview) return [];
  const gross = Number(preview.grossIdrMinor);
  if (gross === 0) return [];
  const pctOf = (v: bigint) => (Math.abs(Number(v)) / gross) * 100;
  return [
    { label: "Gross to villa", pct: 100, amountIdrMinor: preview.grossIdrMinor },
    ...preview.lines
      .filter((l) => l.section !== "revenue" && l.section !== "net")
      .map((l) => ({
        label: l.label,
        pct: Math.round(pctOf(l.amountIdrMinor) * 10) / 10,
        amountIdrMinor: l.amountIdrMinor,
      })),
    { label: "Net to owner", pct: Math.round((Number(preview.netToOwnerIdrMinor) / gross) * 1000) / 10, amountIdrMinor: preview.netToOwnerIdrMinor },
  ];
}

export interface MaterialBridgeNudge {
  consumedBookingsCount: number;
  pendingValueIdrMinor: bigint;
}

/** No `inventory_consumption_events` rows seeded — empty state. */
export async function getMaterialUsageBridgeNudge(): Promise<MaterialBridgeNudge | null> {
  return null;
}

// =============================================================================
// STATEMENT-1 — Live readers backed by the real owner_statements engine.
// =============================================================================

export interface RealStatementRow {
  id: string;
  statementCode: string;
  ownerId: string;
  ownerName: string;
  villaId: string;
  villaCode: string | null;
  periodMonth: string;
  monthLabel: string;
  grossIdrMinor: bigint;
  netToOwnerIdrMinor: bigint;
  netToOwnerUsdMinor: bigint;
  status: string;
  contentHash: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
}

export async function listOwnerStatementsLive(opts?: {
  limit?: number;
}): Promise<RealStatementRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    statement_code: string;
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string | null;
    period_month: string;
    gross_minor: string;
    net_minor: string;
    net_usd_minor: string | null;
    status: string;
    content_hash: string | null;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
  }>(sql`
    SELECT s.id::text                AS id,
           s.statement_code           AS statement_code,
           s.owner_id::text           AS owner_id,
           o.display_name             AS owner_name,
           s.villa_id::text           AS villa_id,
           v.unit_code                AS villa_code,
           s.period_month::text       AS period_month,
           s.gross_revenue_minor::text AS gross_minor,
           s.net_payout_minor::text   AS net_minor,
           s.net_to_owner_usd_minor::text AS net_usd_minor,
           s.status                   AS status,
           s.content_hash             AS content_hash,
           s.approved_at::text        AS approved_at,
           s.sent_at::text            AS sent_at,
           s.sent_to_email            AS sent_to_email
      FROM owner_statements s
      LEFT JOIN owners o ON o.id = s.owner_id
      LEFT JOIN villas v ON v.id = s.villa_id
     WHERE s.organization_id = ${orgId}::uuid
     ORDER BY s.period_month DESC NULLS LAST, s.created_at DESC
     LIMIT ${opts?.limit ?? 25}
  `);
  return rowsOf<{
    id: string;
    statement_code: string;
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string | null;
    period_month: string;
    gross_minor: string;
    net_minor: string;
    net_usd_minor: string | null;
    status: string;
    content_hash: string | null;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
  }>(rows).map((r) => {
    // period_month is nullable (the mgmt-side generator persists periodId but
    // NOT period_month). A NULL would crash `.split("-")` and take down the
    // whole Finance cabinet list — guard via the null-safe label helper.
    const monthLabel = periodMonthLabel(r.period_month);
    return {
      id: r.id,
      statementCode: r.statement_code,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      villaId: r.villa_id,
      villaCode: r.villa_code,
      periodMonth: r.period_month,
      monthLabel,
      grossIdrMinor: BigInt(r.gross_minor ?? "0"),
      netToOwnerIdrMinor: BigInt(r.net_minor ?? "0"),
      netToOwnerUsdMinor: BigInt(r.net_usd_minor ?? "0"),
      status: r.status,
      contentHash: r.content_hash,
      approvedAt: r.approved_at,
      sentAt: r.sent_at,
      sentToEmail: r.sent_to_email,
    };
  });
}

export interface RealStatementDetailLine {
  id: string;
  lineType: string;
  category: string;
  description: string;
  amountIdrMinor: bigint;
}

export interface RealStatementDetail extends RealStatementRow {
  lines: RealStatementDetailLine[];
  commissionPct: number;
}

export async function getOwnerStatementDetail(
  statementId: string,
): Promise<RealStatementDetail | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();
  const sRows = await db.execute<{
    id: string;
    statement_code: string;
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string | null;
    period_month: string;
    gross_minor: string;
    net_minor: string;
    net_usd_minor: string | null;
    status: string;
    content_hash: string | null;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    commission_pct: string | null;
  }>(sql`
    SELECT s.id::text                AS id,
           s.statement_code           AS statement_code,
           s.owner_id::text           AS owner_id,
           o.display_name             AS owner_name,
           s.villa_id::text           AS villa_id,
           v.unit_code                AS villa_code,
           s.period_month::text       AS period_month,
           s.gross_revenue_minor::text AS gross_minor,
           s.net_payout_minor::text   AS net_minor,
           s.net_to_owner_usd_minor::text AS net_usd_minor,
           s.status                   AS status,
           s.content_hash             AS content_hash,
           s.approved_at::text        AS approved_at,
           s.sent_at::text            AS sent_at,
           s.sent_to_email            AS sent_to_email,
           s.operator_commission_pct::text AS commission_pct
      FROM owner_statements s
      LEFT JOIN owners o ON o.id = s.owner_id
      LEFT JOIN villas v ON v.id = s.villa_id
     WHERE s.id = ${statementId}::uuid
       AND s.organization_id = ${orgId}::uuid
     LIMIT 1
  `);
  const sr = rowsOf<{
    id: string;
    statement_code: string;
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string | null;
    period_month: string;
    gross_minor: string;
    net_minor: string;
    net_usd_minor: string | null;
    status: string;
    content_hash: string | null;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    commission_pct: string | null;
  }>(sRows)[0];
  if (!sr) return null;

  const lRows = await db.execute<{
    id: string;
    line_type: string;
    category: string;
    description: string;
    amount_minor: string;
  }>(sql`
    SELECT id::text          AS id,
           line_type          AS line_type,
           category           AS category,
           description        AS description,
           amount_minor::text AS amount_minor
      FROM statement_lines
     WHERE statement_id = ${statementId}::uuid
     ORDER BY sort_order ASC
  `);
  const lines = rowsOf<{
    id: string;
    line_type: string;
    category: string;
    description: string;
    amount_minor: string;
  }>(lRows).map((l) => ({
    id: l.id,
    lineType: l.line_type,
    category: l.category,
    description: l.description,
    amountIdrMinor: BigInt(l.amount_minor ?? "0"),
  }));

  // period_month is nullable (mgmt-side generator persists periodId only).
  // Guard the formatter so a NULL value can't crash the Finance detail card.
  const monthLabel = periodMonthLabel(sr.period_month);

  return {
    id: sr.id,
    statementCode: sr.statement_code,
    ownerId: sr.owner_id,
    ownerName: sr.owner_name,
    villaId: sr.villa_id,
    villaCode: sr.villa_code,
    periodMonth: sr.period_month,
    monthLabel,
    grossIdrMinor: BigInt(sr.gross_minor ?? "0"),
    netToOwnerIdrMinor: BigInt(sr.net_minor ?? "0"),
    netToOwnerUsdMinor: BigInt(sr.net_usd_minor ?? "0"),
    status: sr.status,
    contentHash: sr.content_hash,
    approvedAt: sr.approved_at,
    sentAt: sr.sent_at,
    sentToEmail: sr.sent_to_email,
    commissionPct: Number(sr.commission_pct ?? "0.2") * 100,
    lines,
  };
}


// =============================================================================
// DAILY-DIGEST-SPRINT-1 P2 — date-scoped financial activity for the Daily
// Digest agent.
// =============================================================================

export interface DigestFinancialActivityForDate {
  date: string;
  bookingRevenueUsd: number;     // gross_amount summed over bookings created on date
  statementsApprovedCount: number;
  statementsSentCount: number;
  payoutsQueuedCount: number;    // approximate — count of approved-but-not-sent
}

/**
 * Day's financial pulse — booking-side revenue created on the date,
 * statement approval / sending activity, payout queue depth.
 *
 * Aggregated in a single round-trip so the agent gets one tool call's
 * worth of context. No org filter: see note in bookings file (same
 * schema gap applies).
 */
export async function getFinancialActivityForDate(input: {
  orgId: string;
  date: string;
}): Promise<DigestFinancialActivityForDate> {
  const db = getDb();
  if (!db) {
    return {
      date: input.date,
      bookingRevenueUsd: 0,
      statementsApprovedCount: 0,
      statementsSentCount: 0,
      payoutsQueuedCount: 0,
    };
  }

  const rows = await db.execute<{
    booking_revenue: string;
    stmts_approved: string;
    stmts_sent: string;
    payouts_queued: string;
  }>(sql`
    SELECT
      (SELECT COALESCE(SUM(gross_amount), 0)::text FROM bookings
        WHERE created_at::date = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS booking_revenue,
      (SELECT COUNT(*)::text FROM owner_statements
        WHERE approved_at::date = ${input.date}::date) AS stmts_approved,
      (SELECT COUNT(*)::text FROM owner_statements
        WHERE sent_at::date = ${input.date}::date) AS stmts_sent,
      (SELECT COUNT(*)::text FROM owner_statements
        WHERE status = 'approved' AND sent_at IS NULL) AS payouts_queued
  `);
  const r = rowsOf<{
    booking_revenue: string;
    stmts_approved: string;
    stmts_sent: string;
    payouts_queued: string;
  }>(rows)[0];

  return {
    date: input.date,
    bookingRevenueUsd: Number(r?.booking_revenue ?? "0"),
    statementsApprovedCount: Number(r?.stmts_approved ?? "0"),
    statementsSentCount: Number(r?.stmts_sent ?? "0"),
    payoutsQueuedCount: Number(r?.payouts_queued ?? "0"),
  };
}
