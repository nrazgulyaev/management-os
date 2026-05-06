import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import {
  getRatePlanById,
  listSeasonsForPlan,
} from "@/features/pricing/services";
import { CreateSeasonForm } from "@/components/pricing/create-season-form";

export const metadata = { title: "Seasons" };
export const dynamic = "force-dynamic";

export default async function SeasonsPage({
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
          { label: plan.name, href: `/dashboard/bookings/rates/${id}` },
          { label: "Seasons" },
        ]}
        title="Seasons"
        description="Date ranges with a multiplier or fixed nightly rate. Earlier-starting active season wins when ranges overlap; an override on a date beats the season."
      />

      <Section eyebrow="Existing" title={`${seasons.length} seasons`}>
        {seasons.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No seasons yet.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {seasons.map((s) => (
              <li key={s.id} className="p-4 text-sm">
                <div className="text-ink font-medium">{s.name}</div>
                <div className="text-ink-tertiary text-xs tabular-nums mt-1">
                  {s.startsOn as unknown as string} → {s.endsOn as unknown as string}
                  {" · "}× {Number(s.multiplier).toFixed(2)}
                  {s.stopSell ? " · stop sell" : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section eyebrow="Add" title="New season">
        <CreateSeasonForm ratePlanId={id} />
      </Section>
    </div>
  );
}
