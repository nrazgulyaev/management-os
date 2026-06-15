import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getOwnerBookingSummaryById,
  listOwnerBookingBreakdowns,
} from "@/features/owner-bookings/services";
import {
  publicStatusLabel,
  buildOwnerBookingTimelineStatus,
  type OwnerBookingPublicStatus,
} from "@/features/owner-bookings/calendar-pure";
import { formatOwnerRevenueExplanation } from "@/features/owner-bookings/revenue-pure";
import {
  RebuildBookingProjectionButton,
  RebuildDirectRequestProjectionButton,
} from "@/components/owner-bookings/projection-buttons";
import { formatMoneyMinor } from "@/lib/money";
import { requireOrgId } from "@/features/auth/require-org";

export const metadata = { title: "Owner booking projection — detail" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  OwnerBookingPublicStatus,
  "soft" | "info" | "warn" | "ok" | "danger" | "gold"
> = {
  inquiry: "soft",
  under_review: "info",
  deposit_pending: "warn",
  confirmed: "info",
  in_house: "ok",
  completed: "ok",
  cancelled: "soft",
  expired: "soft",
  blocked: "soft",
  maintenance: "warn",
  owner_stay: "gold",
};

export default async function AdminOwnerBookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getOwnerBookingSummaryById(id, {
    organizationId: await requireOrgId(),
  });
  if (!s) notFound();
  const breakdowns = await listOwnerBookingBreakdowns(s.id);
  const visible = breakdowns.filter((b) => b.ownerVisible);
  const explanation = formatOwnerRevenueExplanation(
    {
      sourceType: s.sourceType,
      publicStatus: s.publicStatus,
      revenuePosted: s.revenuePosted,
      statementId: s.statementId,
      totalAmountMinor: s.totalAmountMinor,
    },
    visible,
  );
  const timeline = buildOwnerBookingTimelineStatus({
    publicStatus: s.publicStatus,
    sourceType: s.sourceType,
  });
  const stale =
    s.sourceUpdatedAt &&
    new Date(s.sourceUpdatedAt).getTime() <
      Date.now() - 24 * 60 * 60 * 1000;
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            /{" "}
            <Link href="/dashboard/owner-intelligence/bookings">
              Booking projection
            </Link>{" "}
            / <span>{s.ownerLabel}</span>
          </div>
          <h1>{s.villaName ?? s.villaCode ?? "Booking projection"}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Owner {s.ownerId.slice(0, 8)}… · {s.checkIn} → {s.checkOut}
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            {s.bookingId && (
              <RebuildBookingProjectionButton bookingId={s.bookingId} />
            )}
            {s.directBookingRequestId && (
              <RebuildDirectRequestProjectionButton
                requestId={s.directBookingRequestId}
              />
            )}
            <HandoffBadge tone={STATUS_TONES[s.publicStatus]}>
              {publicStatusLabel(s.publicStatus)}
            </HandoffBadge>
          </div>
        </div>
      </div>
      {stale && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          The source row has been updated since the last projection rebuild.
          Click Rebuild above to refresh.
        </p>
      )}
      <div>
        <div className="label mb-2.5">Owner-safe projection</div>
        <Card padding="default">
          <h2 className="serif text-[18px] m-0">{timeline.headline}</h2>
          <p className="text-sm text-ink-secondary mt-1">{timeline.body}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mt-4">
          <KV label="Source" value={s.ownerLabel} />
          <KV label="Channel" value={s.channelLabel ?? "—"} />
          <KV label="Guest" value={s.guestLabel ?? "—"} />
          <KV label="Country" value={s.guestCountry ?? "—"} />
          <KV
            label="Total"
            value={
              s.totalAmountMinor !== null && s.currency
                ? formatMoneyMinor(s.totalAmountMinor, s.currency)
                : "—"
            }
          />
          <KV
            label="Owner revenue"
            value={
              s.ownerRevenueMinor !== null && s.currency
                ? formatMoneyMinor(s.ownerRevenueMinor, s.currency)
                : "—"
            }
          />
          <KV label="Revenue posted" value={s.revenuePosted ? "Yes" : "No"} />
          <KV
            label="Updated"
            value={
              s.sourceUpdatedAt
                ? new Date(s.sourceUpdatedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")
                : "—"
            }
          />
          </div>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Internal source trace</div>
        <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <Trace
            label="Booking"
            value={s.bookingId}
            href={s.bookingId ? `/dashboard/bookings/${s.bookingId}` : null}
          />
          <Trace
            label="Direct booking request"
            value={s.directBookingRequestId}
            href={
              s.directBookingRequestId
                ? `/dashboard/direct-bookings/requests/${s.directBookingRequestId}`
                : null
            }
          />
          <Trace
            label="Direct booking hold"
            value={s.directBookingHoldId}
            href={
              s.directBookingHoldId
                ? `/dashboard/direct-bookings/holds/${s.directBookingHoldId}`
                : null
            }
          />
          <Trace
            label="Statement"
            value={s.statementId}
            href={s.statementHref}
          />
          </div>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Revenue breakdown</div>
        <Card padding="default">
          <p className="text-sm text-ink-secondary">{explanation}</p>
          <div className="mt-4">
          {breakdowns.length === 0 ? (
            <p className="text-xs text-ink-tertiary">No breakdown rows.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {breakdowns.map((b, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] gap-4 text-xs"
                >
                  <div>
                    <div className="text-sm text-ink">{b.label}</div>
                    <div className="text-[11px] text-ink-tertiary capitalize">
                      {b.category.replace(/_/g, " ")} · {b.direction}{" "}
                      {!b.ownerVisible && (
                        <span className="text-warning">(internal only)</span>
                      )}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums">
                    {formatMoneyMinor(b.amountMinor, b.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}

function Trace({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href: string | null;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      {value ? (
        href ? (
          <Link
            href={href}
            className="block text-sm font-mono text-ink hover:underline underline-offset-4 mt-1 truncate"
          >
            {value.slice(0, 8)}…
          </Link>
        ) : (
          <span className="block text-sm font-mono text-ink mt-1">
            {value.slice(0, 8)}…
          </span>
        )
      ) : (
        <span className="block text-sm text-ink-tertiary mt-1">—</span>
      )}
    </div>
  );
}
