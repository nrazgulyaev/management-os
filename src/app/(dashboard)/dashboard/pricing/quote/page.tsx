import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listVillas } from "@/features/villas/services";
import { quoteDynamicStay } from "@/features/dynamic-pricing/services";
import { buildStayPricingExplanation } from "@/features/dynamic-pricing/explainer";

export const metadata = { title: "Pricing quote tester" };
export const dynamic = "force-dynamic";

export default async function PricingQuoteTesterPage({
  searchParams,
}: {
  searchParams?: Promise<{
    villa?: string;
    checkIn?: string;
    checkOut?: string;
    channel?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const villas = await listVillas();
  const villaId = sp.villa ?? villas[0]?.id;
  const channel = sp.channel ?? "direct";
  const haveDates = !!(sp.checkIn && sp.checkOut);

  const result =
    villaId && haveDates
      ? await quoteDynamicStay({
          villaId,
          checkIn: sp.checkIn!,
          checkOut: sp.checkOut!,
          channelKey: channel,
          publicQuote: false,
        })
      : null;

  const adminLines = result ? buildStayPricingExplanation(result.stay) : [];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dynamic pricing", href: "/dashboard/pricing" },
          { label: "Quote tester" },
        ]}
        title="Quote tester"
        description="Run a stay against the dynamic engine. Admin explanation includes every modifier — never shown to public."
      />
      <Section eyebrow="Inputs" title="Quote">
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
            Check-in
            <input
              name="checkIn"
              type="date"
              defaultValue={sp.checkIn}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
            Check-out
            <input
              name="checkOut"
              type="date"
              defaultValue={sp.checkOut}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
            Channel
            <select
              name="channel"
              defaultValue={channel}
              className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
            >
              {["direct", "airbnb", "booking_com", "vrbo", "manual"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90">
            Run quote
          </button>
        </form>
      </Section>
      {result && (
        <Section eyebrow="Result" title={result.stay.available ? "Available" : `Unavailable · ${result.stay.reason}`}>
          <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-3">
              <Badge tone={result.stay.available ? "success" : "warning"}>
                {result.stay.reason}
              </Badge>
              <span className="text-ink-tertiary text-xs">
                {result.ruleSet?.name ?? "no rule set"} · channel {channel}
              </span>
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {adminLines.map((l, i) => (
                <li key={i} className="flex items-center justify-between border-t border-line-soft pt-1">
                  <span className="text-ink">{l.label}</span>
                  <span className="font-mono text-ink-tertiary">{l.detail ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}
    </div>
  );
}
