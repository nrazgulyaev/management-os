import type { Metadata } from "next";
import Link from "next/link";
import {
  SectionHeading,
  Kpi,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { listLeadSources } from "@/lib/development/server/lead-sources/lead-source-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { LeadSourceModalForm } from "@/components/development/sales/lead-source-modal-form";
import { DevOsRowActions } from "@/components/development/dev-os-row-actions";

/**
 * Lead-source registry — DS restyle to the dev-marketing.html chrome
 * (SectionHeading + Kpi strip + DS table) replacing the legacy
 * PageHeader/Section shell. Data wiring preserved verbatim:
 *   - listLeadSources()      → registry table
 *   - LeadSourceModalForm    → create action (header + empty state)
 *   - DevOsRowActions        → per-row edit/archive actions
 * Same columns (key · display name · channel type · platform · paid ·
 * active) and the same per-key detail links.
 */

export const metadata: Metadata = { title: "Lead sources · Marketing" };
export const dynamic = "force-dynamic";

export default async function LeadSourcesPage() {
  const sources = await safeQuery("leadSources", listLeadSources(), []);
  const paidCount = sources.filter((s) => s.isPaid).length;
  const activeCount = sources.filter((s) => s.isActive).length;
  const channelTypes = new Set(sources.map((s) => s.channelType)).size;

  return (
    <>
      <SectionHeading
        eyebrow="workspace / marketing / lead-sources"
        title={
          <>
            Lead sources.{" "}
            <span className="text-amber">Every channel, registered.</span>
          </>
        }
        subtitle={`${sources.length} channel(s) tagging inbound enquiries. Pre-seeded with 14 defaults; add custom channels as needed.`}
        actions={
          <>
            <LeadSourceModalForm />
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
          label="Sources"
          value={String(sources.length)}
          sub={`${channelTypes} channel type(s)`}
        />
        <Kpi
          label="Active"
          value={String(activeCount)}
          sub={`${sources.length - activeCount} inactive`}
          tone={activeCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Paid"
          value={String(paidCount)}
          tone={paidCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Organic" value={String(sources.length - paidCount)} />
      </div>

      {sources.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No lead sources yet"
          body="Lead sources tag every inbound enquiry by channel. Pre-seeded with 14 defaults; add custom channels as needed."
          actions={<LeadSourceModalForm />}
        />
      ) : (
        <div className="bg-surface border border-line-soft rounded-[12px] overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                <th className="text-left px-4 py-2.5 font-medium">key</th>
                <th className="text-left px-3 py-2.5 font-medium">
                  display name
                </th>
                <th className="text-left px-3 py-2.5 font-medium">
                  channel type
                </th>
                <th className="text-left px-3 py-2.5 font-medium">platform</th>
                <th className="text-left px-3 py-2.5 font-medium">paid</th>
                <th className="text-left px-3 py-2.5 font-medium">active</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-cream-warm"
                >
                  <td className="px-4 py-2.5 font-mono text-[11px] text-ink">
                    <Link
                      href={`/development-os/marketing/lead-sources/${s.sourceKey}`}
                      prefetch={false}
                      className="hover:underline"
                    >
                      {s.sourceKey}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-ink">
                    {s.displayName}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-secondary">
                    {s.channelType}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-secondary">
                    {s.platform ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <HandoffBadge tone={s.isPaid ? "amber" : "soft"}>
                      {s.isPaid ? "paid" : "organic"}
                    </HandoffBadge>
                  </td>
                  <td className="px-3 py-2.5">
                    <HandoffBadge tone={s.isActive ? "ok" : "soft"}>
                      {s.isActive ? "active" : "inactive"}
                    </HandoffBadge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DevOsRowActions
                      kind="lead_source"
                      row={{
                        id: s.id,
                        altId: s.sourceKey,
                        displayName: s.displayName,
                        detailHref: `/development-os/marketing/lead-sources/${s.sourceKey}`,
                        values: {
                          displayName: s.displayName,
                          channelType: s.channelType,
                          platform: s.platform ?? "",
                          isPaid: s.isPaid,
                          defaultAttributionModel:
                            s.defaultAttributionModel ?? "",
                        },
                      }}
                    />
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
