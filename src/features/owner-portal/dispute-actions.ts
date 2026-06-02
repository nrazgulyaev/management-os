"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { ownerStatements } from "@/lib/db/schema/finance";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import {
  assertOwnerWritable,
  assertTransition,
  canTransition,
  type OwnerStatementState,
} from "@/features/owner-statements/state-machine";
import { emitStatementEvent } from "@/features/owner-statements/events";
import type { OwnerActionState } from "@/features/owner-portal/notification-prefs-types";

/**
 * Owner raises a dispute on a statement.
 *
 * Wires the existing dispute-modal to real persistence:
 *   1. create an owner_threads row (kind='dispute', linked to the statement)
 *   2. seed the first owner_messages row (actorKind='owner', the detail)
 *   3. flip the statement's owner-side state to 'disputed' + link the thread
 *      + stamp owner_disputed_at + dispute_reason_kind
 *
 * Maps the modal's reason vocab (line_wrong | missing_revenue |
 * fees_too_high | other) to owner_statements.dispute_reason_kind's
 * documented enum (line_amount | line_missing | fees_too_high | other).
 * Owner-scoped; impersonating super-admins are read-only.
 */

const REASON_MAP: Record<string, string> = {
  line_wrong: "line_amount",
  missing_revenue: "line_missing",
  fees_too_high: "fees_too_high",
  other: "other",
};

const disputeSchema = z.object({
  statementId: z.string().uuid(),
  reasonKind: z.enum(["line_wrong", "missing_revenue", "fees_too_high", "other"]),
  detail: z.string().trim().min(1, "Add a detail.").max(4000),
});

export async function raiseStatementDisputeAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = disputeSchema.safeParse({
    statementId: formData.get("statementId"),
    reasonKind: formData.get("reasonKind"),
    detail: formData.get("detail"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid dispute." };
  }
  const { statementId, reasonKind, detail } = parsed.data;

  // Authorize: the statement must belong to this owner.
  const [stmt] = await db
    .select({
      id: ownerStatements.id,
      ownerId: ownerStatements.ownerId,
      code: ownerStatements.statementCode,
      ownerState: ownerStatements.ownerState,
      existingThreadId: ownerStatements.disputeThreadId,
    })
    .from(ownerStatements)
    .where(eq(ownerStatements.id, statementId))
    .limit(1);
  if (!stmt || stmt.ownerId !== auth.ownerId) {
    return { ok: false, error: "Statement not found." };
  }
  if (stmt.existingThreadId) {
    return { ok: false, error: "A dispute is already open for this statement." };
  }
  // Server-enforced transition (MASTER §6) — e.g. a superseded statement can
  // no longer be disputed, even if a crafted request reaches the action.
  if (!canTransition(stmt.ownerState as OwnerStatementState, "disputed")) {
    return { ok: false, error: `A ${stmt.ownerState} statement can no longer be disputed.` };
  }
  assertTransition(stmt.ownerState as OwnerStatementState, "disputed");

  // 1) thread
  const [thread] = await db
    .insert(ownerThreads)
    .values({
      ownerId: auth.ownerId,
      subject: `Dispute · ${stmt.code}`,
      kind: "dispute",
      relatedEntityType: "statement",
      relatedEntityId: statementId,
      status: "open",
      unreadCount: 1,
    })
    .returning({ id: ownerThreads.id });

  // 2) first message (owner)
  await db.insert(ownerMessages).values({
    threadId: thread.id,
    actorKind: "owner",
    actorId: auth.appUserId,
    body: detail,
  });

  // 3) flip statement owner-state + link thread
  const reasonKindStored = REASON_MAP[reasonKind] ?? "other";
  const patch = {
    ownerState: "disputed",
    ownerDisputedAt: new Date(),
    disputeReasonKind: reasonKindStored,
    disputeThreadId: thread.id,
    updatedAt: new Date(),
  };
  assertOwnerWritable(patch);
  await db.update(ownerStatements).set(patch).where(eq(ownerStatements.id, statementId));

  // Cross-surface: records statement.disputed + revalidates owner & mgmt
  // surfaces so the Finance list / attention-feed flip with no manual sync.
  await emitStatementEvent({
    verb: "disputed",
    statementId,
    actorUserId: auth.appUserId,
    payload: { reasonKind: reasonKindStored, threadId: thread.id },
  });
  revalidatePath("/owner/inbox");
  return { ok: true };
}
