#!/usr/bin/env tsx
/**
 * DAILY-DIGEST-SPRINT-1 P1 — apply migrations 0110 + 0111.
 *
 * Mirrors the force-apply-0109 pattern: bypass Drizzle's journal and
 * execute the raw SQL directly. Both migration files are idempotent
 * (BEGIN/COMMIT + IF NOT EXISTS throughout) so re-running on
 * already-applied state is a safe no-op.
 *
 * Migrations applied:
 *   · drizzle/0110_daily_digest_agent_runs_extension.sql
 *       — ALTER agent_runs ADD COLUMN run_type/scheduled_for/
 *         notification_id/metadata + idx_agent_runs_scheduled
 *   · drizzle/0111_daily_digest_subscriptions_and_notifications.sql
 *       — CREATE TABLE agent_digest_subscriptions (+ RLS)
 *       — CREATE TABLE notifications (+ RLS)
 *
 * Verification after apply:
 *   1. 4 new columns on agent_runs
 *   2. agent_digest_subscriptions table + idx + 1 policy
 *   3. notifications table + idx + 2 policies
 *
 * Exits 0 on full green, 1 on any verification failure.
 *
 *   npm run migrate:daily-digest
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const FILES = [
  "drizzle/0110_daily_digest_agent_runs_extension.sql",
  "drizzle/0111_daily_digest_subscriptions_and_notifications.sql",
];

const NEW_COLUMNS = [
  "run_type",
  "scheduled_for",
  "notification_id",
  "metadata",
];

const NEW_TABLES = ["agent_digest_subscriptions", "notifications"];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL not set");
    process.exit(2);
  }

  const sql = postgres(url, { max: 1, prepare: false });
  console.log("==========================================");
  console.log(" Apply DAILY-DIGEST-SPRINT-1 migrations");
  console.log("==========================================\n");

  try {
    for (const file of FILES) {
      const path = resolve(process.cwd(), file);
      console.log(`  · applying ${file}`);
      const ddl = readFileSync(path, "utf8");
      await sql.unsafe(ddl);
      console.log(`    ✓ applied`);
    }

    console.log("\n=== Verification ===\n");
    let pass = true;

    // 1. agent_runs has the 4 new columns
    const cols = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'agent_runs'
         AND column_name IN ('run_type','scheduled_for','notification_id','metadata')
       ORDER BY column_name
    `;
    const colsSet = new Set(cols.map((r) => r.column_name));
    for (const c of NEW_COLUMNS) {
      if (colsSet.has(c)) {
        console.log(`  ✓ agent_runs.${c}`);
      } else {
        console.error(`  ✗ agent_runs.${c} MISSING`);
        pass = false;
      }
    }

    // 2. New tables present
    const tbls = await sql<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('agent_digest_subscriptions','notifications')
       ORDER BY table_name
    `;
    const tblsSet = new Set(tbls.map((r) => r.table_name));
    for (const t of NEW_TABLES) {
      if (tblsSet.has(t)) {
        console.log(`  ✓ table ${t}`);
      } else {
        console.error(`  ✗ table ${t} MISSING`);
        pass = false;
      }
    }

    // 3. Indexes present
    const idx = await sql<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'idx_agent_runs_scheduled',
           'idx_digest_subs_active',
           'idx_notif_user_unread'
         )
       ORDER BY indexname
    `;
    const idxSet = new Set(idx.map((r) => r.indexname));
    for (const i of [
      "idx_agent_runs_scheduled",
      "idx_digest_subs_active",
      "idx_notif_user_unread",
    ]) {
      if (idxSet.has(i)) {
        console.log(`  ✓ index ${i}`);
      } else {
        console.error(`  ✗ index ${i} MISSING`);
        pass = false;
      }
    }

    // 4. RLS policies present
    const policies = await sql<Array<{ policyname: string; tablename: string }>>`
      SELECT policyname, tablename FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('agent_digest_subscriptions','notifications')
       ORDER BY tablename, policyname
    `;
    if (policies.length >= 3) {
      console.log(`  ✓ ${policies.length} RLS policies on digest tables`);
      for (const p of policies) {
        console.log(`      · ${p.tablename}.${p.policyname}`);
      }
    } else {
      console.error(`  ✗ expected ≥3 RLS policies, found ${policies.length}`);
      pass = false;
    }

    console.log("");
    if (pass) {
      console.log("✓ All verifications passed.");
    } else {
      console.error("✗ Verification failed — inspect output above.");
      process.exit(1);
    }
  } catch (e) {
    console.error("FATAL:", e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
