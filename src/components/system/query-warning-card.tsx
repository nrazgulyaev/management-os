import { Badge } from "@/components/ui/badge";
import { MigrationPendingCard } from "./migration-pending-card";

import type { SafeReadResult } from "@/features/system/db-health";

/**
 * Prompt 112 — One-line render for any failed-but-survivable
 * `safeCount` / `safeList` result.  Translates the structured error
 * into either a Migration-pending card or a generic warning, while
 * always letting the page render an empty / fallback view alongside.
 */
export function QueryWarningCard<T>({
  result,
  tableName,
}: {
  result: SafeReadResult<T>;
  tableName?: string;
}) {
  if (result.ok) return null;
  if (
    result.error?.kind === "missing_relation" ||
    result.error?.kind === "missing_column"
  ) {
    return <MigrationPendingCard tableName={tableName ?? result.error.queryName} />;
  }
  if (result.error?.kind === "no_db") {
    return (
      <div className="rounded-md border border-line-soft bg-muted/40 p-4 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">database unavailable</Badge>
          <span className="text-ink">
            Database connection is not active. Live data is hidden.
          </span>
        </div>
        <p className="text-ink-tertiary">
          Contact support to restore database connectivity for this workspace.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-warning/40 bg-warning-weak text-warning p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Badge tone="warning">query warning</Badge>
        <span className="text-sm font-medium">
          {result.error?.queryName ?? "query"} failed.
        </span>
      </div>
      <p className="text-xs leading-relaxed">
        {result.error?.message ?? "Unknown error."}
      </p>
    </div>
  );
}
