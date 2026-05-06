import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listVillas } from "@/features/villas/services";
import { quoteDynamicCalendar } from "@/features/dynamic-pricing/services";

export const metadata = { title: "Pricing calendar" };
export const dynamic = "force-dynamic";

export default async function PricingCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ villa?: string; channel?: string; from?: string; days?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const villas = await listVillas();
  const villaId = sp.villa ?? villas[0]?.id;
  const channelKey = sp.channel ?? "direct";
  const from = sp.from ?? new Date().toISOString().slice(0, 10);
  const days = Math.max(1, Math.min(60, Number(sp.days ?? 14)));
  const cal = villaId
    ? await quoteDynamicCalendar({ villaId, startDate: from, days, channelKey })
    : { ruleSet: null, cells: [] };
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dynamic pricing", href: "/dashboard/pricing" },
          { label: "Calendar" },
        ]}
        title="Pricing calendar"
        description="Per-night dynamic price + availability for the selected villa / channel."
      />
      <Section eyebrow="Filters" title="Pick villa, channel, range">
        <form className="flex flex-wrap items-end gap-3 rounded-md border border-line-soft bg-surface p-5">
          <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
            Villa
            <select
              name="villa"
              defaultValue={villaId ?? ""}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            >
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.unitCode} · {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
            Channel
            <select
              name="channel"
              defaultValue={channelKey}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            >
              {["direct", "airbnb", "booking_com", "vrbo", "manual"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
            From
            <input
              name="from"
              type="date"
              defaultValue={from}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
            Days
            <input
              name="days"
              type="number"
              defaultValue={String(days)}
              min={1}
              max={60}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            />
          </label>
          <button type="submit" className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90">
            Apply
          </button>
        </form>
      </Section>
      <Section
        eyebrow="Nightly"
        title={
          cal.ruleSet
            ? `${cal.ruleSet.name} (${cal.ruleSet.scopeType})`
            : "No applicable rule set"
        }
      >
        {cal.cells.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No cells. Pick a villa with an active rule set.
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {cal.cells.map((c) => (
              <div
                key={c.date}
                className="rounded-md border border-line-soft bg-surface p-3 text-xs"
                title={`${c.date} · ${c.reason}`}
              >
                <div className="font-mono text-[10px] text-ink-tertiary">{c.date}</div>
                <div className="mt-1 text-ink">
                  {c.available ? (
                    <span className="font-mono">
                      {(c.finalRateMinor / 100n).toString()}.
                      {String(c.finalRateMinor % 100n).padStart(2, "0")} {c.currency}
                    </span>
                  ) : (
                    <Badge tone={c.reason === "stop_sell" ? "danger" : "warning"}>
                      {c.reason}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
