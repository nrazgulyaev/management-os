import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStatements } from "@/lib/db/schema/finance";

/**
 * Owner-side dispute state for a single statement — the two columns the
 * statement detail page needs to decide whether to show "Raise a dispute"
 * or "dispute open". Kept separate from the mgmt-side OwnerStatementRow
 * (finance/services) which doesn't carry the owner-state machine fields.
 */
export interface StatementDisputeState {
  ownerState: string;
  disputeThreadId: string | null;
  alreadyDisputed: boolean;
}

export async function getStatementDisputeState(
  statementId: string,
): Promise<StatementDisputeState> {
  const db = getDb();
  if (!db) {
    return { ownerState: "pending", disputeThreadId: null, alreadyDisputed: false };
  }
  const [row] = await db
    .select({
      ownerState: ownerStatements.ownerState,
      disputeThreadId: ownerStatements.disputeThreadId,
    })
    .from(ownerStatements)
    .where(eq(ownerStatements.id, statementId))
    .limit(1);
  const ownerState = row?.ownerState ?? "pending";
  const disputeThreadId = row?.disputeThreadId ?? null;
  return {
    ownerState,
    disputeThreadId,
    alreadyDisputed: disputeThreadId !== null || ownerState === "disputed",
  };
}
