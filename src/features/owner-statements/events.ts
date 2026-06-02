import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";

/**
 * Cross-surface transport seam — FC-OWNER-STATEMENTS §9 (resolved).
 *
 * Decision: DB-state is the source of truth; each owner/admin action records a
 * named `statement.<verb>` domain event to the append-only audit log and then
 * revalidates BOTH surfaces' caches, so the consuming surface (Mgmt Finance
 * list + dashboard attention-feed, which already DB-poll `owner_state`)
 * re-renders the new state on its next load — no manual refresh, no
 * poll-and-hope. postMessage (separate routes, not same-tab frames), a queue
 * (no infra), and Supabase Realtime (large add) were rejected; Realtime is the
 * future swap-in and is intentionally confined to THIS file.
 *
 * Event-name convention (MASTER §3): `<entity>.<verb>`.
 */
export type StatementEventVerb =
  | "viewed"
  | "acknowledged"
  | "disputed"
  | "auto_acknowledged"
  | "superseded";

export const ownerStatementTag = (statementId: string) => `owner-statement:${statementId}`;

export async function emitStatementEvent(args: {
  verb: StatementEventVerb;
  statementId: string;
  /** Acting user; null for system transitions (auto-ack cron). */
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await recordAuditEvent({
    actorUserId: args.actorUserId ?? null,
    action: `statement.${args.verb}`,
    entityType: "owner_statement",
    entityId: args.statementId,
    after: args.payload ?? null,
  });

  // Owner surface.
  revalidatePath(`/owner/statements/${args.statementId}`);
  revalidatePath("/owner/statements");
  revalidateTag(ownerStatementTag(args.statementId));

  // Mgmt surface — the DB-poll consumers (finance statements list + the
  // cross-cabinet attention-feed on the dashboard) pick up the new owner_state.
  revalidatePath("/dashboard/finance/statements");
  revalidatePath("/dashboard");
}
