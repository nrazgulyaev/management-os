import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { CancelHoldButton } from "@/components/direct-booking/admin-buttons";
import { CoverageStrip } from "@/components/direct-booking/coverage-strip";
import { requireOrgId } from "@/features/auth/require-org";
import { getDirectBookingDetailByHoldId } from "@/features/direct-booking/direct-booking-detail";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";
import { adminDepositStatusLabel } from "@/features/direct-booking/deposits-pure";
import { formatMinor, guestInitials } from "@/features/direct-booking/detail-pure";

export const metadata = { title: "Direct booking" };
export const dynamic = "force-dynamic";

const MGMT_LABELS: Record<string, string> = {
  individual: "Individual agreement",
  pooled: "Revenue pool",
  hybrid: "Hybrid agreement",
};

type LabelTone = "info" | "success" | "warning" | "neutral" | "danger";
function badgeTone(
  tone: LabelTone,
): "ok" | "warn" | "danger" | "info" | "soft" {
  switch (tone) {
    case "success":
      return "ok";
    case "warning":
      return "warn";
    case "danger":
      return "danger";
    case "info":
      return "info";
    default:
      return "soft";
  }
}

export default async function DirectBookingDetailPage({
  params,
}: {
  params: Promise<{ holdId: string }>;
}) {
  const { holdId } = await params;
  const organizationId = await requireOrgId();
  const detail = await getDirectBookingDetailByHoldId(holdId, organizationId);
  if (!detail) notFound();

  const {
    hold,
    request,
    villaName,
    villaCode,
    projectName,
    managementModel,
    nights,
    coverage,
    blockedSourceCount,
    deposit,
    booking,
  } = detail;

  const statusLab = adminHoldStatusLabel(
    hold.status as Parameters<typeof adminHoldStatusLabel>[0],
  );
  const depositLab = deposit
    ? adminDepositStatusLabel(
        deposit.status as Parameters<typeof adminDepositStatusLabel>[0],
      )
    : null;

  const guestName = request
    ? `${request.guestFirstName} ${request.guestLastName ?? ""}`.trim()
    : "Guest not captured";
  const blockOk = hold.status === "active" || hold.status === "converted";

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <Link href="/dashboard/direct-bookings/holds">Holds</Link> /{" "}
            <span>{hold.holdCode}</span>
          </div>
          <h1>
            {villaName ?? villaCode ?? "Direct booking"} · {hold.checkIn} →{" "}
            {hold.checkOut}
          </h1>
          <p className="text-[13px] text-ink-3 mt-2">
            {hold.holdCode} · {hold.nights} nights · {hold.guestCount} guest
            {hold.guestCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="actions">
          <HandoffBadge tone={badgeTone(statusLab.tone)}>
            {statusLab.label}
          </HandoffBadge>
          <HandoffBadge tone="info">direct</HandoffBadge>
          {hold.status === "active" && <CancelHoldButton id={hold.id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Guest */}
          <Card padding="default">
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink-tertiary mb-3">
              Guest
            </div>
            <div className="flex items-start gap-4">
              <div className="avatar avatar-lg" aria-hidden>
                {request
                  ? guestInitials(request.guestFirstName, request.guestLastName)
                  : "—"}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1">
                <div>
                  <div className="text-[16px] text-ink">{guestName}</div>
                  <div className="text-xs text-ink-tertiary mt-1">
                    {request?.guestCountry ?? "—"} · {hold.guestCount} guest
                    {hold.guestCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Contact
                  </div>
                  <div className="text-sm text-ink-secondary mt-1">
                    {request?.guestEmail ?? "—"}
                  </div>
                  <div className="text-sm text-ink-secondary">
                    {request?.guestPhone ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Request
                  </div>
                  {request ? (
                    <Link
                      href={`/dashboard/direct-bookings/requests/${request.id}`}
                      className="text-sm text-ink hover:underline underline-offset-4 mt-1 inline-block"
                    >
                      {request.requestCode} →
                    </Link>
                  ) : (
                    <div className="text-sm text-ink-tertiary mt-1">
                      Hold only — capture guest to open a request.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Stay + cross-channel coverage */}
          <Card padding="default">
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink-tertiary mb-3">
              Stay · {villaCode ?? villaName ?? "villa"}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <Kpi label="arrival" value={hold.checkIn} sub="check-in 15:00" />
              <Kpi
                label="departure"
                value={hold.checkOut}
                sub="check-out 11:00"
              />
              <Kpi label="nights" value={String(hold.nights)} sub="direct" />
              <Kpi
                label="ADR"
                value={formatMinor(hold.averageNightlyMinor, hold.currency)}
                sub="avg / night"
              />
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink-tertiary mb-2">
              Cross-channel coverage · stay window
            </div>
            <div className="overflow-x-auto">
              <CoverageStrip nights={nights} rows={coverage} />
            </div>
            <p className="mt-2 text-[10.5px] font-mono text-success">
              {blockedSourceCount > 0
                ? `Blocked across ${blockedSourceCount} other source${blockedSourceCount === 1 ? "" : "s"} · no overlap risk`
                : "Direct hold in place · push OTA blocks before confirming"}
            </p>
          </Card>

          {/* Pricing */}
          <Card padding="default">
            <div className="flex items-baseline gap-2 mb-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                Pricing
              </div>
              <span className="ml-auto">
                <HandoffBadge tone="ok">commission-free</HandoffBadge>
              </span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-line-soft">
                  <td className="py-2 text-ink-secondary">
                    Room · {hold.nights}n ×{" "}
                    {formatMinor(hold.averageNightlyMinor, hold.currency)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatMinor(hold.totalMinor, hold.currency)}
                  </td>
                </tr>
                <tr className="border-b border-line-soft">
                  <td className="py-2 text-success">– OTA fee (avoided)</td>
                  <td className="py-2 text-right font-mono text-success">
                    {formatMinor(0n, hold.currency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-[16px] text-ink">Total</td>
                  <td className="py-3 text-right text-[18px] font-mono text-ink">
                    {formatMinor(hold.totalMinor, hold.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>

        {/* Side rail */}
        <aside className="flex flex-col gap-6">
          {/* Deposit */}
          <div>
            <div className="label mb-2.5">Payments</div>
            {deposit && depositLab ? (
              <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/dashboard/direct-bookings/deposits/${deposit.id}`}
                    className="font-mono text-ink hover:underline underline-offset-4"
                  >
                    {deposit.depositCode}
                  </Link>
                  <HandoffBadge tone={badgeTone(depositLab.tone)}>
                    {depositLab.label}
                  </HandoffBadge>
                </div>
                <span className="font-mono text-ink-tertiary">
                  {formatMinor(deposit.amountMinor, deposit.currency)}
                </span>
                <span className="text-ink-tertiary">
                  Manual settlement · no card charged here.
                </span>
              </div>
            ) : (
              <p className="text-xs text-ink-tertiary">
                No deposit yet. A deposit opens when the guest request is
                submitted.
              </p>
            )}
          </div>

          {/* Concierge */}
          <div>
            <div className="label mb-2.5">Concierge</div>
            <Card padding="default">
              {request?.specialRequests ? (
                <p className="text-sm text-ink-secondary whitespace-pre-line m-0">
                  {request.specialRequests}
                </p>
              ) : (
                <p className="text-xs text-ink-tertiary m-0">
                  No concierge requests captured.
                </p>
              )}
              {request?.arrivalTime && (
                <p className="text-xs text-ink-tertiary mt-2 mb-0">
                  Arrival · {request.arrivalTime}
                </p>
              )}
            </Card>
          </div>

          {/* Owner statement context */}
          <div>
            <div className="label mb-2.5">Owner statement</div>
            <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1 text-xs">
              <div className="text-ink">
                Allocates to{" "}
                <span className="text-ink font-medium">
                  {villaName ?? villaCode ?? "this villa"}
                </span>
                {projectName ? ` · ${projectName}` : ""}
              </div>
              <div className="font-mono text-ink-tertiary">
                {managementModel
                  ? MGMT_LABELS[managementModel] ?? managementModel
                  : "Management model not set"}
              </div>
              <div className="font-mono text-ink-tertiary">
                Gross · {formatMinor(hold.totalMinor, hold.currency)} · posts to
                the {hold.checkIn.slice(0, 7)} statement on confirmation.
              </div>
            </div>
          </div>

          {/* Channel block status */}
          <div>
            <div className="label mb-2.5">Channels</div>
            <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1 text-xs">
              <div className="text-ink-secondary">
                Internal hold block on the villa calendar is{" "}
                <span className="text-ink font-medium">
                  {blockOk ? "active" : "released"}
                </span>
                .
              </div>
              <div className="font-mono text-ink-tertiary">
                {blockedSourceCount > 0
                  ? `${blockedSourceCount} other source${blockedSourceCount === 1 ? "" : "s"} block this window`
                  : "No other source blocks this window"}
              </div>
            </div>
          </div>

          {/* Linked booking */}
          {booking && (
            <div>
              <div className="label mb-2.5">Booking</div>
              <Card padding="default">
                <Link
                  href={`/dashboard/bookings/${booking.id}`}
                  className="text-sm text-ink hover:underline underline-offset-4"
                >
                  {booking.bookingCode} ({booking.status}) →
                </Link>
              </Card>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
