"use client";

import * as React from "react";
import { markStatementViewedAction } from "@/features/owner-statements/actions";

/**
 * FC-OWNER-STATEMENTS §2 #2 — fire-and-forget "mark viewed" on detail open.
 *
 * Renders nothing. The transition can't run during the server render
 * (revalidate is illegal there), so it runs from a mount effect via the
 * server action. Idempotent: the action no-ops once the statement has left
 * `pending`, so re-mounts/re-opens are safe.
 */
export function MarkStatementViewed({ statementId }: { statementId: string }) {
  React.useEffect(() => {
    void markStatementViewedAction(statementId);
  }, [statementId]);
  return null;
}
