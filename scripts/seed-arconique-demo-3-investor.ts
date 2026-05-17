#!/usr/bin/env tsx
/**
 * DEMO-3 INVESTOR — Seed the capital ledger cluster.
 * NEVER FOR PRODUCTION USE.
 *
 * Seeds the four investor schemas that DEMO-2 left empty:
 *   - capital_commitments      32 rows (8 investors × 4 villa projects)
 *   - capital_drawdowns        ~80 rows (2-3 per commitment, ≤ committed)
 *   - distributions            4 rows (1 per project, profit_distribution)
 *   - investor_wallets         32 rows (1 per commitment, running balance)
 *
 * Skipped (out of scope for the investor cabinet visual):
 *   - distribution_allocations — per-investor share is computed at read
 *     time from commitment.committed_amount × project distribution.
 *   - wallet_transactions — append-only ledger; can be reconstructed
 *     later from commitments + drawdowns + distributions.
 *
 * Idempotent via DEMO3-INV- prefix on commitment_code + --wipe flag.
 *
 *   npm run seed:demo-3-investor
 *   npm run seed:demo-3-investor -- --wipe
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";
const FX_USD_TO_IDR = 15_800;

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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// -----------------------------------------------------------------------------

async function wipe(db: ReturnType<typeof getDb>, orgId: string): Promise<void> {
  console.log("wiping DEMO3-INV- prefixed rows for org", orgId);
  // Order: wallets → drawdowns → distributions → commitments
  const a = await db.execute(sql`
    DELETE FROM investor_wallets
     WHERE commitment_id IN (
       SELECT id FROM capital_commitments WHERE commitment_code LIKE 'DEMO3-INV-%'
     )
  `);
  console.log("  wallets:", (a as unknown as { count?: number }).count ?? "?");
  const b = await db.execute(sql`
    DELETE FROM capital_drawdowns
     WHERE commitment_id IN (
       SELECT id FROM capital_commitments WHERE commitment_code LIKE 'DEMO3-INV-%'
     )
  `);
  console.log("  drawdowns:", (b as unknown as { count?: number }).count ?? "?");
  const c = await db.execute(sql`
    DELETE FROM distributions WHERE notes LIKE 'DEMO3-INV%'
  `);
  console.log("  distributions:", (c as unknown as { count?: number }).count ?? "?");
  const d = await db.execute(sql`
    DELETE FROM capital_commitments WHERE commitment_code LIKE 'DEMO3-INV-%'
  `);
  console.log("  commitments:", (d as unknown as { count?: number }).count ?? "?");
}

// -----------------------------------------------------------------------------

async function seed(db: ReturnType<typeof getDb>, orgId: string): Promise<void> {
  // Resolve investors + villa-style projects
  const investors = asRows<{ id: string; code: string; name: string }>(await db.execute(sql`
    SELECT id::text AS id, investor_code AS code, legal_name AS name
      FROM investors
     WHERE organization_id = ${orgId}::uuid
     ORDER BY investor_code
  `));
  if (investors.length === 0) {
    console.log("no investors — run seed-arconique-demo-2 first");
    return;
  }
  console.log(`  ${investors.length} investors found`);

  const projects = asRows<{ id: string; slug: string; name: string }>(await db.execute(sql`
    SELECT id::text AS id, slug, name
      FROM projects
     WHERE slug IN ('demo-mexico-villas','demo-japanese-villas','demo-views-villas','demo-prime-park-villas')
     ORDER BY slug
  `));
  if (projects.length === 0) {
    console.log("no villa projects — DEMO-1 must seed projects first");
    return;
  }
  console.log(`  ${projects.length} projects found`);

  // 1) commitments
  console.log("seeding commitments...");
  const R = rng(420);
  const fundClasses = ["preferred", "preferred", "preferred", "common", "common", "mezzanine", "debt"] as const;
  const commitments: Array<{
    id: string;
    investorId: string;
    projectId: string;
    committedUsdMinor: bigint;
  }> = [];

  let cIdx = 0;
  for (const inv of investors) {
    for (const proj of projects) {
      const code = `DEMO3-INV-${String(++cIdx).padStart(5, "0")}`;
      const existing = asRows<{ id: string; committed_usd_minor: string }>(await db.execute(sql`
        SELECT id::text AS id, committed_amount_usd_minor::text AS committed_usd_minor
          FROM capital_commitments WHERE commitment_code = ${code} LIMIT 1
      `));
      if (existing[0]) {
        commitments.push({
          id: existing[0].id,
          investorId: inv.id,
          projectId: proj.id,
          committedUsdMinor: BigInt(existing[0].committed_usd_minor),
        });
        continue;
      }
      // $50k - $500k commitments
      const usdK = 50 + Math.floor(R() * 451);
      const committedUsdMinor = BigInt(usdK * 1000 * 100);
      const fundClass = fundClasses[cIdx % fundClasses.length];
      // commitment_date past 6-18 months
      const monthsBack = 6 + Math.floor(R() * 13);
      const signedAt = new Date(Date.now() - monthsBack * 30 * 86400000);
      // profit share ~ 8-15% for preferred, 5-8% for common, 12-20% mezzanine
      const profitShare =
        fundClass === "preferred"
          ? 8 + R() * 7
          : fundClass === "common"
            ? 5 + R() * 3
            : fundClass === "mezzanine"
              ? 12 + R() * 8
              : 6 + R() * 2;
      const inserted = asRows<{ id: string }>(await db.execute(sql`
        INSERT INTO capital_commitments (
          organization_id, investor_id, project_id, commitment_code,
          committed_amount_minor, committed_currency, committed_amount_usd_minor,
          fx_rate_at_commitment, profit_share_percent, capital_return_priority,
          is_landowner_jv, status, signed_at, notes
        ) VALUES (
          ${orgId}::uuid, ${inv.id}::uuid, ${proj.id}::uuid, ${code},
          ${committedUsdMinor.toString()}::bigint, 'USD', ${committedUsdMinor.toString()}::bigint,
          '1.00000000'::numeric, ${profitShare.toFixed(4)}::numeric,
          ${fundClass === "preferred" ? 1 : fundClass === "common" ? 2 : 3},
          ${false}, 'active', ${isoDate(signedAt)}, ${`DEMO3-INV ${fundClass} commitment`}
        )
        RETURNING id::text
      `));
      const newId = inserted[0]?.id;
      if (newId) {
        commitments.push({ id: newId, investorId: inv.id, projectId: proj.id, committedUsdMinor });
      }
    }
  }
  console.log(`  ${commitments.length} commitments`);

  // 2) drawdowns — 2-3 per commitment, total ≤ 80% of committed
  console.log("seeding drawdowns...");
  let nDrawdowns = 0;
  const triggerReasons = ["initial_capitalization", "milestone_call", "milestone_call", "manual"] as const;
  for (const c of commitments) {
    const existingCount = asRows<{ n: string }>(await db.execute(sql`
      SELECT COUNT(*)::text AS n FROM capital_drawdowns WHERE commitment_id = ${c.id}::uuid
    `))[0]?.n;
    if (Number(existingCount ?? "0") > 0) continue;
    const drawdownCount = 2 + Math.floor(R() * 2); // 2 or 3
    const totalPct = 0.55 + R() * 0.3; // 55-85%
    const totalDrawn = BigInt(Math.round(Number(c.committedUsdMinor) * totalPct));
    // Spread roughly evenly across drawdowns with some variance
    for (let k = 1; k <= drawdownCount; k++) {
      const portion = k === drawdownCount
        ? totalDrawn - (totalDrawn / BigInt(drawdownCount)) * BigInt(drawdownCount - 1)
        : totalDrawn / BigInt(drawdownCount);
      const monthsBack = drawdownCount - k + 1;
      const requestedAt = new Date(Date.now() - monthsBack * 60 * 86400000);
      const dueDate = isoDate(new Date(requestedAt.getTime() + 14 * 86400000));
      const receivedAt = new Date(requestedAt.getTime() + 10 * 86400000);
      await db.execute(sql`
        INSERT INTO capital_drawdowns (
          organization_id, commitment_id, drawdown_number,
          amount_minor, currency, amount_usd_minor, fx_rate_at_drawdown,
          requested_at, due_date, received_at, status, trigger_reason, notes
        ) VALUES (
          ${orgId}::uuid, ${c.id}::uuid, ${k},
          ${portion.toString()}::bigint, 'USD', ${portion.toString()}::bigint, '1.00000000'::numeric,
          ${requestedAt.toISOString()}::timestamptz, ${dueDate}::date,
          ${receivedAt.toISOString()}::timestamptz, 'received',
          ${triggerReasons[k - 1] ?? "manual"}, ${`DEMO3-INV drawdown ${k}`}
        )
      `);
      nDrawdowns++;
    }
  }
  console.log(`  ${nDrawdowns} drawdowns`);

  // 3) distributions — 1 profit_distribution per project
  console.log("seeding distributions...");
  let nDist = 0;
  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const projectCommitments = commitments.filter((c) => c.projectId === proj.id);
    const totalCommitted = projectCommitments.reduce((s, c) => s + c.committedUsdMinor, 0n);
    // Distribute ~6% of committed back as a profit distribution
    const distAmount = BigInt(Math.round(Number(totalCommitted) * 0.06));
    const existing = asRows<{ id: string }>(await db.execute(sql`
      SELECT id::text AS id FROM distributions
       WHERE project_id = ${proj.id}::uuid AND distribution_number = 1 LIMIT 1
    `));
    if (existing[0]) continue;
    const effectiveDate = isoDate(new Date(Date.now() - 60 * 86400000));
    await db.execute(sql`
      INSERT INTO distributions (
        organization_id, project_id, distribution_number, distribution_type,
        total_amount_usd_minor, trigger_reason, declared_at,
        effective_date, status, completed_at, notes
      ) VALUES (
        ${orgId}::uuid, ${proj.id}::uuid, 1, 'profit_distribution',
        ${distAmount.toString()}::bigint, 'self_sustaining_threshold',
        ${new Date(Date.now() - 75 * 86400000).toISOString()}::timestamptz,
        ${effectiveDate}::date, 'completed',
        ${new Date(Date.now() - 50 * 86400000).toISOString()}::timestamptz,
        ${`DEMO3-INV Q profit distribution`}
      )
    `);
    nDist++;
  }
  console.log(`  ${nDist} distributions`);

  // 4) investor_wallets — 1 per commitment, balance = drawn − returned
  console.log("seeding investor wallets...");
  let nWallets = 0;
  for (const c of commitments) {
    const existing = asRows<{ id: string }>(await db.execute(sql`
      SELECT id::text AS id FROM investor_wallets WHERE commitment_id = ${c.id}::uuid LIMIT 1
    `));
    if (existing[0]) continue;
    // Compute totalDrawn from this commitment's drawdowns
    const drawnRows = asRows<{ total: string | null }>(await db.execute(sql`
      SELECT COALESCE(SUM(amount_usd_minor)::text, '0') AS total
        FROM capital_drawdowns WHERE commitment_id = ${c.id}::uuid AND status = 'received'
    `));
    const totalDrawnUsdMinor = BigInt(drawnRows[0]?.total ?? "0");
    // For this commitment's pro-rata distribution share, allocate from project distribution
    const projectDist = asRows<{ total_usd: string | null; project_committed: string | null }>(await db.execute(sql`
      SELECT d.total_amount_usd_minor::text AS total_usd,
             (SELECT SUM(committed_amount_usd_minor)::text FROM capital_commitments
               WHERE project_id = ${c.projectId}::uuid AND status = 'active') AS project_committed
        FROM distributions d
       WHERE d.project_id = ${c.projectId}::uuid AND d.status = 'completed' LIMIT 1
    `));
    const pd = projectDist[0];
    let totalProfitDistributedUsdMinor = 0n;
    if (pd?.total_usd && pd?.project_committed && pd.project_committed !== "0") {
      const distTotal = Number(pd.total_usd);
      const projectTotal = Number(pd.project_committed);
      const share = projectTotal > 0 ? Number(c.committedUsdMinor) / projectTotal : 0;
      totalProfitDistributedUsdMinor = BigInt(Math.round(distTotal * share));
    }
    // Available balance: drawn capital minus what's already returned (we model
    // distributions as profit-only here, so available = totalDrawn − 0 returned).
    const availableUsdMinor = totalDrawnUsdMinor; // unused capital still on books
    await db.execute(sql`
      INSERT INTO investor_wallets (
        organization_id, commitment_id,
        available_balance_usd_minor, hold_balance_usd_minor,
        reinvest_pending_usd_minor,
        total_drawn_usd_minor, total_returned_capital_usd_minor,
        total_profit_distributed_usd_minor, total_withdrawn_usd_minor,
        total_reinvested_usd_minor
      ) VALUES (
        ${orgId}::uuid, ${c.id}::uuid,
        ${availableUsdMinor.toString()}::bigint, '0'::bigint, '0'::bigint,
        ${totalDrawnUsdMinor.toString()}::bigint, '0'::bigint,
        ${totalProfitDistributedUsdMinor.toString()}::bigint, '0'::bigint,
        '0'::bigint
      )
    `);
    nWallets++;
  }
  console.log(`  ${nWallets} wallets`);

  console.log(
    `\ndone. commitments=${commitments.length} drawdowns=${nDrawdowns} distributions=${nDist} wallets=${nWallets}`,
  );
  console.log(`FX assumed 1 USD = ${FX_USD_TO_IDR} IDR (for downstream display).`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const db = getDb();
  try {
    console.log("target org:", args.orgId);
    if (args.wipe) await wipe(db, args.orgId);
    await seed(db, args.orgId);
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
