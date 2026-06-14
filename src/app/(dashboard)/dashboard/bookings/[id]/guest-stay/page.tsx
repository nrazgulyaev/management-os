import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getBookingById } from "@/features/bookings/services";
import { listTokensForBooking } from "@/features/guest-stays/services";
import { getActiveStubLockForBooking } from "@/features/guest-stays/smart-lock-stub";
import { IssueTokenForm } from "@/components/guest-stays/issue-token-form";
import { RevokeTokenButton } from "@/components/guest-stays/revoke-token-button";
import Link from "next/link";
import { listOrdersForBooking } from "@/features/guest-services/services";
import { formatMinorMoney } from "@/features/guest-services/pricing";
import {
  ORDER_STATUS_LABELS,
  toneForStatus,
  type OrderStatus,
} from "@/features/guest-services/status";
import { listVerificationsForToken } from "@/features/guest-stays/verification";

export const metadata = { title: "Guest stay · Booking" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "ok" | "warn" | "danger" | "gold" | "info" | "soft" | "ink" | "amber"> = {
  active: "ok",
  revoked: "warn",
  expired: "soft",
};

/** Map the shared legacy tone vocabulary (toneForStatus) onto handoff badge tones. */
const LEGACY_TONE_TO_HANDOFF: Record<
  "neutral" | "info" | "warning" | "success" | "danger",
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  neutral: "soft",
  info: "info",
  warning: "warn",
  success: "ok",
  danger: "danger",
};

export default async function BookingGuestStayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking) notFound();
  const [tokens, lock, orders] = await Promise.all([
    listTokensForBooking(id),
    getActiveStubLockForBooking(id),
    listOrdersForBooking(id),
  ]);
  const active = tokens.find((t) => t.status === "active");
  const verifications = active
    ? await listVerificationsForToken(active.id)
    : [];
  const latestVerification = verifications[0];

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href={`/dashboard/bookings/${id}`}>{booking.bookingCode}</Link> /{" "}
            <span>Guest stay</span>
          </div>
          <h1>Guest stay</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${booking.villaCode ?? "villa"} · ${booking.checkIn} → ${booking.checkOut}`}
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Token — {active ? "Active token" : "No active token"}</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          {active
            ? "The raw token was shown once, at issue time. To replace it, revoke and re-issue."
            : "Issue a fresh signed token to share the /stay/[token] URL with the guest."}
        </p>
        {active ? (
          <Card padding="default">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Status
                </div>
                <div className="mt-1">
                  <HandoffBadge tone={STATUS_TONES[active.status] ?? "soft"}>
                    {active.status}
                  </HandoffBadge>
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Prefix
                </div>
                <div className="mt-1 font-mono text-[12px]">{active.tokenPrefix}…</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Expires
                </div>
                <div className="mt-1 tabular-nums">
                  {active.expiresAt.slice(0, 16).replace("T", " ")}
                </div>
              </div>
              <div className="md:col-span-1 flex items-end">
                <RevokeTokenButton id={active.id} />
              </div>
            </div>
          </Card>
        ) : (
          <Card padding="default">
            <IssueTokenForm bookingId={id} />
          </Card>
        )}
      </div>

      {active && (
        <div>
          <div className="label mb-2.5">
            Verification —{" "}
            {latestVerification
              ? `Latest: ${latestVerification.status}`
              : "No verifications yet"}
          </div>
          <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
            Guests must enter a one-time code on their first visit. Codes expire
            in 10 minutes; max 5 attempts each. The raw code is never persisted —
            only its hash.
          </p>
          {latestVerification ? (
            <Card padding="default">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    Status
                  </div>
                  <div className="mt-1">
                    <HandoffBadge
                      tone={
                        latestVerification.status === "verified"
                          ? "ok"
                          : latestVerification.status === "pending"
                            ? "info"
                            : latestVerification.status === "failed"
                              ? "danger"
                              : "soft"
                      }
                    >
                      {latestVerification.status}
                    </HandoffBadge>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    Channel
                  </div>
                  <div className="mt-1 capitalize">
                    {latestVerification.channel}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    Recipient
                  </div>
                  <div className="mt-1 text-ink-secondary text-xs">
                    {latestVerification.recipientMasked ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    Attempts
                  </div>
                  <div className="mt-1 font-mono tabular-nums">
                    {latestVerification.attempts}/{latestVerification.maxAttempts}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="default">
              <p className="text-sm text-ink-tertiary m-0">
                No code issued yet. The guest will receive one when they first
                visit the stay link.
              </p>
            </Card>
          )}
        </div>
      )}

      {tokens.length > 0 && (
        <div>
          <div className="label mb-2.5">History — {tokens.length} token(s) ever issued</div>
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Prefix</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Access</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Issued to</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-[11px] text-ink-tertiary">
                      {t.tokenPrefix}…
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONES[t.status] ?? "soft"}>
                        {t.status}
                      </HandoffBadge>
                    </td>
                    <td className="num tabular-nums text-ink-tertiary">
                      {t.accessCount}
                    </td>
                    <td className="text-ink-tertiary tabular-nums">
                      {t.expiresAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="text-ink-secondary text-xs">
                      {t.issuedToEmail ?? t.issuedToPhone ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">
          Concierge — {orders.length} guest service order{orders.length === 1 ? "" : "s"}
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Orders placed from /stay/[token]/services for this booking.
        </p>
        {orders.length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary m-0">No orders yet.</p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Service</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col">Bridge</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono text-[11px]">
                      {o.orderCode}
                    </td>
                    <td className="text-ink-secondary">
                      {o.serviceName ?? "—"}
                    </td>
                    <td>
                      <HandoffBadge tone={LEGACY_TONE_TO_HANDOFF[toneForStatus(o.status as OrderStatus)]}>
                        {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                      </HandoffBadge>
                    </td>
                    <td className="num font-mono tabular-nums">
                      {formatMinorMoney(o.guestPriceMinor, o.currency)}
                    </td>
                    <td className="text-[11px] text-ink-tertiary">
                      {o.financeBridgeStatus}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/guest-services/orders/${o.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Smart lock — Stub access code</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Demo only — no real lock APIs are called. The code is visible to the
          guest from check-in − 24 h to check-out + 3 h.
        </p>
        {lock ? (
          <Card padding="default">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Code (admin view)
                </div>
                <div className="mt-1 font-mono text-lg tracking-widest">
                  {lock.codeDisplay ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Source
                </div>
                <div className="mt-1">
                  <HandoffBadge tone="soft">{lock.source}</HandoffBadge>
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Valid from
                </div>
                <div className="mt-1 tabular-nums">
                  {lock.validFrom.slice(0, 16).replace("T", " ")}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Valid until
                </div>
                <div className="mt-1 tabular-nums">
                  {lock.validUntil.slice(0, 16).replace("T", " ")}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary m-0">
              Stub created automatically when a token is issued. No active stub yet.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
