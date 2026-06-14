import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listGuestServiceFulfilments } from "@/features/service-fulfilment/services";
import { formatFulfilmentAmountForAdmin } from "@/features/service-fulfilment/pricing-pure";
import {
  BridgeFulfilmentButton,
  BridgePendingButton,
} from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Service fulfilment — finance bridge" };
export const dynamic = "force-dynamic";

export default async function FinanceBridgePage() {
  const completed = await listGuestServiceFulfilments({
    status: "completed",
    limit: 200,
  });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/service-fulfilment">Service fulfilment</Link> /{" "}
            <span>Finance bridge</span>
          </div>
          <h1>Finance bridge</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Bridge completed fulfilments into revenue + expense lines. Idempotent: re-running on a bridged row is a no-op.
          </p>
        </div>
        <div className="actions">
          <BridgePendingButton />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Completed</div>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Fulfilment</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Guest price</th>
                <th className="px-4 py-3">Internal cost</th>
                <th className="px-4 py-3">Margin</th>
                <th className="px-4 py-3">Bridge</th>
              </tr>
            </thead>
            <tbody>
              {completed.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-tertiary">
                    No completed fulfilments to bridge.
                  </td>
                </tr>
              )}
              {completed.map(({ fulfilment: f, service }) => (
                <tr key={f.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/dashboard/service-fulfilment/fulfilments/${f.id}`}
                      className="text-ink hover:underline"
                    >
                      {f.fulfilmentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{service?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatFulfilmentAmountForAdmin(f.guestPriceMinor, f.currency)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatFulfilmentAmountForAdmin(f.internalCostMinor, f.currency)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatFulfilmentAmountForAdmin(f.marginMinor, f.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <BridgeFulfilmentButton fulfilmentId={f.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-tertiary">
          Bridge writes a `revenue_lines` row for the guest price and an
          `expense_lines` row for the internal cost (when both are positive).
          Period locks block the bridge with status{" "}
          <HandoffBadge tone="soft">skipped_locked_period</HandoffBadge>.
        </p>
      </div>
    </div>
  );
}
