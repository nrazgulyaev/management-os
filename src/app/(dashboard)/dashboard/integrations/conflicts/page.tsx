import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/integrations">Integrations</Link> /{" "}
            <span>Conflicts</span>
          </div>
          <h1>Booking conflicts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Calendar overlaps, duplicates, and channel mismatches detected
            during sync.
          </p>
        </div>
      </div>
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
                  <HandoffBadge tone="soft">{c.conflictType}</HandoffBadge>
                </TD>
                <TD>
                  <HandoffBadge
                    tone={
                      c.severity === "critical"
                        ? "danger"
                        : c.severity === "warning"
                          ? "warn"
                          : "info"
                    }
                  >
                    {c.severity}
                  </HandoffBadge>
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
