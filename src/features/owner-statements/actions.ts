"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStatements } from "@/lib/db/schema/finance";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import type { OwnerActionState } from "@/features/owner-portal/notification-prefs-types";
import {
  assertOwnerWritable,
  assertTransition,
  canTransition,
  type OwnerStatementState,
} from "@/features/owner-statements/state-machine";
import { emitStatementEvent } from "@/features/owner-statements/events";

/**
 * Owner-statement lifecycle actions (FC-OWNER-STATEMENTS §2 #2, #5).
 *
 * Every owner-initiated transition runs through the server-enforced state
 * machine: legal edge checked with {@link assertTransition}, the update patch
 * checked with {@link assertOwnerWritable} (owner can never write a number),
 * and the cross-surface signal sent via {@link emitStatementEvent} so the Mgmt
 * finance list / attention-feed pick it up with no manual refresh.
 */

/** #2 — opening the detail marks the statement viewed (pending → viewed). Idempotent. */
export async function markStatementViewedAction(
  statementId: string,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [stmt] = await db
    .select({
      id: ownerStatements.id,
      ownerId: ownerStatements.ownerId,
      ownerState: ownerStatements.ownerState,
    })
    .from(ownerStatements)
    .where(eq(ownerStatements.id, statementId))
    .limit(1);
  if (!stmt || stmt.ownerId !== auth.ownerId) {
    return { ok: false, error: "Statement not found." };
  }

  // Only the first open transitions; viewing again (or after acting) is a no-op.
  if (!canTransition(stmt.ownerState as OwnerStatementState, "viewed")) {
    return { ok: true };
  }
  assertTransition(stmt.ownerState as OwnerStatementState, "viewed");

  const patch = { ownerState: "viewed", ownerViewedAt: new Date(), updatedAt: new Date() };
  assertOwnerWritable(patch);
  await db.update(ownerStatements).set(patch).where(eq(ownerStatements.id, statementId));

  await emitStatementEvent({ verb: "viewed", statementId, actorUserId: auth.appUserId });
  return { ok: true };
}

/** #5 — owner explicitly acknowledges (→ acknowledged, terminal-ish). */
export async function acknowledgeStatementAction(
  statementId: string,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [stmt] = await db
    .select({
      id: ownerStatements.id,
      ownerId: ownerStatements.ownerId,
      ownerState: ownerStatements.ownerState,
    })
    .from(ownerStatements)
    .where(eq(ownerStatements.id, statementId))
    .limit(1);
  if (!stmt || stmt.ownerId !== auth.ownerId) {
    return { ok: false, error: "Statement not found." };
  }

  const from = stmt.ownerState as OwnerStatementState;
  if (!canTransition(from, "acknowledged")) {
    return {
      ok: false,
      error:
        from === "acknowledged"
          ? "This statement is already acknowledged."
          : `A ${from} statement can no longer be acknowledged.`,
    };
  }
  assertTransition(from, "acknowledged");

  // Auto-ack timer is implicitly cancelled: the cron only fires for
  // owner_state IN ('pending','viewed'), so leaving auto_ack_at set is inert.
  const patch = { ownerState: "acknowledged", ownerAckedAt: new Date(), updatedAt: new Date() };
  assertOwnerWritable(patch);
  await db.update(ownerStatements).set(patch).where(eq(ownerStatements.id, statementId));

  await emitStatementEvent({ verb: "acknowledged", statementId, actorUserId: auth.appUserId });
  return { ok: true };
}
