import { Badge } from "@/components/ui/badge";
import type { StatementReconciliationWarning } from "@/lib/db/schema/statement-transparency";

const SEVERITY_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "danger" | "success"
> = {
  info: "info",
  warning: "warning",
  critical: "danger",
};

export function StatementWarningList({
  warnings,
  audience = "owner",
}: {
  warnings: StatementReconciliationWarning[];
  audience?: "owner" | "internal";
}) {
  const filtered =
    audience === "owner"
      ? warnings.filter((w) => w.ownerVisible && w.status === "open")
      : warnings;
  if (filtered.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        {audience === "owner"
          ? "Nothing requires your attention on this statement."
          : "No warnings recorded against this statement."}
      </p>
    );
  }
  return (
    <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
      {filtered.map((w) => (
        <li key={w.id} className="px-4 py-3 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone={SEVERITY_TONES[w.severity] ?? "neutral"}>
              {w.severity}
            </Badge>
            <span className="text-sm text-ink font-medium">
              {audience === "owner"
                ? (w.ownerTitle ?? w.internalTitle)
                : w.internalTitle}
            </span>
            {audience === "internal" && (
              <Badge tone={w.status === "open" ? "warning" : "neutral"}>
                {w.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">
            {audience === "owner"
              ? (w.ownerMessage ?? "")
              : w.internalMessage}
          </p>
          {audience === "internal" && w.sourceTable && (
            <p className="text-[10px] text-ink-tertiary font-mono">
              source: {w.sourceTable}
              {w.sourceId ? ` · ${w.sourceId.slice(0, 8)}…` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
