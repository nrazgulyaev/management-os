import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  awaiting_review: "warning",
  approved: "success",
  partially_approved: "info",
  rejected: "danger",
  edited_and_approved: "success",
  expired: "neutral",
};

export interface AgentOutputRow {
  id: string;
  outputCode: string;
  title: string;
  status: string;
  confidenceLevel: string | null;
  createdAt: Date | string;
}

export function AgentOutputsTable({
  rows,
  detailHrefBase,
}: {
  rows: AgentOutputRow[];
  detailHrefBase: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No outputs yet"
        description="Trigger this agent from Jobs to generate the first output."
      />
    );
  }
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-ink-tertiary border-b border-line-soft">
          <th className="py-2">Code</th>
          <th>Title</th>
          <th>Confidence</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} className="border-b border-line-soft hover:bg-muted/30">
            <td className="py-2 font-mono text-xs">
              <Link
                href={`${detailHrefBase}/${o.outputCode}`}
                className="hover:underline"
              >
                {o.outputCode}
              </Link>
            </td>
            <td className="truncate max-w-md">{o.title}</td>
            <td>
              <Badge tone="neutral">{o.confidenceLevel ?? "—"}</Badge>
            </td>
            <td>
              <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</Badge>
            </td>
            <td className="text-xs text-ink-tertiary">
              {new Date(o.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
