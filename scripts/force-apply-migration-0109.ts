#!/usr/bin/env tsx
/**
 * FORCE-APPLY-0109 — sync production schema with drizzle/0109_agent_foundation.sql.
 *
 * Why this exists: Drizzle's journal marked 0109 as "applied" even though
 * none of the seven agent tables (or the pgvector extension) actually
 * materialized in the production database. This script bypasses Drizzle's
 * migration tracking entirely and executes the SQL directly against
 * DATABASE_URL. The migration file is already wrapped in BEGIN/COMMIT and
 * uses `CREATE EXTENSION IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`
 * throughout, so running it a second time on an already-applied schema
 * is a safe no-op.
 *
 * After applying, runs verification queries:
 *   1. Extensions present (vector, pg_trgm)
 *   2. All 7 tables created
 *   3. Indexes on agent_knowledge_chunks (HNSW / IVFFlat + others)
 *
 * Exits 0 on full green, 1 on any verification failure.
 *
 * Usage:
 *   npm run migrate:force-0109
 *
 * Loads .env.production.local first (via node --env-file-if-exists in
 * the npm script wrapper), then .env.local. So `DATABASE_URL` must be
 * set in one of those.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const SQL_FILE = "drizzle/0109_agent_foundation.sql";

const EXPECTED_TABLES = [
  "platform_agent_configs",
  "org_agent_subscriptions",
  "agent_knowledge_documents",
  "agent_knowledge_chunks",
  "agent_threads",
  "agent_messages",
  "agent_runs",
] as const;

const EXPECTED_EXTENSIONS = ["vector", "pg_trgm"] as const;

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const auth = u.password ? `${u.username}:***@` : "";
    return `${u.protocol}//${auth}${u.host}${u.pathname}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

interface VerifyRow {
  extensions: string[];
  tables: string[];
  chunkIndexCount: number;
}

async function verify(client: postgres.Sql): Promise<VerifyRow> {
  const extRows = await client<{ extname: string }[]>`
    SELECT extname FROM pg_extension
     WHERE extname = ANY (${[...EXPECTED_EXTENSIONS]}::text[])
  `;
  const extensions = extRows.map((r) => r.extname);

  const tableRows = await client<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY (${[...EXPECTED_TABLES]}::text[])
  `;
  const tables = tableRows.map((r) => r.table_name);

  const idxRows = await client<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
      FROM pg_indexes
     WHERE tablename = 'agent_knowledge_chunks'
  `;
  const chunkIndexCount = Number(idxRows[0]?.count ?? "0");

  return { extensions, tables, chunkIndexCount };
}

async function main(): Promise<void> {
  console.log("==========================================");
  console.log(" FORCE-APPLY-0109 — agent foundation");
  console.log("==========================================\n");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL is not set.");
    console.error(
      "  Add it to .env.production.local OR .env.local before running this script.",
    );
    process.exit(1);
  }
  console.log(`  target: ${maskUrl(url)}`);

  const sqlPath = resolve(process.cwd(), SQL_FILE);
  let sqlText: string;
  try {
    sqlText = readFileSync(sqlPath, "utf8");
  } catch (err) {
    console.error(`✗ Could not read ${SQL_FILE}: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`  file:   ${SQL_FILE} (${sqlText.length} bytes)`);

  const client = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    onnotice: (n) => {
      // Suppress noisy Postgres NOTICE lines (CREATE TABLE IF NOT EXISTS
      // fires one per pre-existing relation). Surface only WARNING+.
      if (n.severity_local && n.severity_local !== "NOTICE") {
        console.warn(`  pg ${n.severity_local}: ${n.message}`);
      }
    },
  });

  // -----------------------------------------------------------------
  // 1) Pre-flight: is `vector` already available?
  // -----------------------------------------------------------------
  console.log("\n— pre-flight ----------------------------");
  try {
    const avail = await client<{ name: string; installed_version: string | null }[]>`
      SELECT name, installed_version
        FROM pg_available_extensions
       WHERE name = 'vector'
       LIMIT 1
    `;
    if (avail.length === 0) {
      console.error(
        "\n✗ The `vector` extension is NOT in pg_available_extensions on this database.",
      );
      console.error(
        "  Enable it via the Supabase dashboard before re-running this script:",
      );
      console.error("    Dashboard → Database → Extensions → search 'vector' → Enable");
      await client.end();
      process.exit(1);
    }
    console.log(
      `  ✓ vector available (installed_version=${avail[0].installed_version ?? "not yet installed"})`,
    );
  } catch (err) {
    console.error("✗ Pre-flight failed:", (err as Error).message);
    await client.end();
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // 2) Apply the migration. The file is wrapped in BEGIN/COMMIT and
  //    is idempotent (IF NOT EXISTS + DO blocks), so a re-apply on
  //    an already-migrated DB is a no-op.
  // -----------------------------------------------------------------
  console.log("\n— applying ------------------------------");
  try {
    await client.unsafe(sqlText);
    console.log("  ✓ SQL executed (BEGIN/COMMIT inside the file)");
  } catch (err) {
    console.error("\n✗ Migration execution failed:");
    console.error("  ", (err as Error).message);
    console.error(
      "\n  The file's BEGIN/COMMIT means a failure rolls back automatically.",
    );
    await client.end();
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // 3) Verify.
  // -----------------------------------------------------------------
  console.log("\n— verification --------------------------");
  const v = await verify(client);

  let allGreen = true;

  for (const ext of EXPECTED_EXTENSIONS) {
    if (v.extensions.includes(ext)) {
      console.log(`  ✓ extension: ${ext}`);
    } else {
      console.log(`  ✗ extension MISSING: ${ext}`);
      allGreen = false;
    }
  }

  for (const t of EXPECTED_TABLES) {
    if (v.tables.includes(t)) {
      console.log(`  ✓ table: ${t}`);
    } else {
      console.log(`  ✗ table MISSING: ${t}`);
      allGreen = false;
    }
  }

  if (v.chunkIndexCount >= 3) {
    console.log(
      `  ✓ agent_knowledge_chunks: ${v.chunkIndexCount} indexes (PK + denorm idx + similarity idx)`,
    );
  } else {
    console.log(
      `  ⚠ agent_knowledge_chunks: only ${v.chunkIndexCount} indexes — expected 3+`,
    );
    allGreen = false;
  }

  await client.end();

  console.log("\n==========================================");
  if (allGreen) {
    console.log(" VERDICT: ✓ 0109 fully applied + verified");
    console.log("==========================================\n");
    process.exit(0);
  } else {
    console.log(" VERDICT: ✗ verification failed — see above");
    console.log("==========================================\n");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n✗ Unhandled error:");
  console.error(e);
  process.exit(1);
});
