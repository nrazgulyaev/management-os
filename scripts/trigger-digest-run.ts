#!/usr/bin/env tsx
/**
 * DAILY-DIGEST-SPRINT-1 P3.3 — manual trigger for the digest run endpoint.
 *
 * Hits the deployed (or local) endpoint with CRON_SECRET, prints the
 * JSON summary, then reports the 5 most recent agent_runs +
 * notifications for daily_digest_* so the operator can spot-check
 * what just happened.
 *
 * Env:
 *   CRON_SECRET     required — Bearer token for the endpoint
 *   DATABASE_URL    required — used for the spot-check queries
 *   ENDPOINT        optional — defaults to
 *                   https://management.arconique.com/api/agents/daily-digest/run
 *
 *   npm run trigger:digest
 *   ENDPOINT=http://localhost:3000/api/agents/daily-digest/run npm run trigger:digest
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const DEFAULT_ENDPOINT =
  "https://management.arconique.com/api/agents/daily-digest/run";

function rowsOf<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : [];
}

async function main(): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  const dbUrl = process.env.DATABASE_URL;
  const endpoint = process.env.ENDPOINT ?? DEFAULT_ENDPOINT;
  if (!cronSecret) {
    console.error("✗ CRON_SECRET not in env");
    process.exit(2);
  }
  if (!dbUrl) {
    console.error("✗ DATABASE_URL not in env");
    process.exit(2);
  }

  console.log("==========================================");
  console.log(` POST ${endpoint}`);
  console.log("==========================================\n");

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
    });
  } catch (e) {
    console.error(`✗ Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`HTTP ${response.status} · ${elapsedMs}ms\n`);

  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    console.log("Response JSON:");
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log("Response body (non-JSON):");
    console.log(text.slice(0, 2000));
  }

  if (response.status !== 200) {
    console.error("\n✗ Non-200 response — skipping DB spot-check");
    process.exit(1);
  }

  // -------- Spot-check the DB ------------------------------------
  console.log("\n=== Recent agent_runs (daily_digest_*) ===\n");
  const client = postgres(dbUrl, { max: 1, prepare: false });
  const db = drizzle(client);

  const runs = rowsOf<{
    started_at: string;
    agent_code: string;
    status: string;
    scheduled_for: string | null;
    tokens_in: number;
    tokens_out: number;
    cost_usd_minor: number;
    latency_ms: number | null;
    user_email: string | null;
    notification_id: string | null;
    error_message: string | null;
  }>(
    await db.execute(sql`
      SELECT r.started_at::text   AS started_at,
             pa.agent_code         AS agent_code,
             r.status              AS status,
             r.scheduled_for::text AS scheduled_for,
             r.tokens_in           AS tokens_in,
             r.tokens_out          AS tokens_out,
             r.cost_usd_minor      AS cost_usd_minor,
             r.latency_ms          AS latency_ms,
             u.email               AS user_email,
             r.notification_id::text AS notification_id,
             r.error_message       AS error_message
        FROM agent_runs r
        JOIN platform_agent_configs pa ON pa.id = r.agent_id
        LEFT JOIN app_users u ON u.id = r.user_id
       WHERE pa.agent_code LIKE 'daily_digest%'
       ORDER BY r.started_at DESC
       LIMIT 5
    `),
  );
  if (runs.length === 0) {
    console.log("  (no daily_digest_* runs yet)");
  } else {
    for (const r of runs) {
      const cost = (r.cost_usd_minor / 100).toFixed(3);
      console.log(
        `  ${r.started_at.slice(0, 19)} ${r.agent_code.padEnd(20)} ${r.status.padEnd(12)} for=${r.scheduled_for ?? "—"}  tok=${r.tokens_in}/${r.tokens_out}  cost=$${cost}  lat=${r.latency_ms ?? "—"}ms  notif=${r.notification_id ? r.notification_id.slice(0, 8) + "…" : "—"}  user=${r.user_email ?? "—"}`,
      );
      if (r.error_message) console.log(`    err: ${r.error_message.slice(0, 160)}`);
    }
  }

  console.log("\n=== Recent notifications (type=digest) ===\n");
  const notifs = rowsOf<{
    id: string;
    title: string;
    body_len: number;
    read_at: string | null;
    created_at: string;
    user_email: string | null;
  }>(
    await db.execute(sql`
      SELECT n.id::text         AS id,
             n.title             AS title,
             length(n.body)      AS body_len,
             n.read_at::text     AS read_at,
             n.created_at::text  AS created_at,
             u.email             AS user_email
        FROM notifications n
        LEFT JOIN app_users u ON u.id = n.user_id
       WHERE n.type = 'digest'
       ORDER BY n.created_at DESC
       LIMIT 5
    `),
  );
  if (notifs.length === 0) {
    console.log("  (no digest notifications yet)");
  } else {
    for (const n of notifs) {
      console.log(
        `  ${n.created_at.slice(0, 19)} ${n.title.slice(0, 50).padEnd(50)} body=${n.body_len}c  read=${n.read_at ? "✓" : "·"}  user=${n.user_email ?? "—"}`,
      );
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
