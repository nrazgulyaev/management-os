import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

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
  // Statement tables are empty in DEMO-2. Approximate "pending statements"
  // by counting distinct owner × villa × month combinations that had
  // bookings in the current month — that's what *would* generate.
  const rows = await db.execute<{
    pending_statements: string;
    revenue_mtd: string;
  }>(sql`
    SELECT
      (SELECT COUNT(DISTINCT (os.owner_id, b.villa_id))::text
         FROM bookings b
         JOIN ownership_shares os ON os.villa_id = b.villa_id
        WHERE b.status IN ('confirmed','checked_in','checked_out')
          AND b.check_in >= date_trunc('month', CURRENT_DATE)::date
          AND os.status = 'active') AS pending_statements,
      COALESCE((SELECT SUM(b.gross_amount)::text
         FROM bookings b
        WHERE b.status IN ('confirmed','checked_in','checked_out')
          AND b.check_in >= date_trunc('month', CURRENT_DATE)::date), '0') AS revenue_mtd
  `);
  const r = (rows as unknown as { rows: Array<{
    pending_statements: string;
    revenue_mtd: string;
  }> }).rows?.[0];
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
  const top = (targetRows as unknown as { rows: Array<{
    owner_id: string;
    owner_name: string;
    villa_id: string;
    villa_code: string;
    month_iso: string;
    bookings_count: string;
    total_nights: string;
    gross_usd: string;
  }> }).rows?.[0];
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
  return (
    (rows as unknown as { rows: Array<{
      owner_id: string;
      owner_name: string;
      villa_id: string;
      villa_code: string;
      month_iso: string;
      gross_usd: string;
    }> }).rows ?? []
  ).map((r) => {
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
