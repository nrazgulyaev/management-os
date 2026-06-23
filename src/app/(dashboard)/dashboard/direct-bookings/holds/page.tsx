import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listDirectBookingHolds } from "@/features/direct-booking/services";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";
import { requireOrgId } from "@/features/auth/require-org";

export const metadata = { title: "Direct booking holds" };
export const dynamic = "force-dynamic";

const LAB_TONE: Record<
  "info" | "success" | "warning" | "neutral" | "danger",
  "info" | "ok" | "warn" | "soft" | "danger"
> = {
  info: "info",
  success: "ok",
  warning: "warn",
  neutral: "soft",
  danger: "danger",
};

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
  const organizationId = await requireOrgId();
  const rows = await listDirectBookingHolds(organizationId, { status, limit: 200 });
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <span>Holds</span>
          </div>
          <h1>Direct booking holds</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Each hold is a 15-minute inventory reservation — taken from a public
            quote, or placed by an operator on behalf of a guest.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/direct-bookings/new"
            className="btn btn-accent btn-sm"
          >
            + New direct booking
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Catalog · {rows.length} holds</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Villa</th>
                <th scope="col">Dates</th>
                <th scope="col" className="num">Total</th>
                <th scope="col">Status</th>
                <th scope="col">Expires</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-ink-tertiary">
                    No holds match the filter.
                  </td>
                </tr>
              )}
              {rows.map(({ hold, villaCode }) => {
                const lab = adminHoldStatusLabel(
                  hold.status as Parameters<typeof adminHoldStatusLabel>[0],
                );
                return (
                  <tr key={hold.id}>
                    <td className="mono text-[12px]">
                      <Link
                        href={`/dashboard/direct-bookings/holds/${hold.id}`}
                        className="text-ink hover:text-terra"
                      >
                        {hold.holdCode}
                      </Link>
                    </td>
                    <td className="text-xs">{villaCode ?? "—"}</td>
                    <td className="text-xs">
                      {hold.checkIn} → {hold.checkOut} · {hold.nights}n
                    </td>
                    <td className="num mono text-[12px]">
                      {(hold.totalMinor / 100n).toString()}.
                      {String(hold.totalMinor % 100n).padStart(2, "0")} {hold.currency}
                    </td>
                    <td>
                      <HandoffBadge tone={LAB_TONE[lab.tone]}>
                        {lab.label}
                      </HandoffBadge>
                    </td>
                    <td className="mono text-[11px] text-ink-tertiary">
                      {hold.expiresAt.toISOString()}
                    </td>
                    <td className="text-right">
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
        </Card>
      </div>
    </>
  );
}
