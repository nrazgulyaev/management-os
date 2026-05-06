import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
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

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  active: "success",
  revoked: "warning",
  expired: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: booking.bookingCode, href: `/dashboard/bookings/${id}` },
          { label: "Guest stay" },
        ]}
        title="Guest stay"
        description={`${booking.villaCode ?? "villa"} · ${booking.checkIn} → ${booking.checkOut}`}
      />

      <Section
        eyebrow="Token"
        title={active ? "Active token" : "No active token"}
        description={
          active
            ? "The raw token was shown once, at issue time. To replace it, revoke and re-issue."
            : "Issue a fresh signed token to share the /stay/[token] URL with the guest."
        }
      >
        {active ? (
          <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                Status
              </div>
              <div className="mt-1">
                <Badge tone={STATUS_TONES[active.status] ?? "neutral"}>
                  {active.status}
                </Badge>
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
        ) : (
          <IssueTokenForm bookingId={id} />
        )}
      </Section>

      {active && (
        <Section
          eyebrow="Verification"
          title={
            latestVerification
              ? `Latest: ${latestVerification.status}`
              : "No verifications yet"
          }
          description="Guests must enter a one-time code on their first visit. Codes expire in 10 minutes; max 5 attempts each. The raw code is never persisted — only its hash."
        >
          {latestVerification ? (
            <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  Status
                </div>
                <div className="mt-1">
                  <Badge
                    tone={
                      latestVerification.status === "verified"
                        ? "success"
                        : latestVerification.status === "pending"
                          ? "info"
                          : latestVerification.status === "failed"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {latestVerification.status}
                  </Badge>
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
          ) : (
            <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
              No code issued yet. The guest will receive one when they first
              visit the stay link.
            </p>
          )}
        </Section>
      )}

      {tokens.length > 0 && (
        <Section eyebrow="History" title={`${tokens.length} token(s) ever issued`}>
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Prefix</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Access</th>
                  <th className="text-left px-3 py-2">Expires</th>
                  <th className="text-left px-3 py-2">Issued to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {t.tokenPrefix}…
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[t.status] ?? "neutral"}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {t.accessCount}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {t.expiresAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {t.issuedToEmail ?? t.issuedToPhone ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section
        eyebrow="Concierge"
        title={`${orders.length} guest service order${orders.length === 1 ? "" : "s"}`}
        description="Orders placed from /stay/[token]/services for this booking."
      >
        {orders.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No orders yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Service</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-left px-3 py-2">Bridge</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {o.orderCode}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {o.serviceName ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={toneForStatus(o.status as OrderStatus)}>
                        {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatMinorMoney(o.guestPriceMinor, o.currency)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ink-tertiary">
                      {o.financeBridgeStatus}
                    </td>
                    <td className="px-3 py-2 text-right">
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
          </div>
        )}
      </Section>

      <Section
        eyebrow="Smart lock"
        title="Stub access code"
        description="Demo only — no real lock APIs are called. The code is visible to the guest from check-in − 24 h to check-out + 3 h."
      >
        {lock ? (
          <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                <Badge tone="neutral">{lock.source}</Badge>
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
        ) : (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Stub created automatically when a token is issued. No active stub yet.
          </p>
        )}
      </Section>
    </div>
  );
}
