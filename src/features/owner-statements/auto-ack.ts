import "server-only";

import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStatements } from "@/lib/db/schema/finance";
import { recordAuditEvent } from "@/features/audit/services";
import { assertTransition, type OwnerStatementState } from "./state-machine";

export interface AutoAckResult {
  acked: string[];
  count: number;
}

/**
 * FC-OWNER-STATEMENTS §2 #9 / §4.5 — auto-acknowledge sweep.
 *
 * Flips every owner statement still in `pending`|`viewed` whose `auto_ack_at`
 * deadline has passed to `auto_acknowledged`. SILENT (MASTER §4): writes an
 * audit row only — no owner notification, no in-app message.
 *
 * `now` is injectable: this is the contract's **time-travel hook**. Tests set
 * a statement's `auto_ack_at` and call this with a `now` past the 14d window
 * (or pass a future `now`) instead of waiting real time. The function is
 * request-context-free (records audit with null ip/ua, no cache revalidation)
 * so it runs equally from the cron route and from a node test.
 */
export async function runOwnerStatementAutoAck(
  opts: { now?: Date } = {},
): Promise<AutoAckResult> {
  const now = opts.now ?? new Date();
  const db = getDb();
  if (!db) return { acked: [], count: 0 };

  const due = await db
    .select({ id: ownerStatements.id, ownerState: ownerStatements.ownerState })
    .from(ownerStatements)
    .where(
      and(
        inArray(ownerStatements.ownerState, ["pending", "viewed"]),
        isNotNull(ownerStatements.autoAckAt),
        lte(ownerStatements.autoAckAt, now),
      ),
    );

  const acked: string[] = [];
  for (const row of due) {
    // Legal-transition guard still applies to system transitions.
    assertTransition(row.ownerState as OwnerStatementState, "auto_acknowledged");
    await db
      .update(ownerStatements)
      .set({ ownerState: "auto_acknowledged", ownerAckedAt: now, updatedAt: now })
      .where(eq(ownerStatements.id, row.id));
    await recordAuditEvent({
      actorUserId: null,
      action: "statement.auto_acknowledged",
      entityType: "owner_statement",
      entityId: row.id,
      after: { autoAckedAt: now.toISOString() },
      ipAddress: null,
      userAgent: null,
    });
    acked.push(row.id);
  }

  return { acked, count: acked.length };
}
