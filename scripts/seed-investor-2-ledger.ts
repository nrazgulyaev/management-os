#!/usr/bin/env tsx
/**
 * INVESTOR-2 LEDGER BACKFILL — Append-only ledger reconstruction.
 * NEVER FOR PRODUCTION USE.
 *
 * DEMO-3-INVESTOR explicitly skipped two tables:
 *   - distribution_allocations (per-commitment shares of each distribution)
 *   - wallet_transactions (the append-only ledger entries that explain
 *     the investor_wallets balances row-by-row)
 *
 * This backfill reconstructs both from the data DEMO-3 already seeded:
 *   1. For each `distributions` row in 'completed' status, generate a
 *      `distribution_allocations` row per active commitment in that
 *      project, prorated by committed_amount_usd_minor.
 *   2. For each commitment with seeded drawdowns + allocations, replay
 *      the events chronologically and INSERT `wallet_transactions`
 *      entries with correct running balances. transactionType mirrors
 *      the production schema enum: 'drawdown_received' for capital
 *      calls, 'profit_distribution'/'capital_return' for distribution
 *      receipts.
 *
 * Idempotent:
 *   - Skips allocations that already exist for (distribution_id, commitment_id)
 *   - Skips wallet_transactions where matching (wallet_id, reference, type) row exists
 *
 *   npm run seed:investor-2-ledger
 *   npm run seed:investor-2-ledger -- --wipe   # remove DEMO3-INV ledger rows first
 *   npm run seed:investor-2-ledger -- --org=<uuid>
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";

interface Args {
  wipe: boolean;
  orgId: string;
}

function parseArgs(argv: string[]): Args {
  const a = argv.slice(2);
  const orgArg = a.find((x) => x.startsWith("--org="));
  return {
    wipe: a.includes("--wipe"),
    orgId: orgArg ? orgArg.split("=", 2)[1] : ARCONIQUE_ORG_ID,
  };
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

async function wipe(db: ReturnType<typeof getDb>, orgId: string): Promise<void> {
  console.log("wiping INVESTOR-2 ledger rows for org", orgId);

  const a = await db.execute(sql`
    DELETE FROM wallet_transactions
     WHERE wallet_id IN (
       SELECT w.id FROM investor_wallets w
        WHERE w.commitment_id IN (
          SELECT id FROM capital_commitments WHERE commitment_code LIKE 'DEMO3-INV-%'
        )
     )
  `);
  console.log("  wallet_transactions:", (a as unknown as { count?: number }).count ?? "?");

  const b = await db.execute(sql`
    DELETE FROM distribution_allocations
     WHERE distribution_id IN (
       SELECT id FROM distributions WHERE notes LIKE 'DEMO3-INV%'
     )
  `);
  console.log("  distribution_allocations:", (b as unknown as { count?: number }).count ?? "?");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log("INVESTOR-2 LEDGER BACKFILL — org:", args.orgId);
  const db = getDb();

  if (args.wipe) {
    await wipe(db, args.orgId);
  }

  // 1) distribution_allocations — one row per (distribution, commitment).
  //    For each completed distribution in this org, find all active
  //    commitments in the same project, compute pro-rata share, INSERT.
  //
  //    DEMO-3 modeled all distributions as profit-only (no capital_return
  //    component), so split:
  //      capital_return_amount = 0
  //      profit_amount = total_amount * commitment_share
  //      total_amount = profit_amount
  console.log("\nbackfilling distribution_allocations...");
  const distRows = asRows<{
    id: string;
    project_id: string;
    total_amount: string;
    distribution_type: string;
  }>(await db.execute(sql`
    SELECT id::text                          AS id,
           project_id::text                  AS project_id,
           total_amount_usd_minor::text      AS total_amount,
           distribution_type                 AS distribution_type
      FROM distributions
     WHERE organization_id = ${args.orgId}::uuid
       AND status IN ('completed', 'declared', 'executing')
  `));
  console.log(`  ${distRows.length} distributions to process`);

  let nAllocs = 0;
  for (const d of distRows) {
    const commits = asRows<{
      id: string;
      committed: string;
      drawn: string;
      profit_share: string;
    }>(await db.execute(sql`
      SELECT cc.id::text                                  AS id,
             cc.committed_amount_usd_minor::text           AS committed,
             COALESCE((SELECT SUM(amount_usd_minor)::text
                         FROM capital_drawdowns
                        WHERE commitment_id = cc.id
                          AND status = 'received'), '0')   AS drawn,
             COALESCE(cc.profit_share_percent::text, '0')  AS profit_share
        FROM capital_commitments cc
       WHERE cc.project_id = ${d.project_id}::uuid
         AND cc.status = 'active'
    `));
    if (commits.length === 0) continue;
    const totalCommitted = commits.reduce(
      (s, c) => s + BigInt(c.committed),
      0n,
    );
    if (totalCommitted === 0n) continue;
    const distTotal = BigInt(d.total_amount);

    for (const c of commits) {
      // Skip if allocation already exists
      const existing = asRows<{ id: string }>(await db.execute(sql`
        SELECT id::text AS id
          FROM distribution_allocations
         WHERE distribution_id = ${d.id}::uuid
           AND commitment_id = ${c.id}::uuid
         LIMIT 1
      `));
      if (existing[0]) continue;

      // Pro-rata by committed amount. BigInt division loses fractional cents
      // but DEMO data isn't precision-critical.
      const share =
        (distTotal * BigInt(c.committed)) / totalCommitted;
      if (share === 0n) continue;

      const capReturn =
        d.distribution_type === "capital_return" ? share : 0n;
      const profit = d.distribution_type === "capital_return" ? 0n : share;
      const outstanding = BigInt(c.drawn);
      const profitSharePct = c.profit_share || "0";

      await db.execute(sql`
        INSERT INTO distribution_allocations (
          distribution_id, commitment_id,
          capital_return_amount_usd_minor, profit_amount_usd_minor,
          total_amount_usd_minor,
          outstanding_capital_at_declare_usd_minor,
          profit_share_percent_used, status
        ) VALUES (
          ${d.id}::uuid, ${c.id}::uuid,
          ${capReturn.toString()}::bigint, ${profit.toString()}::bigint,
          ${(capReturn + profit).toString()}::bigint,
          ${outstanding.toString()}::bigint,
          ${profitSharePct}::numeric, 'executed'
        )
      `);
      nAllocs++;
    }
  }
  console.log(`  ${nAllocs} distribution_allocations inserted`);

  // 2) wallet_transactions — replay each wallet's history chronologically.
  //    Events:
  //      a) Each received drawdown → transactionType='drawdown_received',
  //         amount = +drawdown.amount_usd_minor (positive: capital arriving
  //         in the investor's commitment)
  //      b) Each distribution_allocation → transactionType='profit_distribution'
  //         (or 'capital_return' for capital_return distributions),
  //         amount = +allocation.total_amount_usd_minor
  //
  //    Running balance: available_balance starts at 0, increments by each
  //    inflow. (DEMO-3 doesn't model wallet outflows — those come from
  //    PAYOUT-1 when bank rails wire up.)
  console.log("\nbackfilling wallet_transactions...");
  const wallets = asRows<{
    id: string;
    commitment_id: string;
  }>(await db.execute(sql`
    SELECT w.id::text             AS id,
           w.commitment_id::text   AS commitment_id
      FROM investor_wallets w
     WHERE w.organization_id = ${args.orgId}::uuid
  `));
  console.log(`  ${wallets.length} wallets to process`);

  let nTx = 0;
  for (const w of wallets) {
    // Gather events: drawdowns + allocations for this commitment
    const drawdowns = asRows<{
      id: string;
      amount: string;
      occurred_at: string;
    }>(await db.execute(sql`
      SELECT id::text                                   AS id,
             amount_usd_minor::text                     AS amount,
             COALESCE(received_at, due_date)::text      AS occurred_at
        FROM capital_drawdowns
       WHERE commitment_id = ${w.commitment_id}::uuid
         AND status = 'received'
       ORDER BY COALESCE(received_at, due_date) ASC
    `));

    const allocations = asRows<{
      id: string;
      cap: string;
      profit: string;
      total: string;
      dist_id: string;
      dist_type: string;
      effective_date: string;
    }>(await db.execute(sql`
      SELECT a.id::text                              AS id,
             a.capital_return_amount_usd_minor::text AS cap,
             a.profit_amount_usd_minor::text         AS profit,
             a.total_amount_usd_minor::text          AS total,
             a.distribution_id::text                 AS dist_id,
             d.distribution_type                     AS dist_type,
             d.effective_date::text                  AS effective_date
        FROM distribution_allocations a
        JOIN distributions d ON d.id = a.distribution_id
       WHERE a.commitment_id = ${w.commitment_id}::uuid
       ORDER BY d.effective_date ASC
    `));

    // Merge sorted by date; drawdowns first if same date (capital must
    // arrive before it's distributed).
    type Event =
      | { kind: "drawdown"; date: string; drawdownId: string; amount: bigint }
      | {
          kind: "alloc";
          date: string;
          allocId: string;
          distId: string;
          distType: string;
          cap: bigint;
          profit: bigint;
        };
    const events: Event[] = [];
    for (const d of drawdowns) {
      events.push({
        kind: "drawdown",
        date: d.occurred_at,
        drawdownId: d.id,
        amount: BigInt(d.amount),
      });
    }
    for (const a of allocations) {
      events.push({
        kind: "alloc",
        date: a.effective_date,
        allocId: a.id,
        distId: a.dist_id,
        distType: a.dist_type,
        cap: BigInt(a.cap),
        profit: BigInt(a.profit),
      });
    }
    events.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Drawdowns before allocations on the same date
      if (a.kind === "drawdown" && b.kind === "alloc") return -1;
      if (a.kind === "alloc" && b.kind === "drawdown") return 1;
      return 0;
    });

    let runningAvail = 0n;
    for (const ev of events) {
      if (ev.kind === "drawdown") {
        // Idempotency check
        const existing = asRows<{ id: string }>(await db.execute(sql`
          SELECT id::text AS id
            FROM wallet_transactions
           WHERE wallet_id = ${w.id}::uuid
             AND drawdown_id = ${ev.drawdownId}::uuid
             AND transaction_type = 'drawdown_received'
           LIMIT 1
        `));
        if (existing[0]) continue;

        runningAvail += ev.amount;
        await db.execute(sql`
          INSERT INTO wallet_transactions (
            wallet_id, commitment_id, transaction_type,
            amount_usd_minor,
            balance_available_after_usd_minor, balance_hold_after_usd_minor,
            drawdown_id, description, occurred_at
          ) VALUES (
            ${w.id}::uuid, ${w.commitment_id}::uuid, 'drawdown_received',
            ${ev.amount.toString()}::bigint,
            ${runningAvail.toString()}::bigint, 0::bigint,
            ${ev.drawdownId}::uuid,
            'Drawdown received (INVESTOR-2 backfill)',
            ${ev.date}::timestamptz
          )
        `);
        nTx++;
      } else {
        // Allocation can emit up to 2 rows (capital_return + profit_distribution)
        if (ev.cap > 0n) {
          const existing = asRows<{ id: string }>(await db.execute(sql`
            SELECT id::text AS id
              FROM wallet_transactions
             WHERE wallet_id = ${w.id}::uuid
               AND distribution_id = ${ev.distId}::uuid
               AND transaction_type = 'capital_return'
             LIMIT 1
          `));
          if (!existing[0]) {
            runningAvail += ev.cap;
            await db.execute(sql`
              INSERT INTO wallet_transactions (
                wallet_id, commitment_id, transaction_type,
                amount_usd_minor,
                balance_available_after_usd_minor, balance_hold_after_usd_minor,
                distribution_id, description, occurred_at
              ) VALUES (
                ${w.id}::uuid, ${w.commitment_id}::uuid, 'capital_return',
                ${ev.cap.toString()}::bigint,
                ${runningAvail.toString()}::bigint, 0::bigint,
                ${ev.distId}::uuid,
                'Capital return (INVESTOR-2 backfill)',
                ${ev.date}::timestamptz
              )
            `);
            nTx++;
          }
        }
        if (ev.profit > 0n) {
          const existing = asRows<{ id: string }>(await db.execute(sql`
            SELECT id::text AS id
              FROM wallet_transactions
             WHERE wallet_id = ${w.id}::uuid
               AND distribution_id = ${ev.distId}::uuid
               AND transaction_type = 'profit_distribution'
             LIMIT 1
          `));
          if (!existing[0]) {
            runningAvail += ev.profit;
            await db.execute(sql`
              INSERT INTO wallet_transactions (
                wallet_id, commitment_id, transaction_type,
                amount_usd_minor,
                balance_available_after_usd_minor, balance_hold_after_usd_minor,
                distribution_id, description, occurred_at
              ) VALUES (
                ${w.id}::uuid, ${w.commitment_id}::uuid, 'profit_distribution',
                ${ev.profit.toString()}::bigint,
                ${runningAvail.toString()}::bigint, 0::bigint,
                ${ev.distId}::uuid,
                'Profit distribution (INVESTOR-2 backfill)',
                ${ev.date}::timestamptz
              )
            `);
            nTx++;
          }
        }
      }
    }
  }
  console.log(`  ${nTx} wallet_transactions inserted`);

  // 3) Mirror the running available balance into cash_balance_minor so the
  //    reinvest/withdraw UI surfaces (which key off cash_balance_minor per
  //    Stage 4.B.2 "separated balance buckets") have something to work with.
  //    Only update wallets where cash_balance is currently 0 — preserves any
  //    operator-set values.
  console.log("\nsetting cash_balance_minor from available_balance_usd_minor...");
  const cashUpd = await db.execute(sql`
    UPDATE investor_wallets
       SET cash_balance_minor = available_balance_usd_minor
     WHERE organization_id = ${args.orgId}::uuid
       AND cash_balance_minor = 0
       AND available_balance_usd_minor > 0
  `);
  console.log(
    `  ${(cashUpd as unknown as { count?: number }).count ?? "?"} wallets updated`,
  );

  console.log("\ndone.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
