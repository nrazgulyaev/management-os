import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listPaymentProviderAccounts } from "@/features/direct-booking/deposits";

export const metadata = { title: "Payment providers" };
export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const rows = await listPaymentProviderAccounts();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Payments", href: "/dashboard/payments" },
          { label: "Providers" },
        ]}
        title="Payment providers"
        description="Provider configuration. The manual stub is the only one wired today; future Stripe / Xendit / Wise / bank_transfer rows can be added without a migration."
      />
      <Section eyebrow="Catalog" title={`${rows.length} providers`}>
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
