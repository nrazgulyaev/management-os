import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listConnectionsForUi } from "@/lib/marketing/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Connections · Marketing" };
export const dynamic = "force-dynamic";

export default async function MarketingConnectionsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Connections</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const connections = await safeQuery(
    "marketing-connections.list",
    listConnectionsForUi(),
    [] as Awaited<ReturnType<typeof listConnectionsForUi>>,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/marketing/dashboard">Marketing</Link> /{" "}
            <span>Connections</span>
          </div>
          <h1>Marketing connections</h1>
          <div className="label mt-2">{`${connections.length} connections · ${connections.filter((c) => c.status === "active").length} active`}</div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-platform integration configuration. Credentials are encrypted at
            rest via STAY_LINK_KMS_SECRET. Sync cadence: 6h for campaigns, 3h for
            metrics, 1h for attribution.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/connections/new"
            className="btn btn-accent btn-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            Connect provider
          </Link>
          <Link
            href="/development-os/marketing/dashboard"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Marketing
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Connections</div>
        {connections.length === 0 ? (
          <EmptyState
            title="No marketing connections yet"
            description="Click 'Connect provider' to wire GA4, Google Ads, Meta Pixel, Meta Ads, TikTok Ads, Mailchimp, or ConvertKit. Credentials persist on this organization."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Provider</TH>
                <TH>Account</TH>
                <TH>Status</TH>
                <TH>Last sync</TH>
                <TH>Result</TH>
                <TH className="text-right">Last sync rows</TH>
              </TR>
            </THead>
            <TBody>
              {connections.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/development-os/marketing/connections/${c.id}`}
                      className="text-stone-700 hover:text-stone-900 hover:underline"
                    >
                      <HandoffBadge tone="soft">{c.provider}</HandoffBadge>
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    <Link
                      href={`/development-os/marketing/connections/${c.id}`}
                      className="hover:underline"
                    >
                      {c.accountName ?? c.externalAccountId}
                    </Link>
                  </TD>
                  <TD>
                    <HandoffBadge
                      tone={
                        c.status === "active"
                          ? "ok"
                          : c.status === "error"
                            ? "danger"
                            : c.status === "dry_run"
                              ? "warn"
                              : "soft"
                      }
                    >
                      {c.status}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {c.lastSyncedAt
                      ? new Date(c.lastSyncedAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "—"}
                  </TD>
                  <TD className="text-xs">{c.lastSyncStatus ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {c.lastSyncRecordsPulled ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
