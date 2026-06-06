import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getDepositMetrics,
  listPaymentProviderAccounts,
  listPaymentWebhookEvents,
} from "@/features/direct-booking/deposits";

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

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function PaymentsHub() {
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

  const activeProviders = providers.filter((p) => p.status === "active").length;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Payments</span>
          </div>
          <h1>Payments</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Provider configuration, deposit collection and idempotent webhook
            envelopes. Private credentials live encrypted and never surface in
            the UI — only public config and status are shown here.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/payments/webhooks" className="btn btn-secondary btn-sm">
            Webhooks →
          </Link>
          <Link href="/dashboard/payments/providers/new" className="btn btn-accent btn-sm">
            + Add connection
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Pending deposits" value={String(m.pending)} sub="awaiting payment" />
        <Kpi
          label="Paid deposits"
          value={String(m.paid)}
          sub="cleared"
          tone={m.paid > 0 ? "success" : undefined}
        />
        <Kpi label="Manually marked" value={String(m.manuallyMarkedPaid)} sub="admin override" />
        <Kpi
          label="Failed / expired"
          value={String(m.failed)}
          sub={m.failed > 0 ? "needs review" : "none"}
          tone={m.failed > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Collected"
          value={money(m.totalCollectedMinor, m.currency)}
          sub="total deposits"
          tone="gold"
        />
      </div>

      <DbStatusNotice />

      {/* Providers */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Providers · <em>{activeProviders} active</em>
        </h2>
        <Link
          href="/dashboard/payments/providers"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          Manage connections →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Display name</th>
              <th>Mode</th>
              <th>Currencies</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-ink-3 italic py-8">
                  No providers configured. Wire Stripe, Wise, PayPal or the
                  manual stub to start collecting payments.
                </td>
              </tr>
            ) : (
              providers.map((p) => (
                <tr key={p.id}>
                  <td className="mono text-[12px]">{p.providerKey}</td>
                  <td>{p.displayName}</td>
                  <td>
                    <Badge tone={p.mode === "live" ? "success" : "neutral"}>{p.mode}</Badge>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {p.supportedCurrencies?.join(", ") ?? "—"}
                  </td>
                  <td>
                    <Badge tone={PROVIDER_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent webhooks */}
      <div className="flex items-end justify-between mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Webhooks · <em>recent</em>
        </h2>
        <Link
          href="/dashboard/payments/webhooks"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          Full history →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Provider</th>
              <th>Type</th>
              <th>External ID</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-ink-3 italic py-8">
                  No webhook events yet. Live providers post idempotent envelopes
                  here; the manual stub never writes.
                </td>
              </tr>
            ) : (
              webhooks.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(e.createdAt)}
                  </td>
                  <td className="mono text-[12px]">{e.providerKey}</td>
                  <td className="text-[12px]">{e.eventType}</td>
                  <td className="mono text-[11px] text-ink-3">{e.externalEventId ?? "—"}</td>
                  <td>
                    <Badge tone={WEBHOOK_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-4 mt-4 max-w-[720px]">
        Private credentials live in <code>config_private_encrypted</code> and
        never surface in any UI. Public config is in{" "}
        <code>config_public_json</code>. Webhooks are idempotent via{" "}
        <code>UNIQUE (provider_key, external_event_id)</code>.
      </p>
    </>
  );
}
