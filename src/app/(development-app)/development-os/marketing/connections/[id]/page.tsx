import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireOrgId } from "@/features/auth/require-org";
import { HandoffBadge, Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { marketingConnections } from "@/lib/db/schema/p4-marketing";
import { MarketingConnectionActions } from "@/components/marketing/connection-actions-buttons";

export const metadata: Metadata = {
  title: "Connection detail · Marketing",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "danger" | "warn" | "soft"> =
  {
    active: "ok",
    error: "danger",
    pending: "warn",
    paused: "warn",
    dry_run: "warn",
    archived: "soft",
    connecting: "warn",
  };

export default async function MarketingConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Connection detail</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const organizationId = await requireOrgId();
  const [conn] = await db
    .select()
    .from(marketingConnections)
    .where(
      and(
        eq(marketingConnections.id, id),
        eq(marketingConnections.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!conn) notFound();

  const lastSyncedDisplay = conn.lastSyncedAt
    ? conn.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
    : "—";

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/marketing/dashboard">Marketing</Link> /{" "}
            <Link href="/development-os/marketing/connections">Connections</Link> /{" "}
            <span>{conn.accountName ?? conn.externalAccountId}</span>
          </div>
          <h1>{conn.accountName ?? conn.externalAccountId}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-connection diagnostics + manual triggers. Cron path syncs every
            6h; use &apos;Sync now&apos; to override.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/connections"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All connections
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Stat
              label="Status"
              value={
                <HandoffBadge tone={STATUS_TONE[conn.status] ?? "soft"}>
                  {conn.status}
                </HandoffBadge>
              }
            />
            <Stat
              label="External account"
              value={
                <span className="font-mono text-xs">{conn.externalAccountId}</span>
              }
            />
            <Stat label="Last sync" value={<span className="text-sm">{lastSyncedDisplay}</span>} />
            <Stat
              label="Last sync result"
              value={
                <span className="text-sm">
                  {conn.lastSyncStatus ?? "—"}
                  {conn.lastSyncRecordsPulled != null && (
                    <span className="text-stone-500 ml-1">
                      · {conn.lastSyncRecordsPulled} rows
                    </span>
                  )}
                </span>
              }
            />
          </div>
          <MarketingConnectionActions
            connectionId={conn.id}
            status={conn.status}
          />
          {conn.lastSyncError && (
            <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <strong>Last error:</strong> {conn.lastSyncError}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Sync configuration</div>
        <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat
              label="Auto-sync"
              value={
                <HandoffBadge tone={conn.autoSyncEnabled ? "ok" : "soft"}>
                  {conn.autoSyncEnabled ? "Enabled" : "Disabled"}
                </HandoffBadge>
              }
            />
            <Stat
              label="Cadence"
              value={`${conn.syncFrequencyMinutes} minutes`}
            />
            <Stat
              label="Connected"
              value={
                <span className="text-sm">
                  {conn.connectedAt
                    ? conn.connectedAt.toISOString().slice(0, 10)
                    : "—"}
                </span>
              }
            />
          </div>
        </Card>
      </div>
    </DevelopmentShell>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-stone-500">
        {label}
      </div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
