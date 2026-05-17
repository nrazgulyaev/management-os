#!/usr/bin/env tsx
/**
 * STATEMENT-1 — Seed owner statements for the Arconique org.
 *
 * NEVER FOR PRODUCTION USE.
 *
 * Generates statements for the trailing 4 calendar months. Picks a
 * mix of statuses (`draft`, `approved`, `sent`) so the cabinet UI
 * shows a realistic workflow distribution.
 *
 *   npm run seed:statements          # generate trailing 4 months
 *   npm run seed:statements -- --wipe  # delete every owner_statement
 *                                       # for the target org first
 *
 * Self-contained: replicates the generation logic from
 * `src/features/finance/statement-generation.ts` against the
 * script-friendly Drizzle client (HF-9). Keeps the two in sync —
 * any future change to the canonical service should mirror here.
 */

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";
const FX_USD_TO_IDR = 15_800;
const DEFAULT_COMMISSION = 0.2;
const TAX_PCT = 0.11;
const RESERVE_PCT = 0.03;

interface Args { wipe: boolean; orgId: string; }

/** Drizzle's db.execute returns either an array (postgres-js driver) or a
 *  { rows } shape (node-postgres). Normalise here. */
function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const orgArg = args.find((a) => a.startsWith("--org="));
  return {
    wipe: args.includes("--wipe"),
    orgId: orgArg ? orgArg.split("=", 2)[1] : ARCONIQUE_ORG_ID,
  };
}

