#!/usr/bin/env tsx
/**
 * DAILY-DIGEST-SPRINT-1 P3.1d — exercise each Dev OS tool factory
 * via the underlying SQL the tool's wrapped query produces.
 *
 * Same pattern as scripts/test-mgmt-os-tools.ts: server-only tagged
 * cabinet readers can't be imported from raw Node, so we reproduce
 * each tool's representative SQL inline. Validates shape + row
 * counts against production data using rowsOf<T>.
 *
 *   npm run test:dev-os-tools
 *   DATE=2026-05-24 npm run test:dev-os-tools
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";
const TIMEZONE = "Asia/Makassar";

function rowsOf<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : [];
}

function yesterdayInTimezone(tz: string): string {
  const now = new Date();
  const localToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = localToday.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

interface ToolResult {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(2);
  }

  const date = process.env.DATE ?? yesterdayInTimezone(TIMEZONE);
  console.log(`==========================================`);
  console.log(` Test Dev OS tools · date=${date} (${TIMEZONE})`);
  console.log(` ctx.orgId=${ARCONIQUE_ORG_ID.slice(0, 8)}…`);
  console.log(`==========================================\n`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  const results: ToolResult[] = [];

  // ---------------------------------------------------------------
  // get_site_reports_for_date
  // ---------------------------------------------------------------
  try {
    const aggRows = await db.execute<{
      reports: string;
      projects: string;
      workers: string;
    }>(sql`
      SELECT
        COUNT(*)::text                                       AS reports,
        COUNT(DISTINCT project_id)::text                      AS projects,
        COALESCE(SUM(total_workers_present), 0)::text         AS workers
        FROM site_reports
       WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
         AND report_date = ${date}::date
    `);
    const a = rowsOf<{ reports: string; projects: string; workers: string }>(aggRows)[0];
    const top = await db.execute(sql`
      SELECT project_id::text, reporter_role, weather_conditions,
             total_workers_present, substr(summary, 1, 100) AS summary_preview, status
        FROM site_reports
       WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
         AND report_date = ${date}::date
       ORDER BY submitted_at DESC NULLS LAST LIMIT 3
    `);
    results.push({
      name: "get_site_reports_for_date",
      ok: true,
      result: {
        date,
        reportsSubmittedCount: Number(a?.reports ?? "0"),
        activeProjectsCount: Number(a?.projects ?? "0"),
        totalWorkersPresent: Number(a?.workers ?? "0"),
        topReportsCount: rowsOf(top).length,
      },
    });
  } catch (e) {
    results.push({
      name: "get_site_reports_for_date",
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }

  // ---------------------------------------------------------------
  // get_construction_expenses_for_date
  // ---------------------------------------------------------------
  try {
    const rows = await db.execute<{
      out_n: string; out_sum: string; in_n: string; in_sum: string; large_n: string;
    }>(sql`
      WITH window_amounts AS (
        SELECT amount_usd_minor FROM dev_transactions
         WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
           AND direction = 'outflow'
           AND transaction_date >= ${date}::date - INTERVAL '30 days'
           AND transaction_date <= ${date}::date
      ),
      threshold AS (
        SELECT percentile_cont(0.90) WITHIN GROUP (ORDER BY amount_usd_minor) AS p90
          FROM window_amounts
      )
      SELECT
        (SELECT COUNT(*)::text FROM dev_transactions
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND direction = 'outflow' AND transaction_date = ${date}::date) AS out_n,
        (SELECT COALESCE(SUM(amount_usd_minor), 0)::text FROM dev_transactions
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND direction = 'outflow' AND transaction_date = ${date}::date) AS out_sum,
        (SELECT COUNT(*)::text FROM dev_transactions
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND direction = 'inflow' AND transaction_date = ${date}::date) AS in_n,
        (SELECT COALESCE(SUM(amount_usd_minor), 0)::text FROM dev_transactions
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND direction = 'inflow' AND transaction_date = ${date}::date) AS in_sum,
        (SELECT COUNT(*)::text FROM dev_transactions, threshold
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND direction = 'outflow' AND transaction_date = ${date}::date
            AND amount_usd_minor >= threshold.p90) AS large_n
    `);
    const r = rowsOf<{
      out_n: string; out_sum: string; in_n: string; in_sum: string; large_n: string;
    }>(rows)[0];
    results.push({
      name: "get_construction_expenses_for_date",
      ok: true,
      result: {
        date,
        outflowsCount: Number(r?.out_n ?? "0"),
        outflowsUsdMinor: Number(r?.out_sum ?? "0"),
        inflowsCount: Number(r?.in_n ?? "0"),
        inflowsUsdMinor: Number(r?.in_sum ?? "0"),
        largeOutflowsCount: Number(r?.large_n ?? "0"),
      },
    });
  } catch (e) {
    results.push({
      name: "get_construction_expenses_for_date",
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }

  // ---------------------------------------------------------------
  // get_milestone_changes_for_date
  // ---------------------------------------------------------------
  try {
    const rows = await db.execute<{
      wp_completed: string; wp_started: string;
      phase_started: string; phase_completed: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::text FROM work_packages
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND actual_finish::date = ${date}::date
            AND status = 'completed') AS wp_completed,
        (SELECT COUNT(*)::text FROM work_packages
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND status = 'in_progress'
            AND updated_at::date = ${date}::date) AS wp_started,
        (SELECT COUNT(*)::text FROM project_phases
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND actual_start_date = ${date}::date) AS phase_started,
        (SELECT COUNT(*)::text FROM project_phases
          WHERE organization_id = ${ARCONIQUE_ORG_ID}::uuid
            AND actual_end_date = ${date}::date) AS phase_completed
    `);
    const r = rowsOf<{
      wp_completed: string; wp_started: string;
      phase_started: string; phase_completed: string;
    }>(rows)[0];
    results.push({
      name: "get_milestone_changes_for_date",
      ok: true,
      result: {
        date,
        workPackagesCompletedCount: Number(r?.wp_completed ?? "0"),
        workPackagesStartedCount: Number(r?.wp_started ?? "0"),
        phasesEnteredCount: Number(r?.phase_started ?? "0"),
        phasesCompletedCount: Number(r?.phase_completed ?? "0"),
      },
    });
  } catch (e) {
    results.push({
      name: "get_milestone_changes_for_date",
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }

  // ---------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------
  console.log("Tool results (JSON, indented):\n");
  for (const r of results) {
    console.log(`── ${r.name} ${r.ok ? "✓" : "✗"}`);
    if (r.ok) console.log(JSON.stringify(r.result, null, 2));
    else console.log(`  error: ${r.error}`);
    console.log("");
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`✗ ${failed.length} tool(s) errored`);
  } else {
    const totalSignal = results.reduce((acc, r) => {
      const data = r.result as Record<string, unknown> | undefined;
      if (!data) return acc;
      return acc + Object.values(data).filter((v) => typeof v === "number" && v > 0).length;
    }, 0);
    console.log(`✓ all 3 tools ran cleanly · ${totalSignal} non-zero data points`);
  }

  await client.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
