import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { listBookingConflicts } from "@/features/integrations/calendar-sync/services";

/**
 * Phase 2a PR 2 — cross-cabinet attention feed.
 *
 * The one genuinely-absent capability from the reconciliation: a single
 * ranked queue of actionable items on the Overview, aggregated at query
 * time from existing cabinets — NO new core tables. Each source is read
 * from its existing table/query layer and normalised to `AttentionItem`.
 *
 * Sources:
 *   - statement      overdue / disputed owner statements (finance)
 *   - sla_breach     open maintenance SLA breaches (sla_breaches, mig 0112;
 *                    populated by the PR 3 scan cron)
 *   - owner_stay     owner-stay requests awaiting an operator decision
 *   - channel_conflict  unresolved calendar/booking conflicts (integrations)
 *   - capital_call   unpaid (issued/partial) capital calls (dev CFO)
 *
 * Fan-out is fault-isolated: a failing/empty source yields [] and never
 * breaks the feed. Tenant-wide reads, consistent with the rest of the
 * Overview query layer. All raw reads use rowsOf<T>() (postgres-js returns
 * an array directly; the legacy `.rows` accessor silently drops rows).
 */

export type AttentionSource =
  | "statement"
  | "sla_breach"
  | "owner_stay"
  | "channel_conflict"
  | "capital_call";

export type AttentionSeverity = "critical" | "high" | "medium";

