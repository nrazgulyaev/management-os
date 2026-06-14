import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/bookings/rates">Rate plans</Link> /{" "}
            <span>{plan.name}</span>
          </div>
          <h1>{plan.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`Base ${formatMoney(plan.baseNightlyRateMinor, plan.baseCurrency)} / night`}
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/dashboard/bookings/rates/${id}/seasons`}
            className="btn btn-secondary btn-sm"
          >
            Seasons
          </Link>
          <Link
            href={`/dashboard/bookings/rates/${id}/overrides`}
            className="btn btn-secondary btn-sm"
          >
            Overrides
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Plan</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Status">
              <HandoffBadge tone={plan.status === "active" ? "ok" : "soft"}>{plan.status}</HandoffBadge>
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Seasons — {seasons.length} seasons</div>
        {seasons.length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary m-0">
              No seasons yet. <Link href={`/dashboard/bookings/rates/${id}/seasons`} className="underline">Add one →</Link>
            </p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col" className="num">Multiplier</th>
                  <th scope="col" className="num">Min LOS</th>
                  <th scope="col">Stop sell</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id}>
                    <td className="row-title">{s.name}</td>
                    <td className="text-ink-tertiary tabular-nums">{s.startsOn as unknown as string}</td>
                    <td className="text-ink-tertiary tabular-nums">{s.endsOn as unknown as string}</td>
                    <td className="num tabular-nums">{Number(s.multiplier).toFixed(2)}</td>
                    <td className="num tabular-nums">{s.minLos ?? "—"}</td>
                    <td>
                      {s.stopSell ? <HandoffBadge tone="danger">stop sell</HandoffBadge> : <span className="text-ink-tertiary text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
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
