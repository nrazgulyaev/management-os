import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listAuditEvents } from "@/features/audit/services";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const actionTone: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  create: "success",
  update: "neutral",
  archive: "warning",
  unarchive: "success",
};

function classify(
  action: string,
): "create" | "update" | "archive" | "unarchive" | "other" {
  if (action.endsWith(".create")) return "create";
  if (action.endsWith(".archive") || action.endsWith(".end")) return "archive";
  if (action.endsWith(".unarchive")) return "unarchive";
  if (action.endsWith(".update") || action.endsWith(".status.update")) return "update";
  return "other";
}

export default async function AuditPage() {
  const events = await listAuditEvents({ limit: 200 });
  const source = events[0]?.source ?? "mock";

  const since24 = Date.now() - 24 * 86_400_000;
  const events24h = events.filter(
    (e) => new Date(e.createdAt).getTime() >= since24,
  ).length;
  const financeWrites = events.filter((e) => e.action.startsWith("finance.")).length;
  const aiInvocations = events.filter((e) => e.action.startsWith("ai.")).length;
  const actors = new Set(
    events.map((e) => e.actorName ?? e.actorEmail).filter(Boolean),
  ).size;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Audit log</span>
          </div>
          <h1>Audit log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Append-only record of meaningful mutations — every server action,
            finance write, and AI invocation. The 200 most recent entries are
            shown.
          </p>
        </div>
        <div className="actions">
          <SourceBadge source={source} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Events · 24h" value={String(events24h)} sub={`${events.length} visible`} />
        <Kpi
          label="Finance writes"
          value={String(financeWrites)}
          sub="signed mutations"
          tone={financeWrites > 0 ? "success" : undefined}
        />
        <Kpi label="AI invocations" value={String(aiInvocations)} sub="agent + copilot" />
        <Kpi label="Distinct actors" value={String(actors)} sub="users + system" tone="gold" />
      </div>

      <DbStatusNotice />

      <div className="card p-0 overflow-hidden mt-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Entity</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <TableEmpty colSpan={5}>No audit events yet.</TableEmpty>
            ) : (
              events.map((e) => {
                const c = classify(e.action);
                const tone = actionTone[c] ?? "neutral";
                const after = (e.after ?? null) as Record<string, unknown> | null;
                const before = (e.before ?? null) as Record<string, unknown> | null;
                const summary =
                  c === "archive"
                    ? "Archived"
                    : c === "create"
                      ? `Created ${e.entityType}`
                      : c === "update"
                        ? Object.keys({ ...(before ?? {}), ...(after ?? {}) })
                            .filter((k) => before?.[k] !== after?.[k])
                            .slice(0, 3)
                            .map((k) => `${k}`)
                            .join(", ") || "Updated"
                        : (e.metadata as Record<string, unknown> | null)?.note?.toString() ??
                          "—";

                return (
                  <tr key={e.id}>
                    <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td>
                      {e.actorName ? (
                        <div className="flex flex-col">
                          <span className="text-[13px] text-ink">{e.actorName}</span>
                          <span className="text-[11px] text-ink-4">{e.actorEmail}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink-3">System</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={tone}>{e.action}</Badge>
                    </td>
                    <td className="text-[13px] text-ink-secondary">
                      {e.entityType}
                      {e.entityId && (
                        <span className="ml-2 mono text-[11px] text-ink-4">
                          {e.entityId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="text-[12px] text-ink-3 truncate max-w-[420px]">
                      {summary as string}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
