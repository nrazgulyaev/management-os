import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listDirectBookingDeposits } from "@/features/direct-booking/deposits";
import { adminDepositStatusLabel } from "@/features/direct-booking/deposits-pure";
import { ExpireDepositNowButton } from "@/components/direct-booking/reconcile-buttons";

export const metadata = { title: "Deposits" };
export const dynamic = "force-dynamic";

export default async function DepositsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  type DepStatus = Parameters<typeof adminDepositStatusLabel>[0];
  const status = (sp.status as DepStatus | undefined) || undefined;
  const rows = await listDirectBookingDeposits({ status, limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Deposits" },
        ]}
        title="Direct booking deposits"
        description="Each deposit is the gate that lets a confirmed booking issue. Manual stub today; future Stripe / Xendit integrations are additive."
      />
      <Section eyebrow="Catalog" title={`${rows.length} deposits`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Balance due</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">
                    No deposits yet.
                  </td>
                </tr>
              )}
              {rows.map(({ deposit, requestCode }) => {
                const lab = adminDepositStatusLabel(deposit.status as DepStatus);
                const isPending =
                  deposit.status === "pending" ||
                  deposit.status === "draft" ||
                  deposit.status === "requires_action";
                const isExpired =
                  deposit.expiresAt &&
                  deposit.expiresAt.getTime() <= Date.now();
                return (
                  <tr key={deposit.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/dashboard/direct-bookings/deposits/${deposit.id}`}
                        className="text-ink hover:underline underline-offset-4"
                      >
                        {deposit.depositCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{requestCode ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(deposit.amountMinor / 100n).toString()}.
                      {String(deposit.amountMinor % 100n).padStart(2, "0")}{" "}
                      {deposit.currency}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(deposit.balanceDueMinor / 100n).toString()}.
                      {String(deposit.balanceDueMinor % 100n).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                      {deposit.expiresAt?.toISOString() ?? "—"}
                      {isPending && isExpired && (
                        <Badge tone="warning" className="ml-1">expired</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={lab.tone}>{lab.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {isPending && <ExpireDepositNowButton id={deposit.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
