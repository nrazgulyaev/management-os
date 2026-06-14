import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/dashboard/primitives";
import {
  getRatePlanById,
  listOverridesForPlanInRange,
} from "@/features/pricing/services";
import { UpsertOverrideForm } from "@/components/pricing/upsert-override-form";

export const metadata = { title: "Rate overrides" };
export const dynamic = "force-dynamic";

export default async function OverridesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getRatePlanById(id);
  if (!plan) notFound();

  // Show a 90-day window forward from today.
  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = new Date();
  horizonDate.setUTCDate(horizonDate.getUTCDate() + 90);
  const horizon = horizonDate.toISOString().slice(0, 10);
  const overrides = await listOverridesForPlanInRange(id, today, horizon);

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/bookings/rates">Rate plans</Link> /{" "}
            <Link href={`/dashboard/bookings/rates/${id}`}>{plan.name}</Link> /{" "}
            <span>Overrides</span>
          </div>
          <h1>Rate overrides</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-night overrides beat seasons. Source &apos;manual&apos; is
            operator-driven; &apos;pricelabs&apos; / &apos;channel&apos; /
            &apos;import&apos; are reserved for future integrations.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Next 90 days — {overrides.length} overrides</div>
        <Card padding="default">
          {overrides.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              No overrides in the next 90 days.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {overrides.map((o) => (
                <li key={o.id} className="py-4 text-sm first:pt-0 last:pb-0">
                  <div className="text-ink font-medium tabular-nums">
                    {o.stayDate as unknown as string}
                  </div>
                  <div className="text-ink-tertiary text-xs mt-1">
                    {o.nightlyRateMinor != null ? `${(Number(o.nightlyRateMinor) / 100).toFixed(2)} ${plan.baseCurrency}` : "rate unchanged"}
                    {o.stopSell ? " · stop sell" : ""}
                    {o.minLos != null ? ` · min LOS ${o.minLos}` : ""}
                    {" · "}source: {o.source}
                  </div>
                  {o.notes && (
                    <div className="text-ink-tertiary text-xs mt-1">{o.notes}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Add / update</div>
        <Card padding="default">
          <UpsertOverrideForm ratePlanId={id} />
        </Card>
      </div>
    </div>
  );
}
