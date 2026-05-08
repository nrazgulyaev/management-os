import Link from "next/link";
import { Plus } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPaymentProviderAccounts } from "@/features/direct-booking/deposits";
import { getDb } from "@/lib/db/client";
import { paymentProcessorConnections } from "@/lib/db/schema/payment-processors";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Payment providers" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> =
  {
    active: "success",
    error: "danger",
    pending: "warning",
    paused: "warning",
    archived: "neutral",
  };

export default async function ProvidersPage() {
  const rows = await listPaymentProviderAccounts();
  const db = getDb();
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  const connections =
    db && org
      ? await db
          .select()
          .from(paymentProcessorConnections)
          .where(eq(paymentProcessorConnections.organizationId, org.id))
      : [];
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Payments", href: "/dashboard/payments" },
          { label: "Providers" },
        ]}
        title="Payment providers"
        description="Provider configuration. Stripe is wired live today; Wise Payments + PayPal default to DryRun until each provider's implementation lands."
        actions={
          <Button asChild variant="primary">
            <Link href="/dashboard/payments/providers/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Add connection
            </Link>
          </Button>
        }
      />

      <Section
        eyebrow="Provider connections"
        title={`${connections.length} connections`}
      >
        {connections.length === 0 ? (
          <NoItemsYet
            entityLabel="payment connections"
            description="Wire Stripe, Wise, PayPal, or Manual to start collecting payments."
            addHref="/dashboard/payments/providers/new"
            addLabel="Add connection"
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Account label</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Connected</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="border-t border-line-soft">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/payments/providers/${c.id}`}
                        className="hover:underline"
                      >
                        <Badge tone="outline">{c.provider}</Badge>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href={`/dashboard/payments/providers/${c.id}`}
                        className="hover:underline"
                      >
                        {c.accountName ?? c.externalAccountId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Badge tone={c.mode === "live" ? "success" : "neutral"}>
                        {c.mode}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {c.connectedAt
                        ? c.connectedAt.toISOString().slice(0, 10)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SettingsRowActions
                        kind="payment_connection"
                        row={{
                          id: c.id,
                          displayName:
                            c.accountName ?? c.externalAccountId ?? c.provider,
                          detailHref: `/dashboard/payments/providers/${c.id}`,
                          values: {},
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section
        eyebrow="Legacy direct-booking catalog"
        title={`${rows.length} legacy provider rows`}
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Display name</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Currencies</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No providers configured.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">{p.providerKey}</td>
                  <td className="px-4 py-3 text-sm">{p.displayName}</td>
                  <td className="px-4 py-3 text-xs">{p.mode}</td>
                  <td className="px-4 py-3 text-xs">
                    {p.supportedCurrencies?.join(", ") ?? "—"}
                  </td>
                  <td className="px-4 py-3">
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
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-tertiary">
          Private credentials live in `config_private_encrypted` and never
          surface in any UI. Public config is in `config_public_json`.
        </p>
      </Section>
    </div>
  );
}
