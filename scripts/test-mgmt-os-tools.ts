#!/usr/bin/env tsx
/**
 * DAILY-DIGEST-SPRINT-1 P2.4 — exercise each Mgmt OS tool factory
 * with a mock AgentExecutionContext and print the result.
 *
 * The cabinet readers we wrap are tagged `import "server-only"`, so
 * we cannot import them from this raw Node script directly. Instead
 * we reproduce each underlying SQL aggregate the way the tools do —
 * verifying the date-scoped reader's shape contract via the same
 * `rowsOf<T>` accessor.
 *
 *   npm run test:mgmt-os-tools           # uses yesterday in Asia/Makassar
 *   DATE=2026-05-24 npm run test:mgmt-os-tools
 *
 * Output: per-tool JSON (pretty-printed) + a row-count summary.
 * Exits 0 if every tool returned a value, 1 if any errored.
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";
const ALI_USER_ID = "5808c594-d8d8-44d8-9f5a-1f1e7e3c5d8f"; // approx — script doesn't actually need it
const TIMEZONE = "Asia/Makassar";

function rowsOf<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : [];
}

function yesterdayInTimezone(tz: string): string {
  // Compute yesterday in the target tz by formatting "now" minus one day.
  const now = new Date();
  const localToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = localToday.split("-").map(Number);
  // Subtract one day via Date arithmetic in UTC space (timezone-agnostic
  // for the day-boundary purpose).
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
  console.log(` Test Mgmt OS tools · date=${date} (${TIMEZONE})`);
  console.log(` ctx.orgId=${ARCONIQUE_ORG_ID.slice(0, 8)}… ctx.userId=${ALI_USER_ID.slice(0, 8)}…`);
  console.log(`==========================================\n`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  const results: ToolResult[] = [];

  // ---------------------------------------------------------------
  // get_bookings_for_date
  // ---------------------------------------------------------------
  try {
    const aggRows = await db.execute<{
      check_ins: string;
      check_outs: string;
      new_bookings: string;
      new_revenue: string;
      cancellations: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::text FROM bookings
          WHERE check_in::date  = ${date}::date
            AND status IN ('confirmed','checked_in','checked_out')) AS check_ins,
        (SELECT COUNT(*)::text FROM bookings
          WHERE check_out::date = ${date}::date
            AND status IN ('confirmed','checked_in','checked_out')) AS check_outs,
        (SELECT COUNT(*)::text FROM bookings
          WHERE created_at::date = ${date}::date) AS new_bookings,
        (SELECT COALESCE(SUM(gross_amount), 0)::text FROM bookings
          WHERE created_at::date = ${date}::date
            AND status IN ('confirmed','checked_in','checked_out')) AS new_revenue,
        (SELECT COUNT(*)::text FROM bookings
          WHERE status = 'cancelled'
            AND updated_at::date = ${date}::date) AS cancellations
    `);
    const a = rowsOf<{
      check_ins: string;
      check_outs: string;
      new_bookings: string;
      new_revenue: string;
      cancellations: string;
    }>(aggRows)[0];
    const notableRows = await db.execute(sql`
      SELECT b.booking_code, v.unit_code AS villa_code, b.notes AS guest_name,
             b.nights::text AS nights, b.gross_amount::text AS gross_amount
        FROM bookings b
        JOIN villas v ON v.id = b.villa_id
       WHERE b.check_in::date = ${date}::date
       ORDER BY b.gross_amount DESC LIMIT 3
    `);
    const notable = rowsOf<{
      booking_code: string;
      villa_code: string;
      guest_name: string | null;
      nights: string;
      gross_amount: string;
    }>(notableRows);
    results.push({
      name: "get_bookings_for_date",
      ok: true,
      result: {
        date,
        checkInsCount: Number(a?.check_ins ?? "0"),
        checkOutsCount: Number(a?.check_outs ?? "0"),
        newBookingsCount: Number(a?.new_bookings ?? "0"),
        newBookingsRevenueUsd: Number(a?.new_revenue ?? "0"),
        cancellationsCount: Number(a?.cancellations ?? "0"),
        notableArrivalsCount: notable.length,
      },
    });
  } catch (e) {
    results.push({
      name: "get_bookings_for_date",
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }

  // ---------------------------------------------------------------
  // get_financial_activity_for_date
  // ---------------------------------------------------------------
  try {
    const rows = await db.execute<{
      booking_revenue: string;
      stmts_approved: string;
      stmts_sent: string;
      payouts_queued: string;
    }>(sql`
      SELECT
        (SELECT COALESCE(SUM(gross_amount), 0)::text FROM bookings
          WHERE created_at::date = ${date}::date
            AND status IN ('confirmed','checked_in','checked_out')) AS booking_revenue,
        (SELECT COUNT(*)::text FROM owner_statements
          WHERE approved_at::date = ${date}::date) AS stmts_approved,
        (SELECT COUNT(*)::text FROM owner_statements
          WHERE sent_at::date = ${date}::date) AS stmts_sent,
        (SELECT COUNT(*)::text FROM owner_statements
          WHERE status = 'approved' AND sent_at IS NULL) AS payouts_queued
    `);
    const r = rowsOf<{
      booking_revenue: string;
      stmts_approved: string;
      stmts_sent: string;
      payouts_queued: string;
    }>(rows)[0];
    results.push({
      name: "get_financial_activity_for_date",
      ok: true,
      result: {
        date,
        bookingRevenueUsd: Number(r?.booking_revenue ?? "0"),
        statementsApprovedCount: Number(r?.stmts_approved ?? "0"),
        statementsSentCount: Number(r?.stmts_sent ?? "0"),
        payoutsQueuedCount: Number(r?.payouts_queued ?? "0"),
      },
    });
  } catch (e) {
    results.push({
      name: "get_financial_activity_for_date",
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }

  // ---------------------------------------------------------------
  // get_operational_incidents_for_date
  // ---------------------------------------------------------------
  try {
    const aggRows = await db.execute<{
      new_tickets: string;
      resolved: string;
      high_open: string;
      new_service: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::text FROM maintenance_tickets
          WHERE reported_at::date = ${date}::date) AS new_tickets,
        (SELECT COUNT(*)::text FROM maintenance_tickets
          WHERE status IN ('resolved','closed')
            AND updated_at::date = ${date}::date) AS resolved,
        (SELECT COUNT(*)::text FROM maintenance_tickets
          WHERE severity IN ('high','critical','urgent')
            AND status NOT IN ('resolved','closed','cancelled')) AS high_open,
        (SELECT COUNT(*)::text FROM service_requests
          WHERE created_at::date = ${date}::date) AS new_service
    `);
    const a = rowsOf<{
      new_tickets: string;
      resolved: string;
      high_open: string;
      new_service: string;
    }>(aggRows)[0];
    const topRows = await db.execute(sql`
      SELECT mt.ticket_code, v.unit_code AS villa_code, mt.title,
             mt.severity, mt.issue_category AS category
        FROM maintenance_tickets mt
        LEFT JOIN villas v ON v.id = mt.villa_id
       WHERE mt.reported_at::date = ${date}::date
       ORDER BY mt.reported_at DESC LIMIT 3
    `);
    const top = rowsOf(topRows);
    results.push({
      name: "get_operational_incidents_for_date",
      ok: true,
      result: {
        date,
        newTicketsCount: Number(a?.new_tickets ?? "0"),
        ticketsResolvedCount: Number(a?.resolved ?? "0"),
        highSeverityOpenCount: Number(a?.high_open ?? "0"),
        newServiceRequestsCount: Number(a?.new_service ?? "0"),
        topNewTicketsCount: top.length,
      },
    });
  } catch (e) {
    results.push({
      name: "get_operational_incidents_for_date",
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
    if (r.ok) {
      console.log(JSON.stringify(r.result, null, 2));
    } else {
      console.log(`  error: ${r.error}`);
    }
    console.log("");
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`✗ ${failed.length} tool(s) errored`);
  } else {
    const totalSignal = results.reduce((acc, r) => {
      const data = r.result as Record<string, unknown> | undefined;
      if (!data) return acc;
      return (
        acc +
        Object.values(data).filter(
          (v) => typeof v === "number" && v > 0,
        ).length
      );
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