export interface AttentionItem {
  /** Stable key: `${source}:${sourceId}`. */
  key: string;
  source: AttentionSource;
  severity: AttentionSeverity;
  /** Short headline, e.g. "SLA breach · MNT-20260425-0001". */
  title: string;
  /** One-line context, e.g. "AC not cooling · Eternal S5 · p1". */
  detail: string;
  /** Link to the source record. */
  href: string;
  /** ISO timestamp used for ranking within a severity (oldest first). */
  occurredAt: string | null;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

// ---------------------------------------------------------------------------
// Source normalisers — each returns AttentionItem[] and never throws.
// ---------------------------------------------------------------------------

/** Overdue (past auto-ack) or disputed owner statements. */
async function statementItems(): Promise<AttentionItem[]> {
  const db = getDb();
  if (!db) return [];
  const rows = rowsOf<{
    id: string;
    code: string;
    owner_name: string | null;
    villa_code: string | null;
    owner_state: string;
    period_month: string | null;
    auto_ack_at: string | null;
    disputed_at: string | null;
  }>(
    await db.execute(sql`
      SELECT s.id::text                        AS id,
             s.statement_code                   AS code,
             o.display_name                      AS owner_name,
             v.unit_code                         AS villa_code,
             s.owner_state                       AS owner_state,
             to_char(s.period_month, 'YYYY-MM')  AS period_month,
             s.auto_ack_at::text                 AS auto_ack_at,
             s.owner_disputed_at::text           AS disputed_at
        FROM owner_statements s
        JOIN owners o ON o.id = s.owner_id
        LEFT JOIN villas v ON v.id = s.villa_id
       WHERE s.owner_state = 'disputed'
          OR (s.owner_state = 'pending' AND s.auto_ack_at IS NOT NULL AND s.auto_ack_at < now())
       ORDER BY s.owner_disputed_at DESC NULLS LAST, s.auto_ack_at ASC
       LIMIT 10
    `),
  );
  return rows.map((r) => {
    const disputed = r.owner_state === "disputed";
    const who = `${(r.owner_name ?? "Owner").replace(/^\[DEMO\d?\] /, "")}${r.villa_code ? ` · ${r.villa_code}` : ""}${r.period_month ? ` · ${r.period_month}` : ""}`;
    return {
      key: `statement:${r.id}`,
      source: "statement" as const,
      severity: disputed ? ("critical" as const) : ("high" as const),
      title: disputed ? `Statement disputed · ${r.code}` : `Statement awaiting sign-off · ${r.code}`,
      detail: disputed ? `Owner raised a dispute — ${who}` : `Past auto-send deadline — ${who}`,
      href: `/dashboard/finance/statements/${r.id}`,
      occurredAt: r.disputed_at ?? r.auto_ack_at,
    };
  });
}

/** Open maintenance SLA breaches (resolved_at IS NULL). */
async function slaBreachItems(): Promise<AttentionItem[]> {
  const db = getDb();
  if (!db) return [];
  const rows = rowsOf<{
    ticket_id: string;
    breached_at: string;
    code: string;
    title: string;
    severity: string;
    villa_code: string | null;
  }>(
    await db.execute(sql`
      SELECT b.ticket_id::text  AS ticket_id,
             b.breached_at::text AS breached_at,
             mt.ticket_code      AS code,
             mt.title            AS title,
             mt.severity         AS severity,
             v.unit_code         AS villa_code
        FROM sla_breaches b
        JOIN maintenance_tickets mt ON mt.id = b.ticket_id
        LEFT JOIN villas v ON v.id = mt.villa_id
       WHERE b.resolved_at IS NULL
       ORDER BY b.breached_at ASC
       LIMIT 15
    `),
  );
  return rows.map((r) => ({
    key: `sla_breach:${r.ticket_id}`,
    source: "sla_breach" as const,
    // p0/p1 tickets are the urgent end of the SLA scale.
    severity: r.severity === "p0" || r.severity === "p1" ? ("critical" as const) : ("high" as const),
    title: `SLA breach · ${r.code}`,
    detail: `${r.title.replace(/^\[DEMO\d?\] /, "")}${r.villa_code ? ` · ${r.villa_code}` : ""} · ${r.severity}`,
    href: `/dashboard/operations/maintenance/${r.ticket_id}`,
    occurredAt: r.breached_at,
  }));
}

/** Owner-stay requests awaiting an operator decision. */
async function ownerStayItems(): Promise<AttentionItem[]> {
  const db = getDb();
  if (!db) return [];
  const rows = rowsOf<{
    id: string;
    owner_name: string | null;
    villa_code: string | null;
    start: string;
    finish: string;
    created_at: string;
  }>(
    await db.execute(sql`
      SELECT r.id::text             AS id,
             o.display_name          AS owner_name,
             v.unit_code             AS villa_code,
             r.requested_start::text AS start,
             r.requested_end::text   AS finish,
             r.created_at::text      AS created_at
        FROM owner_stay_requests r
        JOIN owners o ON o.id = r.owner_id
        LEFT JOIN villas v ON v.id = r.villa_id
       WHERE r.approved_at IS NULL
         AND r.rejected_at IS NULL
         AND r.completed_at IS NULL
       ORDER BY r.created_at ASC
       LIMIT 10
    `),
  );
  return rows.map((r) => ({
    key: `owner_stay:${r.id}`,
    source: "owner_stay" as const,
    severity: "medium" as const,
    title: "Owner-stay request",
    detail: `${(r.owner_name ?? "Owner").replace(/^\[DEMO\d?\] /, "")}${r.villa_code ? ` · ${r.villa_code}` : ""} · ${r.start}→${r.finish}`,
    href: `/dashboard/owner-stays/requests/${r.id}`,
    occurredAt: r.created_at,
  }));
}

/** Unresolved calendar/booking conflicts (reuses the integrations query). */
async function channelConflictItems(): Promise<AttentionItem[]> {
  const conflicts = await listBookingConflicts();
  return conflicts
    .filter((c) => c.status !== "resolved" && c.resolvedAt === null)
    .slice(0, 10)
    .map((c) => ({
      key: `channel_conflict:${c.id}`,
      source: "channel_conflict" as const,
      severity: c.severity === "high" || c.severity === "critical" ? ("critical" as const) : ("high" as const),
      title: `Channel conflict · ${c.conflictType}`,
      detail: `${c.description}${c.villaCode ? ` · ${c.villaCode}` : ""}`,
      href: "/dashboard/integrations/conflicts",
      occurredAt: c.createdAt,
    }));
}

/** Unpaid (issued / partial) capital calls. */
async function capitalCallItems(): Promise<AttentionItem[]> {
  const db = getDb();
  if (!db) return [];
  const rows = rowsOf<{
    id: string;
    ref: string;
    status: string;
    due_at: string;
    total_usd: string;
    project_name: string | null;
  }>(
    await db.execute(sql`
      SELECT c.id::text       AS id,
             c.ref            AS ref,
             c.status         AS status,
             c.due_at::text   AS due_at,
             c.total_usd::text AS total_usd,
             p.name           AS project_name
        FROM capital_calls c
        LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.status IN ('issued', 'partial')
       ORDER BY c.due_at ASC
       LIMIT 10
    `),
  );
  const now = Date.now();
  return rows.map((r) => {
    const overdue = new Date(r.due_at).getTime() < now;
    const usd = Math.round(Number(r.total_usd || "0")).toLocaleString();
    const due = r.due_at.slice(0, 10);
    return {
      key: `capital_call:${r.id}`,
      source: "capital_call" as const,
      severity: overdue ? ("high" as const) : ("medium" as const),
      title: `Capital call ${r.ref} ${r.status === "partial" ? "partly paid" : "unpaid"}`,
      detail: `${(r.project_name ?? "Project").replace(/^\[DEMO\d?\] /, "")} · $${usd} · due ${due}${overdue ? " (overdue)" : ""}`,
      href: `/development-os/cfo/capital-calls/${r.id}`,
      occurredAt: r.due_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/** Run a source normaliser, swallowing failures so one bad source can't
 *  take down the whole feed. */
async function safeSource(fn: () => Promise<AttentionItem[]>): Promise<AttentionItem[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

export interface AttentionFeed {
  items: AttentionItem[];
  total: number;
  counts: Record<AttentionSeverity, number>;
}

/**
 * Cross-cabinet attention feed for the Overview. Fans out over all sources
 * concurrently, ranks by severity then oldest-first, and returns the top
 * `limit` (default 12) plus the full counts.
 */
export async function getAttentionFeed(limit = 12): Promise<AttentionFeed> {
  const groups = await Promise.all([
    safeSource(statementItems),
    safeSource(slaBreachItems),
    safeSource(ownerStayItems),
    safeSource(channelConflictItems),
    safeSource(capitalCallItems),
  ]);
  const all = groups.flat();

  all.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    // Oldest (most overdue) first within a severity tier.
    const at = a.occurredAt ? Date.parse(a.occurredAt) : Number.POSITIVE_INFINITY;
    const bt = b.occurredAt ? Date.parse(b.occurredAt) : Number.POSITIVE_INFINITY;
    return at - bt;
  });

  const counts: Record<AttentionSeverity, number> = { critical: 0, high: 0, medium: 0 };
  for (const it of all) counts[it.severity] += 1;

  return { items: all.slice(0, limit), total: all.length, counts };
}
