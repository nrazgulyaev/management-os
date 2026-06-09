/**
 * Stage 10.6.E.2.6 — Platform-admin audit log.
 *
 * Append-only feed of every platform-admin action. v1 surfaces every
 * audit_events row with action prefix "platform.*" — once 10.6.E.2.5
 * (impersonation) ships, it'll emit "platform.impersonate.start" /
 * "platform.impersonate.end" events that automatically appear here.
 */

import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardKpi, ListTableCard } from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listPlatformAuditEntries } from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Audit · Platform Admin OS" };
export const dynamic = "force-dynamic";

export default async function PlatformAuditPage() {
  const entries = await safeQuery(
    "subscription-os.audit",
    listPlatformAuditEntries(200),
    [] as Awaited<ReturnType<typeof listPlatformAuditEntries>>,
    4000,
  );

  // Derived KPI rollups from the live append-only feed (no extra query).
  const cutoff30d = Date.now() - 30 * 86_400_000;
  const last30d = entries.filter((e) => e.createdAt.getTime() >= cutoff30d);
  const impersonations = last30d.filter((e) =>
    e.action.includes("impersonate"),
  ).length;
  const planChanges = last30d.filter((e) => e.action.includes("plan")).length;
  const operators = new Set(
    entries.map((e) => e.actorUserId).filter((id): id is string => Boolean(id)),
  ).size;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Audit" },
        ]}
        eyebrow="Platform · append-only"
        title="Every operator action"
        description="Who, when, what, before/after — for every platform-admin action, including read-only impersonation. Searchable and exportable. Reads audit_events with action prefix 'platform.*'."
      />

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          label="Events · 30d"
          value={String(last30d.length)}
          status="neutral"
          hint="All operators"
        />
        <DashboardKpi
          label="Impersonations"
          value={String(impersonations)}
          status="neutral"
          hint="Read-only · 30d"
        />
        <DashboardKpi
          label="Plan changes"
          value={String(planChanges)}
          status={planChanges > 0 ? "warn" : "neutral"}
          hint="Comp / upgrade · 30d"
        />
        <DashboardKpi
          label="Operators"
          value={String(operators)}
          status="neutral"
          hint="super_admin"
        />
      </div>

      <ListTableCard
        eyebrow="Append-only"
        title="Recent admin actions"
        count={entries.length}
      >
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Actor</TH>
            </TR>
          </THead>
          <TBody>
            {entries.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-center py-12 text-sm text-ink-tertiary">
                  No platform-admin events recorded yet. The 10.6.E.2.5
                  impersonation flow will populate this view.
                </TD>
              </TR>
            ) : (
              entries.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs text-ink-tertiary tabular-nums">
                    {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </TD>
                  <TD>
                    <Badge tone="outline">{e.action}</Badge>
                  </TD>
                  <TD className="text-sm">
                    <span className="text-ink">{e.entityType}</span>
                    {e.entityId && (
                      <span className="text-ink-tertiary font-mono text-xs ml-1.5">
                        {e.entityId.slice(0, 8)}…
                      </span>
                    )}
                  </TD>
                  <TD className="text-sm">
                    {e.actorName ?? e.actorEmail ?? (
                      <span className="text-ink-tertiary">system</span>
                    )}
                    {e.actorEmail && e.actorName && (
                      <span className="text-xs text-ink-tertiary ml-1.5">
                        {e.actorEmail}
                      </span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </ListTableCard>
    </div>
  );
}
