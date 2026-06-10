import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb, requireDb } from "@/lib/db/client";
import { auditEvents, type NewAuditEvent } from "@/lib/db/schema/audit";
import { appUsers } from "@/lib/db/schema/identity";
import { headers } from "next/headers";
import type { WithSource } from "@/features/types";

export type AuditEventInput = Omit<NewAuditEvent, "id" | "createdAt"> & {
  /** Optional override for the captured IP (otherwise pulled from headers). */
  ipAddress?: string | null;
};

/**
 * A transaction handle as handed to `db.transaction(async (tx) => …)`. Callers
 * that need the audit row to commit/rollback atomically with a money/inventory
 * write pass their own `tx` here (see {@link recordAuditEvent}'s `tx` option).
 */
type AuditTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

export interface RecordAuditEventOptions {
  /**
   * Optional transaction handle. When provided, the audit row is written on the
   * caller's transaction so it commits/rolls back atomically with the primary
   * write AND a failed insert propagates (the txn must abort together). When
   * omitted (the default), the write goes to the outer db and errors are
   * swallowed — audit never breaks a best-effort action.
   */
  tx?: AuditTx;
}

/**
 * Append-only audit write. Silently no-ops when the database is not
 * configured so demo flows do not crash.
 *
 * Default (no `tx`): runs against the outer db and errors are logged but never
 * thrown — the caller's primary action must not fail because audit failed.
 *
 * With `opts.tx`: runs on the caller's transaction so the audit row is atomic
 * with the money/inventory write. Insert errors are NOT swallowed in this mode
 * — they must abort the surrounding transaction so we never commit a money
 * move whose audit silently failed.
 */
export async function recordAuditEvent(
  event: AuditEventInput,
  opts?: RecordAuditEventOptions,
): Promise<void> {
  const writer = opts?.tx ?? getDb();
  if (!writer) return;

  let ip: string | null | undefined = event.ipAddress;
  let ua: string | null | undefined = event.userAgent;

  const insert = async () => {
    if (ip === undefined || ua === undefined) {
      const h = await headers();
      ip ??= h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      ua ??= h.get("user-agent") ?? null;
    }
    await writer.insert(auditEvents).values({
      ...event,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
    });
  };

  // Atomic mode: let the error propagate so the caller's txn aborts with it.
  if (opts?.tx) {
    await insert();
    return;
  }

  try {
    await insert();
  } catch (err) {
    // Don't propagate — audit must not break the action.
    console.error("[audit] failed to record event", err);
  }
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

const fallbackAudit: WithSource<AuditRow>[] = [
  {
    source: "mock",
    id: "demo-1",
    action: "project.update",
    entityType: "project",
    entityId: null,
    actorUserId: null,
    actorName: "Demo · Director",
    actorEmail: "demo@arconique.com",
    before: { status: "active" },
    after: { status: "managed" },
    metadata: { note: "Demo entry — connect a database to see real audit events." },
    ipAddress: null,
    userAgent: null,
    createdAt: new Date().toISOString(),
  },
];

export async function listAuditEvents(opts?: {
  limit?: number;
  entityType?: string;
  entityId?: string;
}): Promise<WithSource<AuditRow>[]> {
  const db = getDb();
  if (!db) return fallbackAudit;

  const limit = opts?.limit ?? 100;
  const rows = await db
    .select({
      e: auditEvents,
      actorName: appUsers.fullName,
      actorEmail: appUsers.email,
    })
    .from(auditEvents)
    .leftJoin(appUsers, eq(appUsers.id, auditEvents.actorUserId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    source: "db",
    id: r.e.id,
    action: r.e.action,
    entityType: r.e.entityType,
    entityId: r.e.entityId,
    actorUserId: r.e.actorUserId,
    actorName: r.actorName,
    actorEmail: r.actorEmail,
    before: r.e.before,
    after: r.e.after,
    metadata: r.e.metadata,
    ipAddress: r.e.ipAddress,
    userAgent: r.e.userAgent,
    createdAt: r.e.createdAt.toISOString(),
  }));
}

export async function getAuditEventById(id: string): Promise<WithSource<AuditRow> | null> {
  const db = getDb();
  if (!db) return fallbackAudit[0] ?? null;
  const [r] = await db
    .select({
      e: auditEvents,
      actorName: appUsers.fullName,
      actorEmail: appUsers.email,
    })
    .from(auditEvents)
    .leftJoin(appUsers, eq(appUsers.id, auditEvents.actorUserId))
    .where(eq(auditEvents.id, id))
    .limit(1);
  if (!r) return null;
  return {
    source: "db",
    id: r.e.id,
    action: r.e.action,
    entityType: r.e.entityType,
    entityId: r.e.entityId,
    actorUserId: r.e.actorUserId,
    actorName: r.actorName,
    actorEmail: r.actorEmail,
    before: r.e.before,
    after: r.e.after,
    metadata: r.e.metadata,
    ipAddress: r.e.ipAddress,
    userAgent: r.e.userAgent,
    createdAt: r.e.createdAt.toISOString(),
  };
}
