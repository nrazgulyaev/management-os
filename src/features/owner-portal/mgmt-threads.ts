import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * W2 owner-concierge — MGMT-side reads for the staff owner-inbox.
 *
 * Distinct from `get-threads.ts` (owner-facing, scoped to ONE owner via
 * the owner auth context). These reads power the staff cabinet at
 * /dashboard/owners/threads: every owner_threads row with the owning
 * owner's name, and the full transcript for a single thread.
 *
 * All raw reads use rowsOf<T>() — the owner-portal slice had the
 * postgres-js `.rows` shape bug (OWNER-PORTAL-SHAPE-1); do not reintroduce.
 *
 * Org-scoping: owner_threads now carries organization_id (owner-threads.ts:43)
 * and owners / ownership_shares / owner_statements are org-migrated, so every
 * read here is scoped to the caller's organization via requireOrgId() in
 * addition to the `owners.write` permission gate. Threads, transcripts and the
 * AI grounding bundle never cross the tenant boundary.
 */

export interface MgmtOwnerThreadListItem {
  id: string;
  ownerId: string;
  ownerName: string;
  kind: string;
  subject: string;
  status: string;
  /** Owner-unread count on the mgmt side — bumped by inbound owner replies. */
  unreadCount: number;
  lastMessageAt: string;
  /** Actor kind of the most recent message (owner / mgmt_staff / …). */
  lastActorKind: string | null;
  preview: string | null;
  messageCount: number;
}

