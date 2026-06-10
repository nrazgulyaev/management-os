import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
  const bookable = cal.cells.filter((c) => c.available).length;
  return (
    <>
      <div className="page-header !mb-0 !pb-[18px]">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> / <span>Calendar</span>
          </div>
          <h1>Pricing calendar</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[720px]">
            Per-night dynamic price + availability for the selected villa / channel.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/pricing/rule-sets" className="btn btn-secondary btn-sm">
            Rule sets
          </Link>
        </div>
      </div>

      {/* Filters — GET form, unchanged param names / defaults */}
      <div className="card card-pad mt-[18px] mb-[18px]">
        <div className="label text-[9.5px] mb-3.5">Filters · villa, channel, range</div>
        <form className="flex flex-wrap items-end gap-3">
          <label className="field min-w-[220px]">
            <span className="field-label">Villa</span>
            <select name="villa" defaultValue={villaId ?? ""} className="select">
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.unitCode} · {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field min-w-[140px]">
            <span className="field-label">Channel</span>
            <select name="channel" defaultValue={channelKey} className="select">
              {["direct", "airbnb", "booking_com", "vrbo", "manual"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">From</span>
            <input name="from" type="date" defaultValue={from} className="input" />
          </label>
          <label className="field w-[90px]">
            <span className="field-label">Days</span>
            <input
              name="days"
              type="number"
              defaultValue={String(days)}
              min={1}
              max={60}
              className="input"
            />
          </label>
          <button type="submit" className="btn btn-accent btn-sm">
            Apply
          </button>
        </form>
      </div>

      {/* Nightly grid */}
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="label text-[9.5px]">
          Nightly ·{" "}
          {cal.ruleSet
            ? `${cal.ruleSet.name} (${cal.ruleSet.scopeType})`
            : "no applicable rule set"}
        </span>
        {cal.cells.length > 0 && (
          <span className="font-mono text-[11px] text-ink-4">
            {bookable}/{cal.cells.length} nights bookable
          </span>
        )}
      </div>
      {cal.cells.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-soft bg-cream-warm/40 px-5 py-6 text-sm text-ink-3 m-0">
          No cells. Pick a villa with an active rule set.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {cal.cells.map((c) => (
            <div
              key={c.date}
              className={`rounded-card border p-3 text-xs ${
                c.available
                  ? "border-line-soft bg-paper"
                  : "border-danger/40 bg-danger/5"
              }`}
              title={`${c.date} · ${c.reason}`}
            >
              <div className="font-mono text-[10px] text-ink-3">{c.date}</div>
              <div className="mt-1 text-ink">
                {c.available ? (
                  <span className="font-mono">
                    {(c.finalRateMinor / 100n).toString()}.
                    {String(c.finalRateMinor % 100n).padStart(2, "0")} {c.currency}
                  </span>
                ) : (
                  <HandoffBadge tone={c.reason === "stop_sell" ? "danger" : "warn"}>
                    {c.reason}
                  </HandoffBadge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
