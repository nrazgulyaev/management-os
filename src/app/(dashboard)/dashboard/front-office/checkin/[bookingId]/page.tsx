import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <>
      <PageHeader
        title="Counter check-in"
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/front-office/arrivals">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Arrivals
            </Link>
          </Button>
        }
      />
      <Section
        title={`${booking.guestName ?? "Guest"} · ${booking.villaName ?? booking.villaCode ?? "—"}`}
      >
        {alreadyDone ? (
          <div className="rounded-md border border-success/40 bg-success/5 p-5 flex flex-col gap-2 max-w-md">
            <div className="flex items-center gap-2">
              <Badge tone="success">Checked in</Badge>
              <span className="text-sm text-ink-secondary">
                {issued?.completedAt
                  ? new Date(issued.completedAt).toLocaleString("en-GB")
                  : ""}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary">
              Issued door code
            </div>
            <div className="text-3xl font-mono tracking-[0.3em] text-ink">
              {issued?.doorCode ?? "—"}
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
                villaName: booking.villaName ?? booking.villaCode ?? "—",
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
                pax,
              }}
            />
          </div>
        )}
      </Section>
    </>
  );
}
