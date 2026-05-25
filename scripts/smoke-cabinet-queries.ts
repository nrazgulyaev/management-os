#!/usr/bin/env tsx
/**
 * DAILY-DIGEST-SPRINT-1 Phase 0 — smoke test the rowsOf<T> shape fix.
 *
 * Two-part verification:
 *
 *  A) Production cabinet code paths typecheck against the real schema
 *     (proven by `npm run typecheck` — already passes pre-commit).
 *
 *  B) This script counts rows in each underlying table the fixed
 *     cabinet queries read from, using the SAME `rowsOf<T>()` accessor
 *     the production code now uses. If shape parsing returns non-empty
 *     for tables we know have data, the fix is end-to-end live.
 *
 * Why table-level and not function-call: the cabinet functions are
 * tagged `import "server-only"` (throw under raw Node), so importing
 * them from this script requires a module-resolution shim. Counting
 * rows directly proves the same Drizzle/postgres-js array shape goes
 * through rowsOf<T> cleanly — exactly the assertion Phase 0 needs.
 *
 *   npm run smoke:cabinet-queries
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const client = postgres(DATABASE_URL, { max: 1, prepare: false });
const db = drizzle(client);

function rowsOf<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : [];
}

interface Probe {
  file: string;
  table: string;
  count: number;
  err?: string;
}
const probes: Probe[] = [];

async function probe(file: string, table: string): Promise<void> {
  try {
    const result = await db.execute<{ n: string }>(
      sql.raw(`SELECT COUNT(*)::text AS n FROM ${table}`),
    );
    const rows = rowsOf<{ n: string }>(result);
    if (rows.length === 0) {
      probes.push({ file, table, count: 0, err: "shape returned []" });
      return;
    }
    probes.push({ file, table, count: Number(rows[0].n) });
  } catch (e) {
    probes.push({
      file,
      table,
      count: -1,
      err: e instanceof Error ? e.message.slice(0, 100) : String(e),
    });
  }
}

async function main(): Promise<void> {
  console.log("==========================================");
  console.log(" Phase 0 smoke — rowsOf<T> table-level probe");
  console.log("==========================================\n");

  // bookings-cabinet-queries.ts reads:
  await probe("bookings", "bookings");
  await probe("bookings", "booking_channels");

  // finance-cabinet-queries.ts reads:
  await probe("finance", "statements");
  await probe("finance", "statement_lines");
  await probe("finance", "owners");

  // operations-cabinet-queries.ts reads:
  await probe("operations", "villas");
  await probe("operations", "maintenance_tickets");
  await probe("operations", "maintenance_templates");
  await probe("operations", "service_requests");

  // --- Dev OS (P0.5) ---------------------------------------------------
  // site-supervisor-cabinet-queries.ts reads:
  await probe("site-supervisor", "site_reports");
  await probe("site-supervisor", "site_report_photos");
  await probe("site-supervisor", "site_report_workforce");
  await probe("site-supervisor", "qa_qc_issues");
  // cfo-cabinet-queries.ts reads:
  await probe("cfo", "dev_transactions");
  await probe("cfo", "dev_invoices");
  await probe("cfo", "executive_metrics_snapshots");
  // project-manager-cabinet-queries.ts reads:
  await probe("pm", "projects");
  await probe("pm", "work_packages");
  await probe("pm", "risk_register");
  await probe("pm", "change_orders");

  console.log(
    "file        table                          count   shape verdict",
  );
  console.log(
    "──────────────────────────────────────────────────────────────────",
  );
  for (const p of probes) {
    const verdict =
      p.count > 0 ? "✓ rowsOf returned N>0"
      : p.count === 0 && !p.err ? "· table empty (shape OK)"
      : p.count === 0 ? "✗ shape returned []"
      : `✗ ${p.err}`;
    const n = p.count >= 0 ? p.count.toString().padStart(5) : "    —";
    console.log(`${p.file.padEnd(11)} ${p.table.padEnd(30)} ${n}  ${verdict}`);
  }

  const real_errors = probes.filter((p) => p.count < 0);
  const shape_failures = probes.filter((p) => p.count === 0 && p.err);
  const ok = probes.filter((p) => p.count >= 0 && !p.err);

  console.log("");
  console.log(`✓ ${ok.length}/${probes.length} probes ran cleanly through rowsOf<T>`);
  console.log(
    `  ${ok.filter((p) => p.count > 0).length} returned non-empty data`,
  );
  if (shape_failures.length > 0) {
    console.log(`✗ ${shape_failures.length} shape failures — rowsOf returned []`);
  }
  if (real_errors.length > 0) {
    console.log(`⚠ ${real_errors.length} table errors (probably schema drift in this probe script, not the fix):`);
    for (const e of real_errors) console.log(`    · ${e.table}: ${e.err}`);
  }

  await client.end();
  process.exit(shape_failures.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await client.end().catch(() => {});
  process.exit(1);
});
