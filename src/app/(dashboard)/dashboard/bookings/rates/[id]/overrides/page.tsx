import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Rate plans", href: "/dashboard/bookings/rates" },
          { label: plan.name, href: `/dashboard/bookings/rates/${id}` },
          { label: "Overrides" },
        ]}
        title="Rate overrides"
        description="Per-night overrides beat seasons. Source 'manual' is operator-driven; 'pricelabs' / 'channel' / 'import' are reserved for future integrations."
      />

      <Section eyebrow="Next 90 days" title={`${overrides.length} overrides`}>
        {overrides.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No overrides in the next 90 days.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {overrides.map((o) => (
              <li key={o.id} className="p-4 text-sm">
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
      </Section>

      <Section eyebrow="Add / update" title="Override">
        <UpsertOverrideForm ratePlanId={id} />
      </Section>
    </div>
  );
}
