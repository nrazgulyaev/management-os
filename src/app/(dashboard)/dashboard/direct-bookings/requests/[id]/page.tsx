import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getRequestDetailById } from "@/features/direct-booking/services";
import { getDepositForRequest } from "@/features/direct-booking/deposits";
import { adminDepositStatusLabel } from "@/features/direct-booking/deposits-pure";
import {
  ApproveRequestForm,
  ConvertToBookingButton,
  MarkUnderReviewButton,
  RejectRequestForm,
} from "@/components/direct-booking/admin-buttons";
import {
  CancelDepositButton,
  CreateOrRecreateSessionButton,
  MarkDepositFailedForm,
  MarkDepositPaidButton,
  RefundDepositPlaceholderButton,
} from "@/components/direct-booking/deposit-buttons";
import { PostRevenueButton } from "@/components/direct-booking/reconcile-buttons";
import {
  calculateBalanceDue,
  directBookingFinanceStatusLabel,
} from "@/features/direct-booking/finance-pure";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingGuestStatusSnapshots,
  directBookingGuestNotifications,
  directBookingGuestMessageThreads,
} from "@/lib/db/schema/direct-booking-guest";

export const metadata = { title: "Direct booking request" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "info" | "success" | "warning" | "neutral" | "danger"> = {
  submitted: "info",
  under_review: "info",
  approved: "success",
  rejected: "warning",
  expired: "warning",
  cancelled: "neutral",
  converted: "success",
};

export default async function DirectBookingRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRequestDetailById(id);
  if (!detail) notFound();
  const { request: r, hold, villaCode, events, booking } = detail;
  const deposit = await getDepositForRequest(r.id);
  const db = getDb();
  let guestSnapshot: typeof directBookingGuestStatusSnapshots.$inferSelect | null =
    null;
  let lastGuestNotification:
    | typeof directBookingGuestNotifications.$inferSelect
    | null = null;
  let guestThread:
    | typeof directBookingGuestMessageThreads.$inferSelect
    | null = null;
  if (db) {
    const [snap] = await db
      .select()
      .from(directBookingGuestStatusSnapshots)
      .where(eq(directBookingGuestStatusSnapshots.holdId, r.holdId))
      .limit(1);
    guestSnapshot = snap ?? null;
    const [latest] = await db
      .select()
      .from(directBookingGuestNotifications)
      .where(eq(directBookingGuestNotifications.requestId, r.id))
      .orderBy(directBookingGuestNotifications.createdAt)
      .limit(1);
    lastGuestNotification = latest ?? null;
    const [thread] = await db
      .select()
      .from(directBookingGuestMessageThreads)
      .where(eq(directBookingGuestMessageThreads.requestId, r.id))
      .limit(1);
    guestThread = thread ?? null;
  }
  const depositLab = deposit
    ? adminDepositStatusLabel(
        deposit.status as Parameters<typeof adminDepositStatusLabel>[0],
      )
    : null;
  const depositIsPayable =
    deposit &&
    (deposit.status === "draft" ||
      deposit.status === "pending" ||
      deposit.status === "requires_action");
  const depositIsPaid =
    deposit &&
    (deposit.status === "paid" || deposit.status === "manually_marked_paid");
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Requests", href: "/dashboard/direct-bookings/requests" },
          { label: r.requestCode },
        ]}
        title={r.requestCode}
        description={`${villaCode ?? "—"} · ${hold?.checkIn ?? "—"} → ${hold?.checkOut ?? "—"}`}
        actions={
          <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
            {r.status.replace("_", " ")}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Section eyebrow="Guest" title={`${r.guestFirstName} ${r.guestLastName ?? ""}`}>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Pair label="Email" value={r.guestEmail} mono />
              <Pair label="Phone" value={r.guestPhone ?? "—"} mono />
              <Pair label="Country" value={r.guestCountry ?? "—"} />
              <Pair label="Guest count" value={String(r.guestCount)} />
              <Pair label="Arrival time" value={r.arrivalTime ?? "—"} />
              <Pair label="Purpose" value={r.purposeOfStay ?? "—"} />
            </dl>
            {r.specialRequests && (
              <p className="mt-3 text-sm text-ink-secondary">
                {r.specialRequests}
              </p>
            )}
          </Section>

          <Section eyebrow="Quote snapshot" title="Captured at hold time">
            {hold ? (
              <pre className="rounded-md border border-line-soft bg-canvas p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(hold.quoteSnapshotJson, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-ink-tertiary">Hold no longer exists.</p>
            )}
          </Section>

          <Section eyebrow="Timeline" title={`${events.length} events`}>
            {events.length === 0 ? (
              <p className="text-xs text-ink-tertiary">No events yet.</p>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {events.map((e) => (
                  <li key={e.id} className="px-4 py-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink font-medium">
                        {e.eventType.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] font-mono text-ink-tertiary">
                        {e.createdAt.toISOString()}
                      </span>
                    </div>
                    <span className="text-xs text-ink-tertiary capitalize">
                      {e.actorType}
                      {e.message ? ` — ${e.message}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section eyebrow="Decision" title="Concierge actions">
            <div className="flex flex-col gap-3">
              {r.status === "submitted" && <MarkUnderReviewButton id={r.id} />}
              {(r.status === "submitted" || r.status === "under_review") && (
                <>
                  <ApproveRequestForm id={r.id} />
                  <RejectRequestForm id={r.id} />
                </>
              )}
              {(r.status === "approved" || r.status === "submitted" || r.status === "under_review") && (
                <ConvertToBookingButton id={r.id} />
              )}
            </div>
          </Section>

          <Section eyebrow="Deposit" title="Payment gate">
            {deposit && depositLab ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/dashboard/direct-bookings/deposits/${deposit.id}`}
                      className="font-mono text-xs text-ink hover:underline underline-offset-4"
                    >
                      {deposit.depositCode}
                    </Link>
                    <Badge tone={depositLab.tone}>{depositLab.label}</Badge>
                  </div>
                  <span className="text-xs text-ink-tertiary">
                    {(deposit.amountMinor / 100n).toString()}.
                    {String(deposit.amountMinor % 100n).padStart(2, "0")}{" "}
                    {deposit.currency} · {deposit.providerKey}
                  </span>
                  {deposit.paymentUrl && (
                    <span className="font-mono text-[10px] text-ink-tertiary break-all">
                      {deposit.paymentUrl}
                    </span>
                  )}
                </div>
                <CreateOrRecreateSessionButton
                  requestId={r.id}
                  totalMinor={hold?.totalMinor.toString() ?? "0"}
                  currency={hold?.currency ?? "USD"}
                />
                {depositIsPayable && (
                  <>
                    <MarkDepositPaidButton id={deposit.id} />
                    <MarkDepositFailedForm id={deposit.id} />
                    <CancelDepositButton id={deposit.id} />
                  </>
                )}
                {depositIsPaid && (
                  <RefundDepositPlaceholderButton id={deposit.id} />
                )}
              </div>
            ) : (
              <CreateOrRecreateSessionButton
                requestId={r.id}
                totalMinor={hold?.totalMinor.toString() ?? "0"}
                currency={hold?.currency ?? "USD"}
              />
            )}
          </Section>

          <Section eyebrow="Finance" title="Reconciliation">
            <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-tertiary">Bridge status</span>
                <Badge
                  tone={
                    directBookingFinanceStatusLabel(
                      r.financeBridgeStatus as Parameters<
                        typeof directBookingFinanceStatusLabel
                      >[0],
                    ).tone
                  }
                >
                  {
                    directBookingFinanceStatusLabel(
                      r.financeBridgeStatus as Parameters<
                        typeof directBookingFinanceStatusLabel
                      >[0],
                    ).label
                  }
                </Badge>
              </div>
              {hold && deposit && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-tertiary">Balance due</span>
                  <span className="font-mono">
                    {(
                      calculateBalanceDue(hold.totalMinor, deposit.amountMinor) /
                      100n
                    ).toString()}
                    .
                    {String(
                      calculateBalanceDue(hold.totalMinor, deposit.amountMinor) %
                        100n,
                    ).padStart(2, "0")}{" "}
                    {hold.currency}
                  </span>
                </div>
              )}
              {r.financeLinkId && (
                <Link
                  href={`/dashboard/direct-bookings/reconciliation/${r.financeLinkId}`}
                  className="text-ink hover:underline underline-offset-4"
                >
                  Open finance link →
                </Link>
              )}
            </div>
            {r.status === "converted" && depositIsPaid && (
              <div className="mt-3">
                <PostRevenueButton requestId={r.id} />
              </div>
            )}
          </Section>

          {(guestSnapshot || lastGuestNotification || guestThread) && (
            <Section eyebrow="Guest status" title="What the guest sees">
              <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1 text-xs">
                {guestSnapshot && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-tertiary">Public stage</span>
                      <Badge tone="info">
                        {guestSnapshot.publicStage.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="text-ink">{guestSnapshot.headline}</div>
                  </>
                )}
                {lastGuestNotification && (
                  <div className="text-ink-tertiary">
                    Last guest update:{" "}
                    <span className="text-ink">
                      {lastGuestNotification.publicTitle}
                    </span>
                  </div>
                )}
                {guestThread && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-tertiary">Unread (staff)</span>
                    {guestThread.staffUnreadCount > 0 ? (
                      <Badge tone="warning">
                        {guestThread.staffUnreadCount}
                      </Badge>
                    ) : (
                      <span className="text-ink-tertiary">0</span>
                    )}
                  </div>
                )}
                {guestThread && (
                  <Link
                    href={`/dashboard/direct-bookings/messages/${guestThread.id}`}
                    className="text-ink hover:underline underline-offset-4"
                  >
                    Open thread →
                  </Link>
                )}
                {guestSnapshot && (
                  <Link
                    href={`/dashboard/direct-bookings/guest-status/${guestSnapshot.id}`}
                    className="text-ink hover:underline underline-offset-4"
                  >
                    Open snapshot →
                  </Link>
                )}
              </div>
            </Section>
          )}

          {booking && (
            <Section eyebrow="Booking" title="Linked booking">
              <Link
                href={`/dashboard/bookings/${booking.id}`}
                className="text-sm text-ink hover:underline underline-offset-4"
              >
                {booking.bookingCode} ({booking.status})
              </Link>
            </Section>
          )}

          {r.decisionNote && (
            <Section eyebrow="Notes" title="Decision note">
              <p className="text-xs text-ink-tertiary">{r.decisionNote}</p>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</dd>
    </div>
  );
}
