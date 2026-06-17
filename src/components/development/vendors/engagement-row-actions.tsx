"use client";

/**
 * Per-row engagement actions for the vendor detail page.
 *
 * Mirrors `DevOsRowActions` (kebab dropdown) but targets a vendor
 * engagement row. Visible transitions depend on the engagement's
 * current status:
 *   - active / paused  → "Mark completed" + "Terminate" (reason)
 *   - completed / terminated → no actions (terminal)
 *
 * Both calls route through the existing org-scoped, audited server
 * actions `setEngagementStatus` and `terminateVendorEngagement`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { RowActionsMenu, type RowAction } from "@/components/ui/primitives";
import {
  setEngagementStatus,
  terminateVendorEngagement,
} from "@/lib/development/server/vendor-actions";

export function EngagementRowActions({
  engagementId,
  status,
}: {
  engagementId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isTerminal = status === "completed" || status === "terminated";

  async function markCompleted() {
    if (!window.confirm("Mark this engagement as completed?")) return;
    setError(null);
    setPending(true);
    try {
      await setEngagementStatus(engagementId, "completed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPending(false);
    }
  }

  async function terminate() {
    const reason = window.prompt(
      "Reason for terminating this engagement (required, min 3 chars):",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Termination reason is required (min 3 characters).");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await terminateVendorEngagement(engagementId, reason.trim());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to terminate");
    } finally {
      setPending(false);
    }
  }

  if (isTerminal) {
    return (
      <span className="text-xs text-ink-tertiary">
        {error ? <span className="text-danger">{error}</span> : "—"}
      </span>
    );
  }

  const actions: RowAction[] = [
    {
      id: "complete",
      label: "Mark completed",
      icon: CheckCircle2,
      permitted: !pending,
      onSelect: markCompleted,
    },
    {
      id: "terminate",
      label: "Terminate",
      icon: XCircle,
      tone: "danger" as const,
      permitted: !pending,
      separatorBefore: true,
      onSelect: terminate,
    },
  ];

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <RowActionsMenu actions={actions} triggerLabel="Engagement actions" />
    </div>
  );
}
