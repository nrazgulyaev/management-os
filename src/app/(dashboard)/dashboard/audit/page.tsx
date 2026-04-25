import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

function classify(action: string): "create" | "update" | "archive" | "unarchive" | "other" {
  if (action.endsWith(".create")) return "create";
  if (action.endsWith(".archive") || action.endsWith(".end")) return "archive";
  if (action.endsWith(".unarchive")) return "unarchive";
  if (action.endsWith(".update") || action.endsWith(".status.update")) return "update";
  return "other";
}

export default async function AuditPage() {
  const events = await listAuditEvents({ limit: 200 });
  const source = events[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "System", href: "/dashboard" }, { label: "Audit log" }]}
        title="Audit log"
        description="Append-only record of meaningful mutations. 200 most recent entries shown."
        actions={<SourceBadge source={source} />}
      />
      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Time</TH>
            <TH>Actor</TH>
            <TH>Action</TH>
            <TH>Entity</TH>
            <TH>Summary</TH>
          </TR>
        </THead>
        <TBody>
          {events.length === 0 ? (
            <TR>
              <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                No audit events yet.
              </TD>
            </TR>
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
                <TR key={e.id}>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {new Date(e.createdAt).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TD>
                  <TD>
                    {e.actorName ? (
                      <div className="flex flex-col">
                        <span className="text-sm text-ink">{e.actorName}</span>
                        <span className="text-[11px] text-ink-tertiary">{e.actorEmail}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-tertiary">System</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={tone}>{e.action}</Badge>
                  </TD>
                  <TD className="text-sm text-ink-secondary">
                    {e.entityType}
                    {e.entityId && (
                      <span className="ml-2 font-mono text-[11px] text-ink-tertiary">
                        {e.entityId.slice(0, 8)}…
                      </span>
                    )}
                  </TD>
                  <TD className="text-xs text-ink-secondary truncate max-w-md">
                    {summary as string}
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );
}
