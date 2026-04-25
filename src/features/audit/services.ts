import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents, type NewAuditEvent } from "@/lib/db/schema/audit";
import { appUsers } from "@/lib/db/schema/identity";
import { headers } from "next/headers";
import type { WithSource } from "@/features/types";

export type AuditEventInput = Omit<NewAuditEvent, "id" | "createdAt"> & {
  /** Optional override for the captured IP (otherwise pulled from headers). */
  ipAddress?: string | null;
};

/**
 * Append-only audit write. Silently no-ops when the database is not
 * configured so demo flows do not crash. Errors are logged but never
 * thrown — the caller's primary action must not fail because audit failed.
 */
export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    let ip: string | null | undefined = event.ipAddress;
    let ua: string | null | undefined = event.userAgent;
    if (ip === undefined || ua === undefined) {
      const h = await headers();
      ip ??= h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      ua ??= h.get("user-agent") ?? null;
    }
    await db.insert(auditEvents).values({
      ...event,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
    });
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
