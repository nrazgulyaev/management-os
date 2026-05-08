import { Badge } from "@/components/ui/badge";

/**
 * Prompt 112 — Read-only banner shown on admin dashboards when a
 * recently-added table isn't present yet (e.g. migration not applied).
 *
 * Mutation paths must NOT use this — surfacing real errors is still
 * important for write paths.
 */
export function MigrationPendingCard({
  tableName,
  message,
  hint,
}: {
  tableName: string;
  message?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning-weak text-warning p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Badge tone="warning">migration pending</Badge>
        <span className="text-sm font-medium">
          {message ?? `The "${tableName}" table is not present yet.`}
        </span>
      </div>
      <p className="text-xs leading-relaxed">
        {hint ??
          "This module is being deployed. Refresh in a moment, or contact support if the issue persists."}
      </p>
    </div>
  );
}