/** All owner threads, newest activity first, with owner name + last-message preview. */
export async function listOwnerThreadsForMgmt(
  limit = 100,
): Promise<MgmtOwnerThreadListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db.execute(sql`
    SELECT t.id::text                       AS id,
           t.owner_id::text                  AS owner_id,
           o.display_name                    AS owner_name,
           t.kind                            AS kind,
           t.subject                         AS subject,
           t.status                          AS status,
           t.unread_count                    AS unread_count,
           t.last_message_at::text           AS last_message_at,
           lm.body                           AS preview,
           lm.actor_kind                     AS last_actor_kind,
           (SELECT count(*) FROM owner_messages m WHERE m.thread_id = t.id)::text AS message_count
      FROM owner_threads t
      JOIN owners o ON o.id = t.owner_id
      LEFT JOIN LATERAL (
        SELECT m.body, m.actor_kind
          FROM owner_messages m
         WHERE m.thread_id = t.id
         ORDER BY m.sent_at DESC
         LIMIT 1
      ) lm ON true
     WHERE t.organization_id = ${organizationId}::uuid
     ORDER BY t.last_message_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    owner_id: string;
    owner_name: string;
    kind: string;
    subject: string;
    status: string;
    unread_count: number;
    last_message_at: string;
    preview: string | null;
    last_actor_kind: string | null;
    message_count: string;
  }>(rows).map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    unreadCount: Number(r.unread_count ?? 0),
    lastMessageAt: r.last_message_at,
    lastActorKind: r.last_actor_kind,
    preview: r.preview ? r.preview.slice(0, 140) : null,
    messageCount: Number(r.message_count ?? 0),
  }));
}

export interface MgmtOwnerThreadMessage {
  id: string;
  actorKind: string;
  actorName: string;
  body: string;
  sentAt: string;
}

export interface MgmtOwnerThreadDetail {
  id: string;
  ownerId: string;
  ownerName: string;
  subject: string;
  kind: string;
  status: string;
  messages: MgmtOwnerThreadMessage[];
}

/** One thread + its messages, staff view (NOT owner-scoped — gated by the action). */
export async function getOwnerThreadForMgmt(
  threadId: string,
): Promise<MgmtOwnerThreadDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();

  const head = rowsOf<{
    id: string;
    owner_id: string;
    owner_name: string;
    subject: string;
    kind: string;
    status: string;
  }>(
    await db.execute(sql`
      SELECT t.id::text         AS id,
             t.owner_id::text    AS owner_id,
             o.display_name      AS owner_name,
             t.subject           AS subject,
             t.kind              AS kind,
             t.status            AS status
        FROM owner_threads t
        JOIN owners o ON o.id = t.owner_id
       WHERE t.id = ${threadId}::uuid
         AND t.organization_id = ${organizationId}::uuid
       LIMIT 1
    `),
  )[0];
  if (!head) return null;

  const messages = rowsOf<{
    id: string;
    actor_kind: string;
    actor_name: string | null;
    body: string;
    sent_at: string;
  }>(
    await db.execute(sql`
      SELECT m.id::text         AS id,
             m.actor_kind        AS actor_kind,
             au.full_name        AS actor_name,
             m.body              AS body,
             m.sent_at::text     AS sent_at
        FROM owner_messages m
        JOIN owner_threads t ON t.id = m.thread_id
        LEFT JOIN app_users au ON au.id = m.actor_id
       WHERE m.thread_id = ${threadId}::uuid
         AND t.organization_id = ${organizationId}::uuid
       ORDER BY m.sent_at ASC
       LIMIT 500
    `),
  ).map((r) => ({
    id: r.id,
    actorKind: r.actor_kind,
    actorName:
      r.actor_name ??
      (r.actor_kind === "owner"
        ? head.owner_name
        : r.actor_kind === "concierge_agent"
          ? "Concierge AI"
          : r.actor_kind === "system"
            ? "System"
            : "Arconique"),
    body: r.body,
    sentAt: r.sent_at,
  }));

  return {
    id: head.id,
    ownerId: head.owner_id,
    ownerName: head.owner_name,
    subject: head.subject,
    kind: head.kind,
    status: head.status,
    messages,
  };
}

export interface OwnerGroundingContext {
  ownerName: string;
  /** Compact, human-readable facts the AI can ground a reply in. */
  facts: string[];
}

/**
 * Read a small, factual context bundle for an owner so the AI draft is
 * grounded in the owner's real statement / payout / villa data rather than
 * hallucinated. Money is rendered from minor units; we only surface figures
 * already shown to the owner in their portal.
 *
 * Reads are best-effort: any failing block is skipped (the draft just has
 * less context) rather than failing the whole action.
 */
export async function getOwnerGroundingContext(
  ownerId: string,
): Promise<OwnerGroundingContext> {
  const db = getDb();
  const facts: string[] = [];
  let ownerName = "this owner";
  if (!db) return { ownerName, facts };
  const organizationId = await requireOrgId();

  // Owner identity.
  try {
    const o = rowsOf<{ display_name: string }>(
      await db.execute(sql`
        SELECT display_name FROM owners
         WHERE id = ${ownerId}::uuid
           AND organization_id = ${organizationId}::uuid
         LIMIT 1
      `),
    )[0];
    if (o?.display_name) ownerName = o.display_name;
  } catch {
    /* ignore */
  }

  // Villas owned (codes + names) for policy / location grounding.
  try {
    const villas = rowsOf<{ unit_code: string | null; name: string | null }>(
      await db.execute(sql`
        SELECT v.unit_code AS unit_code, v.name AS name
          FROM ownership_shares os
          JOIN villas v ON v.id = os.villa_id
         WHERE os.owner_id = ${ownerId}::uuid
           AND os.status = 'active'
           AND os.organization_id = ${organizationId}::uuid
         LIMIT 12
      `),
    );
    if (villas.length > 0) {
      const list = villas
        .map((v) => v.name ?? v.unit_code ?? "Villa")
        .join(", ");
      facts.push(`Owns/co-owns: ${list}.`);
    }
  } catch {
    /* ignore */
  }

  // Most recent few statements: period, status, net payout in USD. This is
  // also the payout source of truth — distributions are derived from `sent`
  // statements (see listMyDistributions), there is no owner_distributions table.
  try {
    const stmts = rowsOf<{
      statement_code: string;
      period_month: string | null;
      status: string;
      net_usd_minor: string | null;
      sent_at: string | null;
    }>(
      await db.execute(sql`
        SELECT s.statement_code            AS statement_code,
               s.period_month::text         AS period_month,
               s.status                     AS status,
               s.net_to_owner_usd_minor::text AS net_usd_minor,
               s.sent_at::text              AS sent_at
          FROM owner_statements s
         WHERE s.owner_id = ${ownerId}::uuid
           AND s.organization_id = ${organizationId}::uuid
         ORDER BY s.period_month DESC NULLS LAST, s.created_at DESC
         LIMIT 6
      `),
    );
    for (const s of stmts.slice(0, 4)) {
      const usd =
        s.net_usd_minor != null
          ? `$${(Number(s.net_usd_minor) / 100).toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}`
          : "—";
      const period = s.period_month ? s.period_month.slice(0, 7) : "—";
      const paid = s.status === "sent" && s.sent_at ? `, sent ${s.sent_at.slice(0, 10)}` : "";
      facts.push(
        `Statement ${s.statement_code} (${period}): status ${s.status}, net to owner ${usd}${paid}.`,
      );
    }
    // YTD distributed must aggregate ALL sent statements this calendar year —
    // NOT just the 6 fetched above. Summing the display window undercounts an
    // owner with >6 statements/year (monthly past June, or multi-villa), and
    // this figure is fed to the LLM as authoritative, so a low number could
    // surface in an owner-facing draft. Dedicated aggregate over the year.
    const ytdRows = rowsOf<{ ytd: string | null }>(
      await db.execute(sql`
        SELECT COALESCE(SUM(s.net_to_owner_usd_minor), 0)::text AS ytd
          FROM owner_statements s
         WHERE s.owner_id = ${ownerId}::uuid
           AND s.organization_id = ${organizationId}::uuid
           AND s.status = 'sent'
           AND s.net_to_owner_usd_minor IS NOT NULL
           AND EXTRACT(YEAR FROM s.period_month) = ${new Date().getUTCFullYear()}
      `),
    );
    const ytdSentMinor = Number(ytdRows[0]?.ytd ?? 0);
    if (ytdSentMinor > 0) {
      facts.push(
        `YTD distributed (sent statements): $${(ytdSentMinor / 100).toLocaleString(
          "en-US",
          { maximumFractionDigits: 0 },
        )}.`,
      );
    }
  } catch {
    /* ignore */
  }

  return { ownerName, facts };
}
