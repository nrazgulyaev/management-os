import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Card, Kpi, SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getDepositMetrics,
  listPaymentProviderAccounts,
  listPaymentWebhookEvents,
} from "@/features/direct-booking/deposits";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const PROVIDER_TONE: Record<string, "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  archived: "neutral",
};

const WEBHOOK_TONE: Record<
  string,
  "info" | "success" | "warning" | "neutral" | "danger"
> = {
  received: "info",
  processed: "success",
  ignored: "neutral",
  failed: "danger",
};

function money(minor: bigint, currency: string | null): string {
  const whole = minor / 100n;
  const frac = (minor < 0n ? -minor : minor) % 100n;
  return `${whole}.${String(frac).padStart(2, "0")} ${currency ?? ""}`.trim();
}

function fmtTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function PaymentsHub() {
  const { allowed } = await requireCabinetAccess("finance");
  if (!allowed) return <CabinetGate cabinet="Payments" />;
  const [m, providers, webhooks] = await Promise.all([
    getDepositMetrics(),
    safeQuery(
      "payments.listProviderAccounts",
      listPaymentProviderAccounts(),
      [] as Awaited<ReturnType<typeof listPaymentProviderAccounts>>,
    ),
    safeQuery(
      "payments.listWebhookEvents",
      listPaymentWebhookEvents({ limit: 10 }),
      [] as Awaited<ReturnType<typeof listPaymentWebhookEvents>>,
    ),
  ]);

  return (
    <>
      <SectionHeading
        eyebrow="Payments · providers + webhooks"
        title={
          <>
            Deposits &amp; <em>envelopes</em>.
          </>
        }
        subtitle="Provider configuration and idempotent webhook events. Today the manual stub records deposits as pending; admins flip them to paid to gate conversion."
        actions={
          <>
            <Link
              href="/dashboard/payments/webhooks"
              className="btn btn-secondary btn-sm"
            >
              Webhooks →
            </Link>
            <Link
              href="/dashboard/payments/providers/new"
              className="btn btn-accent btn-sm"
            >
              + Add connection
            </Link>
          </>
        }
      />

      <div className="dist-kpis">
        <Kpi label="Pending deposits" value={String(m.pending)} sub="awaiting payment" />
        <Kpi
          label="Paid"
          value={String(m.paid)}
          sub="incl. manual"
          tone={m.paid > 0 ? "success" : undefined}
        />
        <Kpi
          label="Collected"
          value={money(m.totalCollectedMinor, m.currency)}
          sub="total deposits"
          tone="gold"
        />
        <Kpi
          label="Failed / expired"
          value={String(m.failed)}
          sub={m.failed > 0 ? "needs review" : "none"}
          tone={m.failed > 0 ? "warn" : undefined}
        />
      </div>

      <DbStatusNotice />

      <div className="dist-2col mt-[18px]">
        {/* Webhook envelopes */}
        <Card padding="none" overflowHidden>
          <div className="dist-card-h px-5 pt-[18px]">
            <h3>Webhook envelopes</h3>
            <span className="meta">Idempotent · recent</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Provider</th>
                <th scope="col">External ID</th>
                <th scope="col">Received</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 ? (
                <TableEmpty colSpan={5}>No webhook events yet. Live providers post idempotent envelopes
                    here; the manual stub never writes.</TableEmpty>
              ) : (
                webhooks.map((e) => (
                  <tr key={e.id}>
                    <td className="mono text-[12px]">{e.eventType}</td>
                    <td className="mono text-[12px]">{e.providerKey}</td>
                    <td className="mono text-[11px] text-ink-3">{e.externalEventId ?? "—"}</td>
                    <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                      {fmtTime(e.createdAt)}
                    </td>
                    <td>
                      <Badge tone={WEBHOOK_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* Providers */}
        <Card padding="default">
          <div className="dist-card-h">
            <h3>Providers</h3>
            <Link
              href="/dashboard/payments/providers"
              className="meta hover:text-ink"
            >
              Manage →
            </Link>
          </div>
          {providers.length === 0 ? (
            <p className="text-[13px] text-ink-3 mt-0">
              No providers configured. Wire Stripe, Xendit or the manual stub to
              start collecting payments.
            </p>
          ) : (
            <div className="dist-prov-list">
              {providers.map((p) => (
                <div key={p.id} className="dist-prov">
                  <span className="dist-prov-logo">
                    {p.providerKey.charAt(0).toUpperCase()}
                  </span>
                  <span className="dist-prov-body">
                    <span className="dist-prov-name">{p.displayName}</span>
                    <span className="dist-prov-sub">
                      {p.status === "active" ? "Active" : p.status} ·{" "}
                      {p.mode}
                    </span>
                  </span>
                  <Badge tone={PROVIDER_TONE[p.status] ?? "neutral"}>
                    {p.status === "active" ? "On" : "Off"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="text-[11px] text-ink-4 mt-6 max-w-[720px]">
        Private credentials live in <code>config_private_encrypted</code> and
        never surface in any UI. Public config is in{" "}
        <code>config_public_json</code>. Webhooks are idempotent via{" "}
        <code>UNIQUE (provider_key, external_event_id)</code>.
      </p>
    </>
  );
}
