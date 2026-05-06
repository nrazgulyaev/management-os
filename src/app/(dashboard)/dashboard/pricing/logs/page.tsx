import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listQuoteLogs } from "@/features/dynamic-pricing/services";

export const metadata = { title: "Quote logs" };
export const dynamic = "force-dynamic";

export default async function QuoteLogsPage() {
  const rows = await listQuoteLogs({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dynamic pricing", href: "/dashboard/pricing" },
          { label: "Logs" },
        ]}
        title="Quote logs"
        description="Public + admin quote events. IP / user-agent are stored hashed only."
      />
      <Section eyebrow="History" title={`${rows.length} entries`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">
                    No quote logs yet.
                  </td>
                </tr>
              )}
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {l.createdAt.toISOString()}
                  </td>
                  <td className="px-4 py-3 text-xs">{l.channelKey}</td>
                  <td className="px-4 py-3 text-xs">
                    {l.checkIn} → {l.checkOut} · {l.nights}n
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={l.available ? "success" : "warning"}>
                      {l.available ? "yes" : "no"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.reason ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {(l.totalMinor / 100n).toString()}.
                    {String(l.totalMinor % 100n).padStart(2, "0")} {l.currency}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {l.publicQuote ? "public" : "admin"}
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
