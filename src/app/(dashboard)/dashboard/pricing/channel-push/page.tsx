import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listChannelPushEvents,
  listPricingRuleSets,
} from "@/features/dynamic-pricing/services";
import { SimulatePushForm } from "@/components/dynamic-pricing/simulate-push-form";

export const metadata = { title: "Channel push" };
export const dynamic = "force-dynamic";

export default async function ChannelPushPage() {
  const [sets, events] = await Promise.all([
    listPricingRuleSets({ status: "active" }),
    listChannelPushEvents({ limit: 100 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dynamic pricing", href: "/dashboard/pricing" },
          { label: "Channel push" },
        ]}
        title="Channel push"
        description="Outbound stub. Records what we WOULD push to a channel manager — no real OTA integration."
      />
      <Section eyebrow="Simulate" title="Build a push payload">
        <SimulatePushForm ruleSets={sets.map((s) => ({ id: s.id, name: s.name }))} />
      </Section>
      <Section eyebrow="History" title={`${events.length} events`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No events yet — simulate a push above.
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">{e.eventCode}</td>
                  <td className="px-4 py-3 text-xs">{e.eventType}</td>
                  <td className="px-4 py-3 text-xs">{e.channelKey}</td>
                  <td className="px-4 py-3 text-xs">{e.dateStart} → {e.dateEnd}</td>
                  <td className="px-4 py-3">
                    <Badge tone={e.status === "sent" ? "success" : e.status === "failed" ? "danger" : "neutral"}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
