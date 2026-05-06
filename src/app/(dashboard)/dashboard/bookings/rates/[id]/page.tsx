import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getRatePlanById,
  listSeasonsForPlan,
} from "@/features/pricing/services";

export const metadata = { title: "Rate plan" };
export const dynamic = "force-dynamic";

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function RatePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getRatePlanById(id);
  if (!plan) notFound();
  const seasons = await listSeasonsForPlan(id);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Rate plans", href: "/dashboard/bookings/rates" },
          { label: plan.name },
        ]}
        title={plan.name}
        description={`Base ${formatMoney(plan.baseNightlyRateMinor, plan.baseCurrency)} / night`}
        actions={
          <>
            <Link
              href={`/dashboard/bookings/rates/${id}/seasons`}
              className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
            >
              Seasons
            </Link>
            <Link
              href={`/dashboard/bookings/rates/${id}/overrides`}
              className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
            >
              Overrides
            </Link>
          </>
        }
      />

      <Section eyebrow="Plan" title="Configuration">
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <Badge tone={plan.status === "active" ? "success" : "neutral"}>{plan.status}</Badge>
          </Field>
          <Field
            label="Scope"
            value={plan.villaCode ? `villa ${plan.villaCode}` : plan.projectName ? `project ${plan.projectName}` : "global"}
          />
          <Field label="Base nightly" value={formatMoney(plan.baseNightlyRateMinor, plan.baseCurrency)} />
          <Field label="Currency" value={plan.baseCurrency} />
          {plan.managementFeePercent && (
            <Field label="Management fee %" value={`${plan.managementFeePercent}%`} />
          )}
        </div>
      </Section>

      <Section eyebrow="Seasons" title={`${seasons.length} seasons`}>
        {seasons.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No seasons yet. <Link href={`/dashboard/bookings/rates/${id}/seasons`} className="underline">Add one →</Link>
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">From</th>
                  <th className="text-left px-3 py-2">To</th>
                  <th className="text-right px-3 py-2">Multiplier</th>
                  <th className="text-right px-3 py-2">Min LOS</th>
                  <th className="text-left px-3 py-2">Stop sell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {seasons.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 text-ink font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">{s.startsOn as unknown as string}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">{s.endsOn as unknown as string}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(s.multiplier).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.minLos ?? "—"}</td>
                    <td className="px-3 py-2">
                      {s.stopSell ? <Badge tone="danger">stop sell</Badge> : <span className="text-ink-tertiary text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
