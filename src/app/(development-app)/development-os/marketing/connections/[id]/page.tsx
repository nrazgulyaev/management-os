import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { marketingConnections } from "@/lib/db/schema/p4-marketing";
import { MarketingConnectionActions } from "@/components/marketing/connection-actions-buttons";

export const metadata: Metadata = {
  title: "Connection detail · Marketing",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> =
  {
    active: "success",
    error: "danger",
    pending: "warning",
    paused: "warning",
    archived: "neutral",
    connecting: "warning",
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
        <PageHeader title="Connection detail" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [conn] = await db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.id, id))
    .limit(1);
  if (!conn) notFound();

  const lastSyncedDisplay = conn.lastSyncedAt
    ? conn.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
    : "—";

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing", href: "/development-os/marketing/dashboard" },
          {
            label: "Connections",
            href: "/development-os/marketing/connections",
          },
          { label: conn.accountName ?? conn.externalAccountId },
        ]}
        eyebrow={conn.provider}
        title={conn.accountName ?? conn.externalAccountId}
        description="Per-connection diagnostics + manual triggers. Cron path syncs every 6h; use 'Sync now' to override."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/connections">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All connections
            </Link>
          </Button>
        }
      />

      <Section title="Status">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <Stat
            label="Status"
            value={
              <Badge tone={STATUS_TONE[conn.status] ?? "neutral"}>
                {conn.status}
              </Badge>
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
      </Section>

      <Section title="Sync configuration">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat
            label="Auto-sync"
            value={
              <Badge tone={conn.autoSyncEnabled ? "success" : "neutral"}>
                {conn.autoSyncEnabled ? "Enabled" : "Disabled"}
              </Badge>
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
      </Section>
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
