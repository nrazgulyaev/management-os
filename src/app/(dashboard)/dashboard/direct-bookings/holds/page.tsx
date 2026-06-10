import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listDirectBookingHolds } from "@/features/direct-booking/services";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";

export const metadata = { title: "Direct booking holds" };
export const dynamic = "force-dynamic";

export default async function DirectBookingHoldsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const status = (sp.status as
    | "active"
    | "converted"
    | "expired"
    | "cancelled"
    | "rejected"
    | undefined) || undefined;
  const rows = await listDirectBookingHolds({ status, limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Holds" },
        ]}
        title="Direct booking holds"
        description="Each hold is a 15-minute inventory reservation — taken from a public quote, or placed by an operator on behalf of a guest."
        actions={
          <Link
            href="/dashboard/direct-bookings/new"
            className="btn btn-accent btn-sm"
          >
            + New direct booking
          </Link>
        }
      />
      <Section eyebrow="Catalog" title={`${rows.length} holds`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Villa</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">
                    No holds match the filter.
                  </td>
                </tr>
              )}
              {rows.map(({ hold, villaCode }) => {
                const lab = adminHoldStatusLabel(
                  hold.status as Parameters<typeof adminHoldStatusLabel>[0],
                );
                return (
                  <tr key={hold.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/dashboard/direct-bookings/holds/${hold.id}`}
                        className="text-ink hover:underline underline-offset-4"
                      >
                        {hold.holdCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">{villaCode ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {hold.checkIn} → {hold.checkOut} · {hold.nights}n
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(hold.totalMinor / 100n).toString()}.
                      {String(hold.totalMinor % 100n).padStart(2, "0")} {hold.currency}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={lab.tone}>{lab.label}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                      {hold.expiresAt.toISOString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/direct-bookings/${hold.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        View →
                      </Link>
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
