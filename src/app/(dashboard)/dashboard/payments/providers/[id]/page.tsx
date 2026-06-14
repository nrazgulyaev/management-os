import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { paymentProcessorConnections } from "@/lib/db/schema/payment-processors";
import { PaymentConnectionActions } from "@/components/payments/connection-actions-buttons";

export const metadata = { title: "Payment processor connection" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "danger" | "warn" | "soft"> =
  {
    active: "ok",
    error: "danger",
    pending: "warn",
    paused: "warn",
    dry_run: "warn",
    archived: "soft",
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
  // Org-scoped read — a connection id from another tenant 404s.
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    notFound();
  }
  const [conn] = await db
    .select()
    .from(paymentProcessorConnections)
    .where(
      and(
        eq(paymentProcessorConnections.id, id),
        eq(paymentProcessorConnections.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!conn) notFound();

  // Xendit has a dedicated top-level route (per-org callback-token
  // verification); the others share the /payments/<provider> envelope.
  const webhookUrl =
    conn.provider === "xendit"
      ? "/api/webhooks/xendit"
      : `/api/webhooks/payments/${conn.provider}`;

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/payments">Payments</Link> /{" "}
            <Link href="/dashboard/payments/providers">Providers</Link> /{" "}
            <span>{conn.accountName ?? conn.externalAccountId}</span>
          </div>
          <h1>{conn.accountName ?? conn.externalAccountId}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-connection diagnostics + manual triggers.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/payments/providers"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All providers
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
              label="Mode"
              value={
                <HandoffBadge tone={conn.mode === "live" ? "ok" : "soft"}>
                  {conn.mode}
                </HandoffBadge>
              }
            />
            <Kpi
              label="External account"
              value={
                <span className="font-mono text-xs">
                  {conn.externalAccountId}
                </span>
              }
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
          <PaymentConnectionActions
            connectionId={conn.id}
            status={conn.status}
          />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Webhook configuration</div>
        <Card padding="default">
          <p className="text-[13px] text-ink-3 mb-4 max-w-[680px]">
            {conn.provider === "xendit"
              ? "Copy this URL into the Xendit dashboard (Settings → Developers → Webhooks → Invoices). Inbound callbacks are verified against the callback verification token you entered during setup."
              : "Copy this URL to the provider's dashboard so they can POST events to us. Signing secret you entered during setup is what verifies inbound events."}
          </p>
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Volume</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Total payments processed"
              value={
                <span className="text-sm tabular-nums">
                  {conn.totalPaymentsProcessed.toLocaleString()}
                </span>
              }
            />
            <Kpi
              label="Total volume (minor)"
              value={
                <span className="text-sm tabular-nums font-mono">
                  {conn.totalVolumeMinor.toString()}
                </span>
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
