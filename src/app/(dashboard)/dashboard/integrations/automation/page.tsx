import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  RunAutomationForRecentButton,
  SeedDefaultRulesButton,
} from "@/components/integrations/automation-actions";
import {
  listBookingAutomationRules,
  listBookingAutomationRuns,
} from "@/features/booking-automation/services";

export const metadata = { title: "Booking automation" };
export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const [rules, runs] = await Promise.all([
    listBookingAutomationRules(),
    listBookingAutomationRuns(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/integrations">Integrations</Link> /{" "}
            <span>Automation</span>
          </div>
          <h1>Booking automation</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Rules that mint operations tasks (turnover cleaning, arrival
            inspection) when a booking lands.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <SeedDefaultRulesButton />
            <RunAutomationForRecentButton />
          </div>
        </div>
      </div>
      <DbStatusNotice />

      <div>
        <div className="label mb-2.5">Rules</div>
        {rules.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No rules yet — click &quot;Seed default rules&quot; to install Arconique's standard
            checkout cleaning + arrival inspection rules.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Rule</TH>
                <TH>Trigger</TH>
                <TH>Category</TH>
                <TH>Title template</TH>
                <TH>Due offset</TH>
                <TH>Priority</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="text-sm font-medium">{r.ruleName}</TD>
                  <TD>
                    <HandoffBadge tone="soft">{r.triggerEvent.replace(/_/g, " ")}</HandoffBadge>
                  </TD>
                  <TD className="text-xs">{r.taskCategory.replace(/_/g, " ")}</TD>
                  <TD className="text-xs text-ink-secondary max-w-[360px] truncate">
                    {r.titleTemplate}
                  </TD>
                  <TD className="text-xs font-mono tabular-nums">
                    {r.dueOffsetMinutes >= 0 ? `+${r.dueOffsetMinutes}` : r.dueOffsetMinutes} min
                  </TD>
                  <TD>
                    <HandoffBadge tone="soft">{r.priority}</HandoffBadge>
                  </TD>
                  <TD>
                    <HandoffBadge tone={r.status === "active" ? "ok" : "soft"}>
                      {r.status}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Recent runs</div>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No automation runs yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Booking</TH>
                <TH>Rule</TH>
                <TH>Status</TH>
                <TH>Task</TH>
                <TH>Reason</TH>
              </TR>
            </THead>
            <TBody>
              {runs.slice(0, 60).map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {r.createdAt.slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD className="font-mono text-xs">{r.bookingCode ?? "—"}</TD>
                  <TD className="text-xs">{r.ruleName ?? "—"}</TD>
                  <TD>
                    <HandoffBadge
                      tone={
                        r.runStatus === "created"
                          ? "ok"
                          : r.runStatus === "skipped"
                            ? "soft"
                            : "danger"
                      }
                    >
                      {r.runStatus}
                    </HandoffBadge>
                  </TD>
                  <TD className="font-mono text-xs">{r.taskCode ?? "—"}</TD>
                  <TD className="text-xs text-ink-tertiary truncate max-w-[280px]">
                    {r.reason ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