function previousMonthIso(monthsBack: number): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-01`;
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

function hashLines(periodMonth: string, lines: DraftLine[]): string {
  const payload = JSON.stringify({
    p: periodMonth,
    l: lines.map((l) => ({ t: l.lineType, c: l.category, d: l.description, a: l.amountMinor.toString() })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

async function generateOne(
  db: ReturnType<typeof getDb>,
  orgId: string,
  ownerId: string,
  villaId: string,
  periodMonth: string,
): Promise<string | null> {
  // Context: ownership share + project_id
  const ctxRow = await db.execute<{
    share_percent: string;
    management_model: string;
    project_id: string | null;
  }>(sql`
    SELECT os.share_percent::text AS share_percent,
           os.model               AS management_model,
           v.project_id::text     AS project_id
      FROM ownership_shares os
      JOIN villas v ON v.id = os.villa_id
     WHERE os.owner_id = ${ownerId}::uuid
       AND os.villa_id = ${villaId}::uuid
       AND os.status = 'active'
     LIMIT 1
  `);
  const ctx = asRows<{ share_percent: string; management_model: string; project_id: string | null }>(ctxRow)[0];
  if (!ctx) return null;
  const sharePctFactor = Number(ctx.share_percent) / 100;
  const managementModel = ctx.management_model ?? "individual";
  const projectId = ctx.project_id;

  // Bookings for villa in period
  const bRows = await db.execute<{
    id: string;
    booking_code: string;
    notes: string | null;
    check_in: string;
    nights: string;
    gross: string;
    channel_fee: string;
    currency: string;
  }>(sql`
    SELECT b.id::text                          AS id,
           b.booking_code                       AS booking_code,
           b.notes                              AS notes,
           b.check_in::text                     AS check_in,
           b.nights::text                       AS nights,
           b.gross_amount::text                 AS gross,
           b.channel_fee_amount::text           AS channel_fee,
           b.currency                           AS currency
      FROM bookings b
     WHERE b.villa_id = ${villaId}::uuid
       AND b.status IN ('confirmed','checked_in','checked_out')
       AND date_trunc('month', b.check_in)::date = ${periodMonth}::date
     ORDER BY b.check_in ASC
  `);
  const bookings = asRows<{
    id: string; booking_code: string; notes: string | null;
    check_in: string; nights: string; gross: string; channel_fee: string; currency: string;
  }>(bRows);
  if (bookings.length === 0) return null;

  // Expenses for project in period
  const eRows = projectId
    ? await db.execute<{
        id: string;
        description: string;
        category_name: string;
        amount_minor: string;
        currency: string;
        fx_rate: string | null;
      }>(sql`
        SELECT t.id::text                          AS id,
               COALESCE(t.description, c.display_name) AS description,
               c.display_name                       AS category_name,
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
         LIMIT 30
      `)
    : [];
  const expenses = asRows<{
    id: string; description: string; category_name: string; amount_minor: string; currency: string; fx_rate: string | null;
  }>(eRows);

  // Build lines
  const lines: DraftLine[] = [];
  let sortOrder = 0;
  let grossMinor = 0n;
  let channelFeeMinor = 0n;
  for (const b of bookings) {
    const isUsd = b.currency === "USD";
    const toIdrMinor = (units: number) =>
      BigInt(Math.round((isUsd ? units * FX_USD_TO_IDR : units) * 100));
    const ownerGross = BigInt(Math.round(Number(toIdrMinor(Number(b.gross || 0))) * sharePctFactor));
    const ownerChannelFee = BigInt(Math.round(Number(toIdrMinor(Number(b.channel_fee || 0))) * sharePctFactor));
    grossMinor += ownerGross;
    channelFeeMinor += ownerChannelFee;
    const guest = b.notes?.replace(/^\[DEMO2\] /, "").trim() ?? "Guest";
    lines.push({
      lineType: "revenue", category: "revenue",
      description: `${b.booking_code} · ${guest} · ${b.nights}n from ${b.check_in}`,
      amountMinor: ownerGross, sourceTable: "bookings", sourceId: b.id, sortOrder: sortOrder++,
    });
  }
  if (channelFeeMinor > 0n) {
    lines.push({
      lineType: "fee", category: "fees",
      description: "Channel commission (OTA fees)",
      amountMinor: -channelFeeMinor, sourceTable: null, sourceId: null, sortOrder: sortOrder++,
    });
  }
  let expenseMinor = 0n;
  for (const e of expenses) {
    let amountIdrMinor = BigInt(e.amount_minor ?? "0");
    if (e.currency !== "IDR") {
      const fx = Number(e.fx_rate ?? "16000");
      amountIdrMinor = BigInt(Math.round((Number(amountIdrMinor) / 100) * fx * 100));
    }
    const ownerShare = BigInt(Math.round(Number(amountIdrMinor) * sharePctFactor));
    expenseMinor += ownerShare;
    const desc = e.description?.replace(/^\[DEMO\] /, "").replace(/^\[DEMO2\] /, "") ?? "Expense";
    lines.push({
      lineType: "expense", category: "expenses",
      description: `${e.category_name} · ${desc}`,
      amountMinor: -ownerShare, sourceTable: "dev_transactions", sourceId: e.id, sortOrder: sortOrder++,
    });
  }
  const taxMinor = BigInt(Math.round(Number(grossMinor) * TAX_PCT));
  if (taxMinor > 0n) {
    lines.push({
      lineType: "tax", category: "taxes",
      description: `Indonesian PB1 + VAT (${(TAX_PCT * 100).toFixed(0)}%)`,
      amountMinor: -taxMinor, sourceTable: null, sourceId: null, sortOrder: sortOrder++,
    });
  }
  const reserveMinor = BigInt(Math.round(Number(grossMinor) * RESERVE_PCT));
  if (reserveMinor > 0n) {
    lines.push({
      lineType: "reserve", category: "reserves",
      description: `Renovation reserve (${(RESERVE_PCT * 100).toFixed(0)}%)`,
      amountMinor: -reserveMinor, sourceTable: null, sourceId: null, sortOrder: sortOrder++,
    });
  }
  const operatorFeeMinor = BigInt(Math.round(Number(grossMinor) * DEFAULT_COMMISSION));
  lines.push({
    lineType: "management_fee", category: "fee_mgmt",
    description: `Operator management fee (${(DEFAULT_COMMISSION * 100).toFixed(0)}%)`,
    amountMinor: -operatorFeeMinor, sourceTable: null, sourceId: null, sortOrder: sortOrder++,
  });
  const netMinor = grossMinor - channelFeeMinor - expenseMinor - taxMinor - reserveMinor - operatorFeeMinor;
  const netUsdMinor = BigInt(Math.round((Number(netMinor) / 100) / FX_USD_TO_IDR * 100));
  const contentHash = hashLines(periodMonth, lines);

  // Statement period
  const [y, m] = periodMonth.split("-").map(Number);
  const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "long", year: "numeric" });
  const pRow = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM statement_periods WHERE period_start = ${periodStart}::date LIMIT 1
  `);
  let periodId = asRows<{ id: string }>(pRow)[0]?.id;
  if (!periodId) {
    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO statement_periods (period_start, period_end, label, status)
      VALUES (${periodStart}::date, ${periodEnd}::date, ${label}, ${"open"})
      RETURNING id::text
    `);
    periodId = asRows<{ id: string }>(inserted)[0]?.id;
  }
  const statementCode = `STM-${periodMonth.replace(/-/g, "").slice(0, 6)}-${ownerId.slice(0, 4)}-${villaId.slice(0, 4)}`;

  // Idempotent delete + insert
  await db.execute(sql`
    DELETE FROM owner_statements
     WHERE organization_id = ${orgId}::uuid
       AND owner_id = ${ownerId}::uuid
       AND villa_id = ${villaId}::uuid
       AND period_month = ${periodMonth}::date
  `);

  const insertedStmt = await db.execute<{ id: string }>(sql`
    INSERT INTO owner_statements (
      organization_id, owner_id, villa_id, period_id, period_month,
      statement_code, management_model, currency,
      gross_revenue_minor, total_fees_minor, total_expenses_minor,
      total_taxes_minor, total_reserves_minor, management_fee_minor, net_payout_minor,
      operator_commission_pct, fx_rate_snapshot, net_to_owner_usd_minor,
      content_hash, status
    ) VALUES (
      ${orgId}::uuid, ${ownerId}::uuid, ${villaId}::uuid, ${periodId}::uuid, ${periodMonth}::date,
      ${statementCode}, ${managementModel}, ${"IDR"},
      ${grossMinor.toString()}::bigint, ${channelFeeMinor.toString()}::bigint, ${expenseMinor.toString()}::bigint,
      ${taxMinor.toString()}::bigint, ${reserveMinor.toString()}::bigint, ${operatorFeeMinor.toString()}::bigint, ${netMinor.toString()}::bigint,
      ${DEFAULT_COMMISSION}::numeric, ${FX_USD_TO_IDR}::numeric, ${netUsdMinor.toString()}::bigint,
      ${contentHash}, ${"draft"}
    )
    RETURNING id::text
  `);
  const statementId = asRows<{ id: string }>(insertedStmt)[0]?.id;
  if (!statementId) return null;

  // Insert lines (parametrise per row to keep SQL simple)
  for (const l of lines) {
    await db.execute(sql`
      INSERT INTO statement_lines
        (statement_id, line_type, source_table, source_id, category,
         description, amount_minor, currency, owner_visible, sort_order)
      VALUES
        (${statementId}::uuid, ${l.lineType}, ${l.sourceTable}, ${l.sourceId ?? null},
         ${l.category}, ${l.description}, ${l.amountMinor.toString()}::bigint, ${"IDR"},
         ${true}, ${l.sortOrder})
    `);
  }
  return statementId;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const db = getDb();
  try {
    console.log("target org:", args.orgId);
    if (args.wipe) {
      console.log("wiping owner_statements + cascade lines...");
      const r = await db.execute(sql`
        DELETE FROM owner_statements WHERE organization_id = ${args.orgId}::uuid
      `);
      console.log("  deleted:", (r as unknown as { count?: number }).count ?? "?");
    }
    const periods = [previousMonthIso(0), previousMonthIso(1), previousMonthIso(2), previousMonthIso(3)];
    console.log("target periods:", periods.join(", "));
    let totalGenerated = 0;
    let totalAdvanced = 0;
    let idx = 0;
    for (const period of periods) {
      const targets = await db.execute<{ owner_id: string; villa_id: string }>(sql`
        SELECT DISTINCT os.owner_id::text AS owner_id, b.villa_id::text AS villa_id
          FROM ownership_shares os
          JOIN bookings b ON b.villa_id = os.villa_id
         WHERE os.status = 'active'
           AND b.status IN ('confirmed','checked_in','checked_out')
           AND date_trunc('month', b.check_in)::date = ${period}::date
      `);
      const rows = asRows<{ owner_id: string; villa_id: string }>(targets);
      console.log(`period ${period}: ${rows.length} owner×villa combos`);
      for (const t of rows) {
        try {
          const id = await generateOne(db, args.orgId, t.owner_id, t.villa_id, period);
          if (!id) continue;
          totalGenerated++;
          const bucket = idx++ % 10;
          if (period === periods[2] || period === periods[3]) {
            if (bucket < 6) {
              await db.execute(sql`
                UPDATE owner_statements
                   SET status = 'sent',
                       approved_at = NOW() - INTERVAL '5 days',
                       sent_at = NOW() - INTERVAL '3 days',
                       sent_to_email = 'owner@example.com'
                 WHERE id = ${id}::uuid
              `);
            } else {
              await db.execute(sql`
                UPDATE owner_statements SET status = 'approved', approved_at = NOW() - INTERVAL '2 days'
                 WHERE id = ${id}::uuid
              `);
            }
            totalAdvanced++;
          } else if (period === periods[1]) {
            if (bucket < 4) {
              await db.execute(sql`
                UPDATE owner_statements SET status = 'approved', approved_at = NOW() - INTERVAL '1 day'
                 WHERE id = ${id}::uuid
              `);
              totalAdvanced++;
            }
          }
        } catch (e) {
          console.warn(`  skip ${t.owner_id}/${t.villa_id}: ${(e as Error).message.slice(0, 90)}`);
        }
      }
    }
    console.log(`done. generated=${totalGenerated} statusAdvanced=${totalAdvanced}`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
