import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { listPaymentProviderAccounts } from "@/features/direct-booking/deposits";
import { getDb } from "@/lib/db/client";
import { paymentProcessorConnections } from "@/lib/db/schema/payment-processors";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";

export const metadata = { title: "Payment providers" };
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

export default async function ProvidersPage() {
  const db = getDb();
  let orgId: string | null = null;
  try {
    orgId = await requireOrgId();
  } catch {
    orgId = null;
  }
  const rows = await safeQuery(
    "payments-providers.listPaymentProviderAccounts",
    listPaymentProviderAccounts(orgId ?? undefined),
    [] as Awaited<ReturnType<typeof listPaymentProviderAccounts>>,
  );
  const connections =
    db && orgId
      ? await safeQuery(
          "payments-providers.paymentProcessorConnections",
          db
            .select()
            .from(paymentProcessorConnections)
            .where(eq(paymentProcessorConnections.organizationId, orgId)),
          [] as Array<typeof paymentProcessorConnections.$inferSelect>,
        )
      : [];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/payments">Payments</Link> / <span>Providers</span>
          </div>
          <h1>Payment providers</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Provider configuration. Xendit (Indonesia rails — QRIS, e-wallets,
            virtual accounts) and Stripe are wired live today; Wise + PayPal
            default to DryRun until each implementation lands. Private credentials
            live encrypted and never surface here.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/payments/providers/new" className="btn btn-accent btn-sm">
            + Add connection
          </Link>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Connections · <em>{connections.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Account label</th>
              <th scope="col">Mode</th>
              <th scope="col">Status</th>
              <th scope="col">Connected</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <TableEmpty colSpan={6}>No connections yet. Wire Xendit (Indonesia), Stripe, Wise, PayPal or
                  Manual to start collecting payments.</TableEmpty>
            ) : (
              connections.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/payments/providers/${c.id}`} className="hover:text-terra">
                      <Badge tone="outline">{c.provider}</Badge>
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/payments/providers/${c.id}`}
                      className="hover:text-terra"
                    >
                      {c.accountName ?? c.externalAccountId}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={c.mode === "live" ? "success" : "neutral"}>{c.mode}</Badge>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {c.connectedAt ? c.connectedAt.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="text-right">
                    <SettingsRowActions
                      kind="payment_connection"
                      row={{
                        id: c.id,
                        displayName: c.accountName ?? c.externalAccountId ?? c.provider,
                        detailHref: `/dashboard/payments/providers/${c.id}`,
                        values: {},
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">
        Legacy direct-booking catalog · <em>{rows.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Display name</th>
              <th scope="col">Mode</th>
              <th scope="col">Currencies</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>No providers configured.</TableEmpty>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td className="mono text-[12px]">{p.providerKey}</td>
                  <td>{p.displayName}</td>
                  <td className="text-[12px]">{p.mode}</td>
                  <td className="text-[12px] text-ink-3">
                    {p.supportedCurrencies?.join(", ") ?? "—"}
                  </td>
                  <td>
                    <Badge
                      tone={
                        p.status === "active"
                          ? "success"
                          : p.status === "paused"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-4 mt-4 max-w-[720px]">
        Private credentials live in <code>config_private_encrypted</code> and
        never surface in any UI. Public config is in <code>config_public_json</code>.
      </p>
    </>
  );
}
