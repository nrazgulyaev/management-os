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
import { bankConnections } from "@/lib/db/schema/banking";
import { BankConnectionActions } from "@/components/banking/connection-actions-buttons";

export const metadata: Metadata = {
  title: "Bank connection · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> =
  {
    active: "success",
    error: "danger",
    pending: "warning",
    paused: "warning",
    dry_run: "warning",
    archived: "neutral",
    connecting: "warning",
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
        <PageHeader title="Bank connection" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Banking", href: "/development-os/banking" },
          { label: conn.accountName ?? conn.externalAccountId },
        ]}
        eyebrow={conn.provider}
        title={conn.accountName ?? conn.externalAccountId}
        description="Per-connection diagnostics + manual triggers."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/banking">
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
            label="External ID"
            value={
              <span className="font-mono text-xs">{conn.externalAccountId}</span>
            }
          />
          <Stat label="Currency" value={<span className="font-mono">{conn.currency}</span>} />
          <Stat
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

      {(conn.provider === "mandiri" ||
        conn.provider === "bca" ||
        conn.provider === "manual") && (
        <Section title="Statement upload">
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
        </Section>
      )}
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
