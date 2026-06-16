import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listVillas } from "@/features/villas/services";
import { quoteDynamicStay } from "@/features/dynamic-pricing/services";
import { buildStayPricingExplanation } from "@/features/dynamic-pricing/explainer";
import { requireOrgId } from "@/features/auth/require-org";

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
  // Pass org so a raw ?villa= for another tenant resolves to no rule set.
  const organizationId = await requireOrgId();

  const result =
    villaId && haveDates
      ? await quoteDynamicStay({
          villaId,
          checkIn: sp.checkIn!,
          checkOut: sp.checkOut!,
          channelKey: channel,
          publicQuote: false,
          organizationId,
        })
      : null;

  const adminLines = result ? buildStayPricingExplanation(result.stay) : [];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> /{" "}
            <span>Quote tester</span>
          </div>
          <h1>Quote tester</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Run a stay against the dynamic engine. The admin explanation
            includes every modifier — never shown to the public.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Inputs</div>
        <Card padding="default">
          <form className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-3">
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
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              Check-in
              <input
                name="checkIn"
                type="date"
                defaultValue={sp.checkIn}
                className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              Check-out
              <input
                name="checkOut"
                type="date"
                defaultValue={sp.checkOut}
                className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              Channel
              <select
                name="channel"
                defaultValue={channel}
                className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
              >
                {["direct", "airbnb", "booking_com", "vrbo", "manual"].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button type="submit" className="btn btn-accent">
              Run quote
            </button>
          </form>
        </Card>
      </div>

      {result && (
        <div>
          <div className="label mb-2.5">
            Result ·{" "}
            {result.stay.available
              ? "Available"
              : `Unavailable — ${result.stay.reason}`}
          </div>
          <Card padding="default">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-3">
                <HandoffBadge tone={result.stay.available ? "ok" : "warn"}>
                  {result.stay.reason}
                </HandoffBadge>
                <span className="text-ink-3 text-xs">
                  {result.ruleSet?.name ?? "no rule set"} · channel {channel}
                </span>
              </div>
              <ul className="flex flex-col gap-1 text-xs">
                {adminLines.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between border-t border-line-soft pt-1"
                  >
                    <span className="text-ink">{l.label}</span>
                    <span className="mono text-ink-3">{l.detail ?? ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
