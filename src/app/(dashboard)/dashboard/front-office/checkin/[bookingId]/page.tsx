import { notFound } from "next/navigation";
import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getBookingDetail } from "@/features/bookings/booking-detail-queries";
import {
  getCheckinFlowState,
  getIssuedDoorCode,
} from "@/features/front-office/queries";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { CheckinClient } from "./_checkin-client";

export const metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";

/**
 * Counter check-in — the 4-step tablet wizard (identity → stay → sign →
 * handover) that issues a villa door code on completion. Mounts the
 * previously-orphaned CheckinFlow + IdOcrPreview and persists the flow +
 * code (migration 0123). The arrivals board's single-shot "Check in" button
 * stays for quick desk flips; this is the full guided flow.
 */
export default async function CheckinPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const booking = await getBookingDetail(bookingId);
  if (!booking) notFound();

  const [flow, issued, me] = await Promise.all([
    getCheckinFlowState(bookingId),
    getIssuedDoorCode(bookingId),
    getCurrentAppUser(),
  ]);

  const pax =
    booking.adults != null || booking.children != null
      ? `${booking.adults ?? 0} adults · ${booking.children ?? 0} children`
      : "—";

  const alreadyDone = !!issued?.completedAt;
  const villaLabel = booking.villaName ?? booking.villaCode ?? "—";

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> /{" "}
            <Link href="/dashboard/front-office/arrivals">Arrivals</Link> / <span>Check-in</span>
          </div>
          <h1>Counter check-in</h1>
        </div>
        <div className="actions">
          <Link href="/dashboard/front-office/arrivals" className="btn btn-secondary btn-sm">
            Arrivals
          </Link>
        </div>
      </div>

      <div className="section-heading mt-6">
        <h2>
          {booking.guestName ?? "Guest"} · {villaLabel}
        </h2>
      </div>

      {alreadyDone ? (
        <div className="card card-pad max-w-md flex flex-col gap-3 border-l-2 border-l-[var(--ok)]">
          <div className="flex items-center gap-2">
            <HandoffBadge tone="ok">Checked in</HandoffBadge>
            <span className="text-sm text-ink-3">
              {issued?.completedAt
                ? new Date(issued.completedAt).toLocaleString("en-GB")
                : ""}
            </span>
          </div>
          <div>
            <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-4 mb-2">
              Issued door code
            </div>
            <div className="fo-keycode">{issued?.doorCode ?? "—"}</div>
          </div>
        </div>
      ) : (
        <div className="max-w-xl">
          <CheckinClient
            bookingId={bookingId}
            staffUserId={me?.id ?? ""}
            initialState={flow}
            issuedDoorCode={issued?.doorCode ?? null}
            booking={{
              guestName: booking.guestName ?? "Guest",
              villaName: villaLabel,
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              pax,
            }}
          />
        </div>
      )}
    </>
  );
}
