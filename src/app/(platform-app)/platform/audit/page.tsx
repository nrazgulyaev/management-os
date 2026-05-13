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
import { ListTableCard } from "@/components/ui/primitives";
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

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Audit" },
        ]}
        eyebrow={`${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
        title="Platform-admin audit log"
        description="Every platform-admin action logged. Append-only. Reads audit_events with action prefix 'platform.*'. The 10.6.E.2.5 impersonation flow will emit entries here."
      />

      <ListTableCard
        eyebrow="Activity"
        title="Recent platform-admin actions"
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
