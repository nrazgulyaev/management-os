import type { Metadata } from "next";
import Link from "next/link";
import {
  SectionHeading,
  Kpi,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { listConversionsForUi } from "@/lib/marketing/queries";
import { formatMoneyMinor } from "@/lib/money";

/**
 * Attribution dashboard — DS restyle to cabinets/new/dev-marketing.html
 * §02 variant B (attribution view) chrome: SectionHeading + Kpi strip +
 * DS table replace the legacy PageHeader/Section/Table shell. Data
 * wiring preserved verbatim: listConversionsForUi(limit 200) computed by
 * the hourly attribution-engine cron; same columns (when · type · value ·
 * first-touch · last-touch · touchpoints · days-to-convert) and the same
 * header links (conversions / connections / marketing dashboard).
 */

export const metadata: Metadata = { title: "Attribution · Marketing" };
export const dynamic = "force-dynamic";

function fmtWhen(iso: Date | string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export default async function AttributionPage() {
  const db = getDb();
  if (!db) {
    return (
      <>
        <SectionHeading
          eyebrow="workspace / marketing / attribution"
          title={
            <>
              Attribution{" "}
              <span className="text-amber italic">· closed-won credit</span>
            </>
          }
        />
        <EmptyState
          variant="error"
          title="Database not configured"
          body="Set DATABASE_URL to load attributed conversions."
        />
      </>
    );
  }
  const conversions = await listConversionsForUi({ limit: 200 });
  const totalConversions = conversions.length;
  const attributed = conversions.filter(
    (c) => c.linearAttributionData != null,
  ).length;
  const totalRevenueMinor = conversions.reduce<bigint>(
    (acc, c) => acc + BigInt(c.conversionValueMinor ?? 0n),
    0n,
  );
  const withDays = conversions.filter((c) => c.daysToConvert != null);
  const avgDaysToConvert =
    withDays.length > 0
      ? (
          withDays.reduce((s, c) => s + Number(c.daysToConvert), 0) /
          withDays.length
        ).toFixed(1)
      : null;

  return (
    <>
      <SectionHeading
        eyebrow="workspace / marketing / attribution"
        title={
          <>
            Attribution.{" "}
            <span className="text-amber">Where closed-won comes from.</span>
          </>
        }
        subtitle="Multi-touch attribution computed by the hourly engine cron. Default model: last_touch (operator override per-org via the service layer). Conversion → touchpoint matching by contact_id when available, else client_id."
        actions={
          <>
            <Link
              href="/development-os/marketing/conversions"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Conversions
            </Link>
            <Link
              href="/development-os/marketing/connections"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Connections
            </Link>
            <Link
              href="/development-os/marketing"
              prefetch={false}
              className="btn btn-ghost btn-sm"
            >
              ← Marketing
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-[18px] sm:grid-cols-4">
        <Kpi
          label="Conversions"
          value={String(totalConversions)}
          sub="most recent 200"
        />
        <Kpi
          label="Attributed"
          value={String(attributed)}
          sub={
            totalConversions > 0
              ? `${Math.round((attributed / totalConversions) * 100)}% with campaign credit`
              : undefined
          }
          tone={attributed > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Total revenue"
          value={formatMoneyMinor(totalRevenueMinor, "USD", { compact: true })}
          tone={totalRevenueMinor > 0n ? "success" : undefined}
        />
        <Kpi
          label="Avg days to convert"
          value={avgDaysToConvert ?? "—"}
          sub={
            avgDaysToConvert
              ? `across ${withDays.length} conversion(s)`
              : "no journey data yet"
          }
        />
      </div>

      <h3 className="display text-[22px] font-normal text-ink mb-3">
        Recent attributed conversions{" "}
        <span className="text-amber italic">· {conversions.length}</span>
      </h3>
      <p className="mt-0 mb-3 text-[12.5px] text-ink-tertiary">
        Per-campaign credit lives in{" "}
        <code className="font-mono text-[11px]">
          attribution_conversions.linear_attribution_data
        </code>{" "}
        (JSONB).
      </p>

      {conversions.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No conversions yet"
          body="Conversions land here when the system records a reservation, lead or deal and the attribution cron processes them."
        />
      ) : (
        <div className="bg-surface border border-line-soft rounded-[12px] overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                <th className="text-left px-4 py-2.5 font-medium">when</th>
                <th className="text-left px-3 py-2.5 font-medium">type</th>
                <th className="text-right px-3 py-2.5 font-medium">value</th>
                <th className="text-left px-3 py-2.5 font-medium">
                  first-touch campaign
                </th>
                <th className="text-left px-3 py-2.5 font-medium">
                  last-touch campaign
                </th>
                <th className="text-right px-3 py-2.5 font-medium">
                  touchpoints
                </th>
                <th className="text-right px-4 py-2.5 font-medium">
                  days to convert
                </th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-cream-warm"
                >
                  <td className="px-4 py-2.5 font-mono text-[10.5px] text-ink-tertiary whitespace-nowrap">
                    {fmtWhen(c.convertedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <HandoffBadge tone="soft">{c.conversionType}</HandoffBadge>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                    {c.conversionValueMinor
                      ? formatMoneyMinor(
                          BigInt(c.conversionValueMinor),
                          c.conversionCurrency ?? "USD",
                          { compact: true },
                        )
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-ink-secondary">
                    {c.firstTouchCampaignId
                      ? c.firstTouchCampaignId.slice(0, 8)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-ink-secondary">
                    {c.lastTouchCampaignId
                      ? c.lastTouchCampaignId.slice(0, 8)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {c.touchpointCount ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {c.daysToConvert ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
