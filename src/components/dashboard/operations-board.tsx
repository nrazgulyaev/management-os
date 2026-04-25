import { StatusPill, statusLabel } from "@/components/ui/status-pill";
import {
  statusBoardSummary,
  housekeepingTasks,
  maintenanceTickets,
} from "@/lib/mock/operations";
import { mockVillas } from "@/lib/mock/villas";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock } from "lucide-react";

export function OperationsBoard() {
  return (
    <div className="flex flex-col gap-6">
      {/* Status board summary */}
      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-label">Status board · live</span>
          <span className="text-xs text-ink-tertiary">
            {mockVillas.length} villas · updated just now
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {statusBoardSummary.map((s) => (
            <div
              key={s.status}
              className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
            >
              <div className="text-[10px] uppercase tracking-widest text-ink-tertiary truncate">
                {statusLabel[s.status]}
              </div>
              <div className="font-mono tabular-nums text-2xl text-ink">
                {s.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Villa grid */}
      <div>
        <div className="mb-4">
          <span className="text-label">All villas</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {mockVillas.map((v) => (
            <div
              key={v.id}
              className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-tertiary">
                  {v.code}
                </span>
                <StatusPill status={v.status} />
              </div>
              <div>
                <div className="text-ink font-medium text-sm">{v.name}</div>
                <div className="text-xs text-ink-tertiary">{v.project}</div>
              </div>
              <div className="mt-auto pt-3 border-t border-line-soft flex items-center justify-between text-xs">
                {v.nextArrival ? (
                  <span className="text-ink-secondary">
                    Arr {new Date(v.nextArrival.dateISO).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {v.nextArrival.nights}n
                  </span>
                ) : v.nextDeparture ? (
                  <span className="text-ink-secondary">
                    Dep {new Date(v.nextDeparture.dateISO).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                ) : (
                  <span className="text-ink-tertiary">No upcoming</span>
                )}
                {v.openTickets > 0 && (
                  <Badge tone="warning">{v.openTickets} ticket{v.openTickets > 1 ? "s" : ""}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Housekeeping + Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Housekeeping */}
        <div className="rounded-lg bg-surface border border-line-soft overflow-hidden">
          <div className="p-5 border-b border-line-soft">
            <span className="text-label">Housekeeping · today</span>
            <h3 className="text-base font-medium text-ink mt-2">
              {housekeepingTasks.length} active turnovers
            </h3>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Villa</TH>
                <TH>Assignee</TH>
                <TH>Progress</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {housekeepingTasks.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ink text-sm">{t.villa}</span>
                      <span className="text-[11px] text-ink-tertiary tabular-nums">
                        {t.scheduledAt}
                      </span>
                    </div>
                  </TD>
                  <TD className="text-ink-secondary text-sm">{t.assignee}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${t.progress}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-ink-tertiary">
                        {t.checklistDone}/{t.checklistTotal}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    {t.status === "in_progress" && (
                      <Badge tone="info">In progress</Badge>
                    )}
                    {t.status === "awaiting_approval" && (
                      <Badge tone="warning">Supervisor review</Badge>
                    )}
                    {t.status === "queued" && <Badge tone="neutral">Queued</Badge>}
                    {t.status === "approved" && (
                      <Badge tone="success">Approved</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        {/* Maintenance */}
        <div className="rounded-lg bg-surface border border-line-soft overflow-hidden">
          <div className="p-5 border-b border-line-soft">
            <span className="text-label">Maintenance · open tickets</span>
            <h3 className="text-base font-medium text-ink mt-2">
              {maintenanceTickets.length} tickets across 3 villas
            </h3>
          </div>
          <div className="divide-y divide-line-soft">
            {maintenanceTickets.map((t) => (
              <div key={t.id} className="p-5 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-tertiary">
                        {t.villaCode}
                      </span>
                      <Badge
                        tone={
                          t.priority === "p1"
                            ? "danger"
                            : t.priority === "p2"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {t.priority.toUpperCase()}
                      </Badge>
                      <Badge tone="outline">{t.category}</Badge>
                    </div>
                    <p className="text-sm text-ink mt-2">{t.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center gap-1 text-[11px] text-ink-tertiary tabular-nums">
                      <Clock className="w-3 h-3" />
                      {t.openedAgo}
                    </div>
                    {t.sla === "warn" && (
                      <div className="flex items-center gap-1 text-[11px] text-warning mt-1">
                        <AlertCircle className="w-3 h-3" />
                        SLA warn
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-tertiary">
                    {t.assignee ? `Assignee · ${t.assignee}` : "Unassigned"}
                  </span>
                  <Badge tone="outline">{t.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
