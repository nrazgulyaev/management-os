import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listGuestServiceFulfilments } from "@/features/service-fulfilment/services";
import {
  guestFacingFulfilmentStatus,
  type FulfilmentStatus,
} from "@/features/service-fulfilment/status-pure";

export const metadata = { title: "Fulfilments" };
export const dynamic = "force-dynamic";

export default async function FulfilmentsListPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; vendor?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const status =
    (sp.status as FulfilmentStatus | undefined) || undefined;
  const rows = await listGuestServiceFulfilments({
    status,
    vendorId: sp.vendor || undefined,
    limit: 200,
  });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/service-fulfilment">Service fulfilment</Link> /{" "}
            <span>Fulfilments</span>
          </div>
          <h1>Fulfilments</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Each row is one (order, fulfilment) pair. Triage / dispatch / track from here.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Queue</div>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Guest sees</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No fulfilments match the filter.
                  </td>
                </tr>
              )}
              {rows.map(({ fulfilment: f, service, vendor }) => {
                const guest = guestFacingFulfilmentStatus(
                  f.status as FulfilmentStatus,
                );
                return (
                  <tr key={f.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/dashboard/service-fulfilment/fulfilments/${f.id}`}
                        className="text-ink hover:underline underline-offset-4"
                      >
                        {f.fulfilmentCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {service?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {vendor?.displayName ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {f.scheduledFor?.toISOString() ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <HandoffBadge tone="soft">{f.status}</HandoffBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {guest.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
