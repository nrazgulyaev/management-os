import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import {
  listChannelPushEvents,
  listPricingRuleSets,
} from "@/features/dynamic-pricing/services";
import { SimulatePushFormDs } from "./_simulate-form";

export const metadata = { title: "Channel push" };
export const dynamic = "force-dynamic";

function eventTone(status: string): "ok" | "danger" | "soft" {
  return status === "sent" ? "ok" : status === "failed" ? "danger" : "soft";
}

export default async function ChannelPushPage() {
  const [sets, events] = await Promise.all([
    listPricingRuleSets({ status: "active" }),
    listChannelPushEvents({ limit: 100 }),
  ]);
  return (
    <>
      <div className="page-header !mb-0 !pb-[18px]">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> / <span>Channel push</span>
          </div>
          <h1>Channel push</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[720px]">
            Outbound stub. Records what we WOULD push to a channel manager — no real OTA
            integration.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/pricing/rule-sets" className="btn btn-secondary btn-sm">
            Rule sets
          </Link>
        </div>
      </div>

      <div className="card card-pad mt-[18px] mb-[18px]">
        <div className="label text-[9.5px] mb-3.5">Simulate · build a push payload</div>
        <SimulatePushFormDs ruleSets={sets.map((s) => ({ id: s.id, name: s.name }))} />
      </div>

      <div className="flex items-baseline justify-between mb-2.5">
        <span className="label text-[9.5px]">History</span>
        <span className="font-mono text-[11px] text-ink-4">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="card overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Channel</th>
              <th>Range</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-ink-3 py-6">
                  No events yet — simulate a push above.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id}>
                <td className="font-mono text-[11px]">{e.eventCode}</td>
                <td className="text-[12.5px]">{e.eventType}</td>
                <td className="text-[12.5px]">{e.channelKey}</td>
                <td className="font-mono text-[11px]">
                  {e.dateStart} → {e.dateEnd}
                </td>
                <td>
                  <HandoffBadge tone={eventTone(e.status)}>{e.status}</HandoffBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
