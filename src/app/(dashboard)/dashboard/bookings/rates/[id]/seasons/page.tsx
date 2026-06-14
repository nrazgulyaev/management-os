import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/bookings/rates">Rate plans</Link> /{" "}
            <Link href={`/dashboard/bookings/rates/${id}`}>{plan.name}</Link> /{" "}
            <span>Seasons</span>
          </div>
          <h1>Seasons</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Date ranges with a multiplier or fixed nightly rate.
            Earlier-starting active season wins when ranges overlap; an override
            on a date beats the season.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Existing — {seasons.length} seasons</div>
        <Card padding="default">
          {seasons.length === 0 ? (
            <p className="text-sm text-ink-tertiary">No seasons yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {seasons.map((s) => (
                <li key={s.id} className="py-4 text-sm first:pt-0 last:pb-0">
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Add</div>
        <Card padding="default">
          <CreateSeasonForm ratePlanId={id} />
        </Card>
      </div>
    </div>
  );
}
