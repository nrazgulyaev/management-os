import Link from "next/link";
import { SectionHeading, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { safeQuery } from "@/lib/development/safe-query";
import { loadSourceAttribution } from "@/lib/development/server/marketing/marketing-summary-queries";
import { loadLeadsForExport } from "@/lib/development/server/marketing/lead-export-queries";
import { formatMoneyMinor } from "@/lib/money";

/**
 * `/development-os/marketing/leads` — leads INDEX page. The directory
 * previously held only `/leads/export` (the CSV download); this is the
 * missing listing surface it implies. Read-only; reuses the existing
 * marketing leads data:
 *   - per-source rollup  → loadSourceAttribution (leads + lead-source registry)
 *   - recent leads table → loadLeadsForExport (flat lead rows + source/campaign)
 * Org access is enforced by the (development-app) layout guard
 * (`enforceProductAccess("dev")`). No new tables.
 */

export const metadata = { title: "Leads · Marketing" };
export const dynamic = "force-dynamic";

const LIFECYCLE_TONE: Record<
  string,
  "ok" | "warn" | "amber" | "info" | "soft"
> = {
  contract: "ok",
  reservation: "ok",
  hot: "amber",
  qualified: "info",
  lead: "soft",
  new: "soft",
  lost: "warn",
  disqualified: "warn",
};

function lifecycleTone(status: string) {
  return LIFECYCLE_TONE[status] ?? "soft";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function MarketingLeadsPage() {
  const [sources, leads] = await Promise.all([
    safeQuery("leadSourceAttribution", loadSourceAttribution(), []),
    safeQuery("leadsIndex", loadLeadsForExport(200), []),
  ]);

  const totalLeads = sources.reduce((acc, s) => acc + s.leads, 0);
  const totalQualified = sources.reduce((acc, s) => acc + s.qualified, 0);
  const totalReservations = sources.reduce((acc, s) => acc + s.reservations, 0);
  const paidSourceCount = sources.filter((s) => s.isPaid).length;

  return (
    <>
      <SectionHeading
        eyebrow="workspace / marketing / leads"
        title={
          <>
            Leads by source.{" "}
            <span className="text-amber">Every inbound, attributed.</span>
          </>
        }
        subtitle={`${totalLeads} attributed leads across ${sources.length} source(s) · ${totalReservations} reached reservation`}
        actions={
          <Link
            href="/development-os/marketing/leads/export"
            prefetch={false}
            className="btn btn-dark btn-sm"
          >
            Export leads ↓
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-[18px] sm:grid-cols-4">
        <Kpi
          label="Attributed leads"
          value={String(totalLeads)}
          sub={`${sources.length} sources`}
          tone={totalLeads > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Qualified"
          value={String(totalQualified)}
          sub="qualified + hot"
        />
        <Kpi
          label="Reservations"
          value={String(totalReservations)}
          sub="reservation + contract"
          tone={totalReservations > 0 ? "success" : undefined}
        />
        <Kpi
          label="Paid sources"
          value={String(paidSourceCount)}
          sub={`${sources.length - paidSourceCount} organic`}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-7 gap-y-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Lead sources rollup */}
        <section className="min-w-0">
          <h3 className="display text-[22px] font-normal text-ink mb-3">
            Lead sources <span className="text-amber italic">· {sources.length}</span>
          </h3>
          {sources.length === 0 ? (
            <EmptyState
              variant="no-results"
              inline
              title="No attributed leads yet"
              body="Sources appear here once leads are tagged to a channel or spend is booked against one."
            />
          ) : (
            <div className="bg-surface border border-line-soft rounded-[12px] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                <span>source</span>
                <span className="text-right">leads</span>
                <span className="text-right">cost / lead</span>
              </div>
              {sources.map((s) => {
                const pct =
                  totalLeads > 0 ? Math.round((s.leads / totalLeads) * 100) : 0;
                return (
                  <div
                    key={s.sourceKey}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 items-center"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/development-os/marketing/lead-sources/${s.sourceKey}`}
                        className="text-[12.5px] font-medium text-ink hover:underline"
                      >
                        {s.sourceLabel}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <HandoffBadge tone={s.isPaid ? "amber" : "soft"}>
                          {s.isPaid ? "paid" : "organic"}
                        </HandoffBadge>
                        <span className="font-mono text-[10px] text-ink-tertiary">
                          {s.channelType} · {pct}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[13px] text-ink tabular-nums">
                        {s.leads}
                      </div>
                      <div className="font-mono text-[9.5px] text-ink-tertiary">
                        {s.reservations} res
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] text-ink-secondary tabular-nums">
                      {s.cplMinor != null
                        ? formatMoneyMinor(s.cplMinor, s.currency, {
                            compact: true,
                          })
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent leads */}
        <section className="min-w-0 lg:border-l lg:border-line-soft lg:pl-7">
          <h3 className="display text-[22px] font-normal text-ink mb-3">
            Recent leads <span className="text-amber italic">· {leads.length}</span>
          </h3>
          {leads.length === 0 ? (
            <EmptyState
              variant="first-run"
              inline
              title="No leads captured yet"
              body="Inbound enquiries appear here as they are tagged to a source and campaign."
            />
          ) : (
            <div className="bg-surface border border-line-soft rounded-[12px] overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                    <th className="text-left px-4 py-2.5 font-medium">lead</th>
                    <th className="text-left px-3 py-2.5 font-medium">source</th>
                    <th className="text-left px-3 py-2.5 font-medium">status</th>
                    <th className="text-right px-3 py-2.5 font-medium">value</th>
                    <th className="text-right px-4 py-2.5 font-medium">created</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr
                      key={l.leadCode}
                      className="border-b border-line-soft last:border-b-0 hover:bg-cream-warm"
                    >
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink">
                        {l.leadCode}
                        {l.campaignCode && (
                          <span className="block text-[9.5px] text-ink-tertiary">
                            {l.campaignCode}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-ink-secondary">
                        {l.sourceLabel || l.leadSourceKey || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <HandoffBadge tone={lifecycleTone(l.lifecycleStatus)}>
                          {l.lifecycleStatus}
                        </HandoffBadge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                        {l.estimatedValueMinor && l.estimatedValueMinor !== "0"
                          ? formatMoneyMinor(
                              Number(l.estimatedValueMinor),
                              l.currency || "IDR",
                              { compact: true },
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[10.5px] text-ink-tertiary whitespace-nowrap">
                        {formatDate(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
