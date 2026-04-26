import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ConflictStatusPill } from "@/components/integrations/feed-status-pill";
import { ConflictActions } from "@/components/integrations/conflict-actions";
import { listBookingConflicts } from "@/features/integrations/calendar-sync/services";

export const metadata = { title: "Booking conflicts" };
export const dynamic = "force-dynamic";

export default async function ConflictsPage() {
  const conflicts = await listBookingConflicts();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Integrations", href: "/dashboard/integrations" },
          { label: "Conflicts" },
        ]}
        title="Booking conflicts"
        description="Calendar overlaps, duplicates, and channel mismatches detected during sync."
      />
      <DbStatusNotice />
      {conflicts.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No conflicts on record.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Villa</TH>
              <TH>Type</TH>
              <TH>Severity</TH>
              <TH>Status</TH>
              <TH>Description</TH>
              <TH>Booking / event</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <TBody>
            {conflicts.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs">{c.villaCode ?? "—"}</TD>
                <TD>
                  <Badge tone="outline">{c.conflictType}</Badge>
                </TD>
                <TD>
                  <Badge
                    tone={
                      c.severity === "critical"
                        ? "danger"
                        : c.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                  >
                    {c.severity}
                  </Badge>
                </TD>
                <TD>
                  <ConflictStatusPill status={c.status} />
                </TD>
                <TD className="text-xs max-w-[420px]">{c.description}</TD>
                <TD className="text-xs text-ink-secondary">
                  {c.bookingCode && <div className="font-mono">{c.bookingCode}</div>}
                  {c.externalUid && (
                    <div className="text-ink-tertiary truncate max-w-[180px]">
                      {c.externalUid}
                    </div>
                  )}
                </TD>
                <TD>
                  <ConflictActions id={c.id} status={c.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
