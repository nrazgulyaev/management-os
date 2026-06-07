import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { paymentProcessorConnections } from "@/lib/db/schema/payment-processors";
import { PaymentConnectionActions } from "@/components/payments/connection-actions-buttons";

export const metadata = { title: "Payment processor connection" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> =
  {
    active: "success",
    error: "danger",
    pending: "warning",
    paused: "warning",
    dry_run: "warning",
    archived: "neutral",
  };

export default async function PaymentConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return <p className="p-6">Database not configured.</p>;
  }
  const [conn] = await db
    .select()
    .from(paymentProcessorConnections)
    .where(eq(paymentProcessorConnections.id, id))
    .limit(1);
  if (!conn) notFound();

  const webhookUrl = `/api/webhooks/payments/${conn.provider}`;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Payments", href: "/dashboard/payments" },
          { label: "Providers", href: "/dashboard/payments/providers" },
          { label: conn.accountName ?? conn.externalAccountId },
        ]}
        eyebrow={conn.provider}
        title={conn.accountName ?? conn.externalAccountId}
        description="Per-connection diagnostics + manual triggers."
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/payments/providers">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All providers
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
            label="Mode"
            value={
              <Badge tone={conn.mode === "live" ? "success" : "neutral"}>
                {conn.mode}
              </Badge>
            }
          />
          <Stat
            label="External account"
            value={
              <span className="font-mono text-xs">{conn.externalAccountId}</span>
            }
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
        <PaymentConnectionActions
          connectionId={conn.id}
          status={conn.status}
        />
      </Section>

      <Section
        title="Webhook configuration"
        description="Copy this URL to the provider's dashboard so they can POST events to us. Signing secret you entered during setup is what verifies inbound events."
      >
        <div className="rounded border border-line-soft bg-canvas/30 p-4">
          <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-2">
            Webhook endpoint
          </div>
          <code className="font-mono text-xs">{webhookUrl}</code>
          <p className="text-xs text-ink-tertiary mt-2">
            Prefix with your dashboard origin (e.g.{" "}
            <code>https://your-domain.com{webhookUrl}</code>) when pasting
            into the provider console.
          </p>
        </div>
      </Section>

      <Section title="Volume">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Stat
            label="Total payments processed"
            value={
              <span className="text-sm tabular-nums">
                {conn.totalPaymentsProcessed.toLocaleString()}
              </span>
            }
          />
          <Stat
            label="Total volume (minor)"
            value={
              <span className="text-sm tabular-nums font-mono">
                {conn.totalVolumeMinor.toString()}
              </span>
            }
          />
        </div>
      </Section>
    </div>
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
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
