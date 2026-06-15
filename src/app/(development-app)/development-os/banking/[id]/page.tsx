import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge, Kpi } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { bankConnections } from "@/lib/db/schema/banking";
import { BankConnectionActions } from "@/components/banking/connection-actions-buttons";

export const metadata: Metadata = {
  title: "Bank connection · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "danger" | "warn" | "soft"> = {
  active: "ok",
  error: "danger",
  pending: "warn",
  paused: "warn",
  dry_run: "warn",
  archived: "soft",
  connecting: "warn",
};

export default async function BankConnectionDetailPage({
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
            <h1>Bank connection</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [conn] = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.id, id))
    .limit(1);
  if (!conn) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/banking">Banking</Link> /{" "}
            <span>{conn.accountName ?? conn.externalAccountId}</span>
          </div>
          <h1>{conn.accountName ?? conn.externalAccountId}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-connection diagnostics + manual triggers.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/banking" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All connections
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi
              label="Status"
              value={
                <HandoffBadge tone={STATUS_TONE[conn.status] ?? "soft"}>
                  {conn.status}
                </HandoffBadge>
              }
            />
            <Kpi
              label="External ID"
              value={
                <span className="font-mono text-xs">{conn.externalAccountId}</span>
              }
            />
            <Kpi label="Currency" value={<span className="font-mono">{conn.currency}</span>} />
            <Kpi
              label="Last sync"
              value={
                <span className="text-sm">
                  {conn.lastSyncedAt
                    ? conn.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
                    : "—"}
                </span>
              }
            />
          </div>
          <BankConnectionActions
            connectionId={conn.id}
            status={conn.status}
            provider={conn.provider}
          />
          {conn.lastSyncError && (
            <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <strong>Last error:</strong> {conn.lastSyncError}
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Sync configuration</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi
              label="Auto-sync"
              value={
                <HandoffBadge tone={conn.autoSyncEnabled ? "ok" : "soft"}>
                  {conn.autoSyncEnabled ? "Enabled" : "Disabled"}
                </HandoffBadge>
              }
            />
            <Kpi
              label="Cadence"
              value={`${conn.syncFrequencyMinutes} minutes`}
            />
            <Kpi
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

      {(conn.provider === "mandiri" ||
        conn.provider === "bca" ||
        conn.provider === "manual") && (
        <div>
          <div className="label mb-2.5">Statement upload</div>
          <Card padding="default">
            <p className="text-sm text-stone-600">
              This provider ingests transactions via CSV statement upload. Use{" "}
              <Link
                href="/development-os/finance/statement-import"
                className="underline"
              >
                /finance/statement-imports
              </Link>{" "}
              to upload statements; the parser links them back to this account.
            </p>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
