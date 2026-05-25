/**
 * DAILY-DIGEST-SPRINT-1 P3.2 — Daily Digest cron endpoint.
 *
 * Triggered by Vercel Cron on the hour (vercel.json schedule
 * "0 * * * *"). The handler iterates `agent_digest_subscriptions`,
 * computes each subscription's local hour, fires `runAgentWithTools`
 * for those whose `digest_hour_local` matches the current local hour,
 * writes a notification row from the generated markdown, and back-refs
 * the run.
 *
 * Auth: accepts either Vercel's internal `x-vercel-cron: 1` header
 * (set automatically when invoked by the platform's cron scheduler)
 * OR `Authorization: Bearer <CRON_SECRET>` (used by the manual
 * trigger script + ad-hoc operator triggers).
 *
 * Returns a small JSON summary the platform can surface in cron
 * execution logs. Errors on individual subscriptions DO NOT halt the
 * batch — each subscription's failure is recorded in agent_runs and
 * surfaced in `errors[]`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { requireDb, rowsOf } from "@/lib/db/client";
import { env } from "@/lib/env";
import {
  runAgentWithTools,
  AgentInferenceError,
  BudgetExceededError,
} from "@/lib/agents/inference";
// Side-effect import: populates the tool registry. The runAgentWithTools
// path calls getToolsForAgent which needs the registry filled.
import "@/lib/agents/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubRow = {
  agent_id: string;
  agent_code: string;
  user_id: string;
  org_id: string;
  digest_hour_local: number;
  timezone: string;
} & Record<string, unknown>;

interface BatchSummary {
  processed: number;
  succeeded: number;
  failed: number;
  skipped_idempotent: number;
  skipped_off_hour: number;
  errors: Array<{ user_id: string; agent_code: string; error: string }>;
}

function isAuthorized(req: NextRequest): boolean {
  // Vercel sets this header internally when invoking from its scheduler.
  if (req.headers.get("x-vercel-cron") === "1") return true;
  // Manual / operator-triggered: Bearer CRON_SECRET.
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const provided = auth.slice("Bearer ".length).trim();
  const expected = env.server.CRON_SECRET;
  if (!expected || !provided) return false;
  // Constant-time-ish compare: lengths first, then string equality.
  // Node's timingSafeEqual would be marginally better but requires
  // Buffer alignment; for an HMAC-equivalent rotating secret the simple
  // compare is acceptable.
  return provided.length === expected.length && provided === expected;
}

/**
 * Compute the local hour (0-23) for a given IANA timezone right now.
 * Uses Intl.DateTimeFormat which is the only zone-aware path in plain
 * Node without pulling date-fns-tz.
 */
function localHour(timezone: string, now: Date): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    });
    return Number(fmt.format(now));
  } catch {
    // Unknown timezone — bail to UTC hour rather than crash the batch.
    return now.getUTCHours();
  }
}

/**
 * Yesterday's ISO date string (YYYY-MM-DD) in the given timezone.
 * Computes "local today" then subtracts one day in UTC space (day
 * boundary granularity makes the timezone of the arithmetic moot).
 */
function yesterdayInTimezone(timezone: string, now: Date): string {
  let localToday: string;
  try {
    localToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // Fallback to UTC date if timezone unknown.
    localToday = now.toISOString().slice(0, 10);
  }
  const [y, m, d] = localToday.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function prettyDate(iso: string): string {
  // "2026-05-24" → "May 24, 2026"
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = requireDb();
  const summary: BatchSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped_idempotent: 0,
    skipped_off_hour: 0,
    errors: [],
  };

  // Load every enabled subscription, joined to the agent config so we
  // have agent_id ready (inference path keys by id, not code).
  const subsResult = await db.execute<SubRow>(sql`
    SELECT
      pa.id::text             AS agent_id,
      s.agent_code             AS agent_code,
      s.user_id::text          AS user_id,
      s.org_id::text           AS org_id,
      s.digest_hour_local      AS digest_hour_local,
      s.timezone               AS timezone
      FROM agent_digest_subscriptions s
      JOIN platform_agent_configs pa ON pa.agent_code = s.agent_code
     WHERE s.is_enabled = true
       AND pa.is_active = true
  `);
  const subs = rowsOf<SubRow>(subsResult);
  summary.processed = subs.length;

  const now = new Date();

  for (const s of subs) {
    const hour = localHour(s.timezone, now);
    if (hour !== s.digest_hour_local) {
      summary.skipped_off_hour += 1;
      continue;
    }

    const scheduledFor = yesterdayInTimezone(s.timezone, now);

    // Idempotency — has this user already received yesterday's digest
    // from this agent successfully?
    const priorResult = await db.execute<{ id: string }>(sql`
      SELECT id::text AS id FROM agent_runs
       WHERE agent_id = ${s.agent_id}::uuid
         AND user_id = ${s.user_id}::uuid
         AND run_type = 'scheduled'
         AND scheduled_for = ${scheduledFor}::date
         AND status = 'success'
       LIMIT 1
    `);
    if (rowsOf(priorResult).length > 0) {
      summary.skipped_idempotent += 1;
      continue;
    }

    try {
      const result = await runAgentWithTools({
        agentId: s.agent_id,
        organizationId: s.org_id,
        userId: s.user_id,
        scheduledFor,
        timezone: s.timezone,
        userMessage: `Generate the daily digest for ${scheduledFor}. Use the available tools to gather yesterday's activity, then produce the markdown report following the structure in your system prompt.`,
      });

      // Persist notification row.
      const titleDate = prettyDate(scheduledFor);
      const agentLabel = s.agent_code === "daily_digest_dev" ? "Construction" : "Operations";
      const title = `Daily digest · ${agentLabel} — ${titleDate}`;

      const notifResult = await db.execute<{ id: string }>(sql`
        INSERT INTO notifications (user_id, org_id, title, body, type, related_run_id)
        VALUES (
          ${s.user_id}::uuid,
          ${s.org_id}::uuid,
          ${title},
          ${result.text || "_No content was produced for this digest._"},
          'digest',
          ${result.runId}::uuid
        )
        RETURNING id::text AS id
      `);
      const notifId = rowsOf<{ id: string }>(notifResult)[0]?.id;

      // Back-ref run → notification.
      if (notifId) {
        await db.execute(sql`
          UPDATE agent_runs SET notification_id = ${notifId}::uuid
           WHERE id = ${result.runId}::uuid
        `);
      }

      summary.succeeded += 1;
    } catch (err) {
      const msg =
        err instanceof BudgetExceededError
          ? "budget_exceeded"
          : err instanceof AgentInferenceError
            ? `${err.code}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
      summary.failed += 1;
      summary.errors.push({
        user_id: s.user_id,
        agent_code: s.agent_code,
        error: msg.slice(0, 300),
      });
      // Continue the batch — one subscription's failure doesn't halt
      // the others.
    }
  }

  return NextResponse.json(summary, { status: 200 });
}
